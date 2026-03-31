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

    const { data, error } = await supabase
        .from('games')
        .select('*')
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .in('status', ['lineup_select', 'in_progress'])
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
    if (error) throw error;
    return data;
}

export function getMyRole(game: GameRow, userId: string): PlayerRole | null {
    if (game.home_user_id === userId) return 'home';
    if (game.away_user_id === userId) return 'away';
    return null;
}

export function subscribeToGame(gameId: string, callback: (game: GameRow) => void): RealtimeChannel {
    return supabase
        .channel(`game-${gameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
        }, (payload) => {
            callback(payload.new as GameRow);
        })
        .subscribe();
}

export function subscribeToLobby(callback: (games: GameRow[]) => void): RealtimeChannel {
    // Initial fetch + subscribe to changes
    getOpenGames().then(callback);

    return supabase
        .channel('lobby')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'games',
        }, () => {
            // Refetch on any change
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
