import { supabase } from './supabase';
import type { GameRow, PlayerRole } from '../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';

export async function createGame(): Promise<GameRow> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('games')
        .insert({
            home_user_id: user.id,
            home_user_email: user.email,
            status: 'waiting',
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getOpenGames(): Promise<GameRow[]> {
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('games')
        .update({
            away_user_id: user.id,
            away_user_email: user.email,
            status: 'lineup_select',
        })
        .eq('id', gameId)
        .eq('status', 'waiting')
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function selectLineup(gameId: string, role: PlayerRole, lineupId: string, lineupName: string): Promise<void> {
    const update = role === 'home'
        ? { home_lineup_id: lineupId, home_lineup_name: lineupName, home_ready: true }
        : { away_lineup_id: lineupId, away_lineup_name: lineupName, away_ready: true };

    const { error } = await supabase
        .from('games')
        .update(update)
        .eq('id', gameId);
    if (error) throw error;
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
