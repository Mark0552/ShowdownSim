import { supabase } from './supabase';
import { getUsername, getUser } from './auth';
import type { GameRow, SeriesRow, PlayerRole } from '../types/game';
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

/** Toggle the current player's "ready for next series game" flag on the
 *  game row's pending_action JSON. Uses the set_ready_for_next_game RPC
 *  (Postgres function, jsonb_set under the hood) so the read-modify-write
 *  is atomic — a previous client-side read→patch→write could lose the
 *  other player's flag when both clicked Ready simultaneously. */
export async function setReadyForNextGame(gameId: string, role: PlayerRole, ready: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_ready_for_next_game', {
        p_game_id: gameId, p_role: role, p_ready: ready,
    });
    if (error) throw error;
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
    const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);
    if (error) throw error;
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

// ============================================================================
// SERIES
// ============================================================================

export async function createSeries(bestOf: number, password?: string): Promise<{ series: SeriesRow; game: GameRow }> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Create series
    const { data: series, error: seriesError } = await supabase
        .from('series')
        .insert({
            home_user_id: user.id,
            home_user_email: getUsername(user),
            best_of: bestOf,
            status: 'waiting',
        })
        .select()
        .single();
    if (seriesError) throw seriesError;

    // Create first game in series
    const gameInsert: any = {
        home_user_id: user.id,
        home_user_email: getUsername(user),
        status: 'waiting',
        series_id: series.id,
        game_number: 1,
    };
    if (password) gameInsert.password = password;

    const { data: game, error: gameError } = await supabase
        .from('games')
        .insert(gameInsert)
        .select()
        .single();
    if (gameError) throw gameError;

    return { series, game };
}

export async function getSeries(seriesId: string): Promise<SeriesRow> {
    const { data, error } = await supabase
        .from('series')
        .select('*')
        .eq('id', seriesId)
        .single();
    if (error) throw error;
    return data;
}

export async function getSeriesGames(seriesId: string): Promise<GameRow[]> {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('series_id', seriesId)
        .order('game_number', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function updateSeries(seriesId: string, updates: Partial<SeriesRow>): Promise<void> {
    const { error } = await supabase
        .from('series')
        .update(updates)
        .eq('id', seriesId);
    if (error) throw error;
}

export async function createNextSeriesGame(seriesId: string, gameNumber: number, homeUserId: string, awayUserId: string, homeEmail: string, awayEmail: string): Promise<GameRow> {
    const { data, error } = await supabase
        .from('games')
        .insert({
            home_user_id: homeUserId,
            away_user_id: awayUserId,
            home_user_email: homeEmail,
            away_user_email: awayEmail,
            status: 'lineup_select',
            series_id: seriesId,
            game_number: gameNumber,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Idempotently sync a series' starter_offset from the actual game-1 state.
 * Reads game 1's home-team active pitcher, parses "Starter-N" from its
 * assignedPosition, and writes that N as the series' starter_offset so the
 * engine's rotation formula (((offset + gameNum - 2) % 4) + 1) cycles
 * starting from the next slot. Safe to call any time — only writes when
 * game 1 has finished its SP roll and the value differs from what's stored.
 */
export async function syncSeriesStarterOffsetFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const game1 = games.find(g => g.game_number === 1);
    if (!game1?.state) return;
    const offset = findGame1StarterNumber(game1.state);
    if (!offset) return;
    const series = await getSeries(seriesId);
    if (series.starter_offset === offset) return; // already in sync
    await updateSeries(seriesId, { starter_offset: offset } as Partial<SeriesRow>);
}

/** Find the Starter-N number that actually pitched first in game 1.
 *  The ACTIVE pitcher may have changed mid-game (pitching change swaps in a
 *  reliever), so we scan across active pitcher + bullpen + archivedPlayers
 *  for any player with an assignedPosition matching /^Starter-(\d+)$/ who
 *  recorded at least one batter faced. Returns 1-4 or null if not found. */
export function findGame1StarterNumber(state: any): number | null {
    const home = state?.homeTeam;
    if (!home) return null;
    const stats = home.pitcherStats || {};
    const pool: any[] = [home.pitcher, ...(home.bullpen || [])];
    if (home.archivedPlayers) {
        for (const id of Object.keys(home.archivedPlayers)) {
            if (!pool.find(p => p?.cardId === id)) pool.push(home.archivedPlayers[id]);
        }
    }
    let best: { num: number; bf: number } | null = null;
    for (const p of pool) {
        if (!p) continue;
        const pos = String(p.assignedPosition || '');
        const m = pos.match(/^Starter-(\d+)$/);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        if (!num || num < 1 || num > 4) continue;
        const bf = stats[p.cardId]?.bf || 0;
        // Prefer the starter who actually faced batters. Fall back to any
        // matched starter so a freshly-rolled-but-not-yet-pitched state
        // still produces an offset (covers the early-write call).
        if (!best || bf > best.bf) best = { num, bf };
    }
    return best ? best.num : null;
}

/**
 * Idempotently sync a series' reliever_history from completed-game rows.
 * For each finished game, find every non-Starter pitcher who recorded any
 * batters faced (bf > 0), and add that game_number to their list. Looks
 * across active pitcher + bullpen + archivedPlayers (subbed-out pitchers
 * still count). Safe to re-run.
 */
export async function syncSeriesRelieverHistoryFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const finished = games.filter(g => g.status === 'finished' && g.state).sort((a, b) => a.game_number - b.game_number);
    const history: { home: Record<string, number[]>; away: Record<string, number[]> } = { home: {}, away: {} };

    for (const game of finished) {
        for (const side of ['home', 'away'] as const) {
            const team = game.state[`${side}Team`];
            if (!team) continue;
            const pitcherStats = team.pitcherStats || {};
            // Collect all pitchers we know about: active + bullpen + archived
            const allPitchers: any[] = [];
            if (team.pitcher) allPitchers.push(team.pitcher);
            for (const p of team.bullpen || []) allPitchers.push(p);
            if (team.archivedPlayers) {
                for (const id of Object.keys(team.archivedPlayers)) {
                    if (team.archivedPlayers[id].type === 'pitcher') allPitchers.push(team.archivedPlayers[id]);
                }
            }
            for (const p of allPitchers) {
                if (!p.cardId) continue;
                if (p.role === 'Starter') continue;
                const stats = pitcherStats[p.cardId];
                if (!stats || (stats.bf || 0) === 0) continue;
                const list = history[side][p.cardId] = history[side][p.cardId] || [];
                if (!list.includes(game.game_number)) list.push(game.game_number);
            }
        }
    }

    await updateSeries(seriesId, { reliever_history: history } as Partial<SeriesRow>);
}

/**
 * Idempotently sync a series' win counts from the actual completed-game rows.
 * Safe to call any number of times — uses the games table as source of truth so
 * page revisits / reloads don't double-count.
 */
export async function syncSeriesWinsFromGames(seriesId: string): Promise<SeriesRow> {
    const games = await getSeriesGames(seriesId);
    const series = await getSeries(seriesId);
    const homeWins = games.filter(g => g.status === 'finished' && g.winner_user_id === g.home_user_id).length;
    const awayWins = games.filter(g => g.status === 'finished' && g.winner_user_id === g.away_user_id).length;
    const decided = Math.max(homeWins, awayWins) > series.best_of / 2;
    const updates: Partial<SeriesRow> = { home_wins: homeWins, away_wins: awayWins };
    if (decided && series.status !== 'finished') {
        updates.status = 'finished';
        updates.winner_user_id = homeWins > awayWins ? series.home_user_id : (series.away_user_id || null);
    }
    if (homeWins !== series.home_wins || awayWins !== series.away_wins || (decided && series.status !== 'finished')) {
        await updateSeries(seriesId, updates);
    }
    return { ...series, ...updates } as SeriesRow;
}

/**
 * Create the next game in a series, or return the existing one if already
 * been created (race-safe). Either client can call this.
 *
 * Enforces the "same lineup throughout the series" rule by carrying the
 * previous game's lineup IDs + names AND the embedded lineup data from
 * game.state.{homeLineup,awayLineup} into the new game, and setting both
 * ready flags to true so the lobby skips lineup-select entirely. When the
 * clients navigate to the new game, the server finds state.homeLineup /
 * awayLineup and initializes immediately — no "waiting for opponent".
 */
export async function ensureNextSeriesGame(
    seriesId: string,
    gameNumber: number,
    homeUserId: string,
    awayUserId: string,
    homeEmail: string,
    awayEmail: string,
): Promise<GameRow> {
    // Guard: both participants must be set. Creating a next-series row
    // with an empty away_user_id would violate the FK (or produce a row
    // that can't be played) and mask the real "opponent never joined"
    // problem until much later.
    if (!homeUserId || !awayUserId) {
        throw new Error('Cannot advance series: both players must be present.');
    }
    const games = await getSeriesGames(seriesId);
    const existing = games.find(g => g.game_number === gameNumber);
    if (existing) return existing;

    const prevGame = games.find(g => g.game_number === gameNumber - 1);
    const prevState: any = prevGame?.state || {};
    const initialState = {
        homeLineup: prevState.homeLineup,
        awayLineup: prevState.awayLineup,
    };

    try {
        const { data, error } = await supabase
            .from('games')
            .insert({
                home_user_id: homeUserId,
                away_user_id: awayUserId,
                home_user_email: homeEmail,
                away_user_email: awayEmail,
                status: 'lineup_select',
                series_id: seriesId,
                game_number: gameNumber,
                home_lineup_id: prevGame?.home_lineup_id,
                home_lineup_name: prevGame?.home_lineup_name,
                away_lineup_id: prevGame?.away_lineup_id,
                away_lineup_name: prevGame?.away_lineup_name,
                home_ready: true,
                away_ready: true,
                state: initialState,
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (e: any) {
        // Only swallow the UNIQUE-constraint race (Postgres 23505 on
        // games_series_id_game_number_key) — the other client inserted
        // first, so we refetch and return their row. Any other error
        // (RLS, FK, network) is a real failure and must bubble up; if
        // we refetched blindly we'd return a stale row that doesn't
        // match game_number and mask the underlying problem.
        const isUniqueViolation = e?.code === '23505' || /duplicate key|unique/i.test(e?.message || '');
        if (!isUniqueViolation) throw e;
        const refetched = await getSeriesGames(seriesId);
        const found = refetched.find(g => g.game_number === gameNumber);
        if (found) return found;
        throw e;
    }
}

/** Subscribe to new games being added to a series — used so when one player
 *  creates the next game, the other auto-detects and can navigate. */
export function subscribeToSeriesGames(seriesId: string, onChange: (game: GameRow) => void) {
    const channel = supabase
        .channel(`series-games-${seriesId}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'games', filter: `series_id=eq.${seriesId}` },
            (payload) => onChange(payload.new as GameRow))
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}
