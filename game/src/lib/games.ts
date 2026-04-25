import { supabase } from './supabase';
import { getUsername, getUser } from './auth';
import type { GameRow, PlayerRole } from '../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';

export async function createGame(password?: string): Promise<GameRow> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const insert: any = {
        home_user_id: user.id,
        home_user_email: getUsername(user),
        status: 'waiting',
    };
    if (password) insert.password = password;

    const { data, error } = await supabase
        .from('games')
        .insert(insert)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getOpenGames(): Promise<GameRow[]> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'waiting')
        .neq('home_user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getMyGames(): Promise<GameRow[]> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Actively-playable games (lineup-select / in-progress)
    const { data: active, error: e1 } = await supabase
        .from('games')
        .select('*')
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .in('status', ['lineup_select', 'in_progress'])
        .order('updated_at', { ascending: false });
    if (e1) throw e1;

    // Finished SERIES games that are still "awaiting-next" — the series
    // isn't decided yet and no later game_number exists. These render in
    // My Games as a Ready-Up entry so both players can meet back up and
    // toggle ready for the next series game after exiting the end-screen.
    const { data: finished, error: e2 } = await supabase
        .from('games')
        .select('*')
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .eq('status', 'finished')
        .not('series_id', 'is', null)
        .order('game_number', { ascending: false });
    if (e2) throw e2;

    // Group all my series games (active + finished) by series so we can
    // pick "latest game in its series" without a separate query per row.
    const allBySeries: Record<string, GameRow[]> = {};
    for (const g of [...(active || []), ...(finished || [])]) {
        if (!g.series_id) continue;
        (allBySeries[g.series_id] ??= []).push(g);
    }

    // Load each series's status (so we can skip decided series)
    const seriesIds = Array.from(new Set((finished || []).map(f => f.series_id).filter(Boolean) as string[]));
    const seriesStatus = new Map<string, string>();
    if (seriesIds.length > 0) {
        const { data: rows } = await supabase.from('series').select('id,status').in('id', seriesIds);
        for (const r of (rows || []) as Array<{ id: string; status: string }>) seriesStatus.set(r.id, r.status);
    }

    const awaitingNext: GameRow[] = [];
    for (const f of finished || []) {
        if (!f.series_id) continue;
        if (seriesStatus.get(f.series_id) === 'finished') continue; // series decided
        const games = allBySeries[f.series_id] || [];
        const maxNum = Math.max(...games.map(g => g.game_number || 0));
        if ((f.game_number || 0) !== maxNum) continue; // not the latest; a newer game exists
        awaitingNext.push(f);
    }

    return [...(active || []), ...awaitingNext];
}

export async function joinGame(gameId: string): Promise<GameRow> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Update first
    const { error: updateError } = await supabase
        .from('games')
        .update({
            away_user_id: user.id,
            away_user_email: getUsername(user),
            status: 'lineup_select',
        })
        .eq('id', gameId)
        .eq('status', 'waiting');
    if (updateError) throw updateError;

    // Then fetch (now the user is a participant, so RLS allows it)
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    // Row not found (PGRST116) means the game was deleted between our
    // render and the join click. Surface a clean message so the caller
    // can replace their stale lobby row instead of showing raw SQL errors.
    if (error?.code === 'PGRST116' || !data) {
        throw new Error('That game is no longer available.');
    }
    if (error) throw error;

    // Mirror the opponent onto the series row when joining a series game.
    // ensureNextSeriesGame reads series.away_user_id to know who's playing
    // game 2+; without this write the series stays half-populated and
    // advancing throws "both players must be present". Best-effort — a
    // failure here doesn't block the join.
    if (data.series_id) {
        try {
            await supabase
                .from('series')
                .update({ away_user_id: user.id, away_user_email: getUsername(user) })
                .eq('id', data.series_id)
                .is('away_user_id', null);
        } catch { /* non-fatal */ }
    }

    return data;
}

export async function selectLineup(gameId: string, role: PlayerRole, lineupId: string, lineupName: string, lineupData: any): Promise<void> {
    // Use separate JSONB fields to avoid race condition when both players write simultaneously
    // We use a Postgres jsonb merge via raw SQL-like approach, but since we can't do that
    // easily with the JS client, we use separate columns per role via the pending_action field
    // as a temp store for the away lineup, OR we just retry the merge

    // Retry loop to handle race condition
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data: current } = await supabase.from('games').select('state').eq('id', gameId).single();
        const existingState = (typeof current?.state === 'object' && current?.state !== null) ? current.state : {};

        const newState = {
            ...existingState,
            [`${role}Lineup`]: lineupData,
        };

        const update = role === 'home'
            ? { home_lineup_id: lineupId, home_lineup_name: lineupName, home_ready: true, state: newState }
            : { away_lineup_id: lineupId, away_lineup_name: lineupName, away_ready: true, state: newState };

        const { error } = await supabase
            .from('games')
            .update(update)
            .eq('id', gameId);

        if (!error) return;
        // Wait a bit and retry
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Failed to save lineup after retries');
}

export async function startGame(gameId: string, initialState: any): Promise<void> {
    const { error } = await supabase
        .from('games')
        .update({ status: 'in_progress', state: initialState })
        .eq('id', gameId);
    if (error) throw error;
}

export async function updateGameState(gameId: string, state: any): Promise<void> {
    const { error } = await supabase
        .from('games')
        .update({ state })
        .eq('id', gameId);
    if (error) throw error;
}

export async function deleteGame(gameId: string): Promise<void> {
    // Capture series_id before deleting so we can clean up a now-orphaned
    // series row (the dangling-series case: solo lobby, game 1 cancelled).
    const { data: row } = await supabase
        .from('games')
        .select('series_id')
        .eq('id', gameId)
        .maybeSingle();

    const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);
    if (error) throw error;

    const seriesId = row?.series_id;
    if (!seriesId) return;

    // Only delete the series if no sibling games remain. RLS further limits
    // this to the creator's still-waiting series, so mid-series or finished
    // series are naturally left alone.
    const { count } = await supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId);
    if ((count ?? 0) === 0) {
        await supabase.from('series').delete().eq('id', seriesId);
    }
}

export async function getGame(gameId: string): Promise<GameRow> {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    if (error?.code === 'PGRST116' || (!error && !data)) {
        throw new Error('This game no longer exists.');
    }
    if (error) throw error;
    return data;
}

export function getMyRole(game: GameRow, userId: string): PlayerRole | null {
    if (game.home_user_id === userId) return 'home';
    if (game.away_user_id === userId) return 'away';
    return null;
}

export function subscribeToGame(
    gameId: string,
    onUpdate: (game: GameRow) => void,
    onDelete?: () => void,
): RealtimeChannel {
    const channel = supabase.channel(`game-${gameId}`);
    channel.on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
    }, (payload) => {
        onUpdate(payload.new as GameRow);
    });
    if (onDelete) {
        channel.on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
        }, () => {
            onDelete();
        });
    }
    return channel.subscribe();
}

/** Fires `callback` on any change to the games table. Consumers should refetch
 *  their own filtered view (e.g. getMyGames) rather than inspect the payload —
 *  deletes keep the list fresh even when a different client removed the row. */
export function subscribeToMyGames(callback: () => void): RealtimeChannel {
    return supabase
        .channel('my-games')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
            callback();
        })
        .subscribe();
}

export function subscribeToLobby(callback: (games: GameRow[]) => void): RealtimeChannel {
    // Initial fetch + subscribe to changes
    getOpenGames().then(callback);

    return supabase
        .channel('lobby')
        // Scope the trigger to rows where status=waiting so other chatty
        // mid-game writes don't refetch the entire lobby on every action.
        // DELETEs of rows that WERE waiting still fire because the filter
        // matched the old row's status.
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'games',
            filter: 'status=eq.waiting',
        }, () => {
            getOpenGames().then(callback);
        })
        .subscribe();
}

