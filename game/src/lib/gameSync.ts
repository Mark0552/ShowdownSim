/**
 * Game synchronization via Supabase Realtime.
 *
 * Home team is the "host" — runs the engine, writes state.
 * Away team reads state and submits actions via pending_action.
 */
import { supabase } from './supabase';
import type { GameRow, PlayerRole } from '../types/game';
import type { GameState } from '../types/gameState';
import type { GameAction } from '../types/gameActions';
import { getGame, updateGameState, subscribeToGame } from './games';
import { processAction, initializeGameState } from '../engine/gameEngine';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface GameSession {
    gameId: string;
    role: PlayerRole;
    state: GameState;
    channel: RealtimeChannel;
    onStateUpdate: (state: GameState) => void;
}

/**
 * Start a game session.
 * Host initializes state; away subscribes.
 */
export async function startGameSession(
    gameId: string,
    role: PlayerRole,
    onStateUpdate: (state: GameState) => void,
): Promise<GameSession> {
    const game = await getGame(gameId);

    let state: GameState;

    if (role === 'home') {
        // Host: initialize game state from both lineups
        state = initializeGameState(
            game.state && Object.keys(game.state).length > 1 ? game.state :
            await loadLineupData(game.home_lineup_id!),
            await loadLineupData(game.away_lineup_id!),
            game.home_user_id,
            game.away_user_id!,
        );

        // If game state already exists (resuming), use it
        if (game.state && game.state.inning) {
            state = game.state as GameState;
        }

        // Write initial state
        await updateGameState(gameId, state);
    } else {
        // Away: read current state
        state = game.state as GameState;
    }

    // Subscribe to updates
    const channel = subscribeToGame(gameId, (updated) => {
        const newState = updated.state as GameState;
        if (newState) {
            onStateUpdate(newState);
        }

        // Host: check for pending actions from away player
        if (role === 'home' && updated.pending_action) {
            handlePendingAction(gameId, updated.pending_action, updated.state as GameState, onStateUpdate);
        }
    });

    onStateUpdate(state);

    return { gameId, role, state, channel, onStateUpdate };
}

/**
 * Submit an action.
 * Host processes directly; away writes to pending_action.
 */
export async function submitAction(
    session: GameSession,
    action: GameAction,
): Promise<void> {
    if (session.role === 'home') {
        // Host: process action directly
        const newState = processAction(session.state, action);
        session.state = newState;
        await updateGameState(session.gameId, newState);
        session.onStateUpdate(newState);
    } else {
        // Away: write to pending_action for host to process
        const { error } = await supabase
            .from('games')
            .update({ pending_action: action })
            .eq('id', session.gameId);
        if (error) throw error;
    }
}

/**
 * Host processes a pending action from the away player.
 */
async function handlePendingAction(
    gameId: string,
    action: GameAction,
    currentState: GameState,
    onStateUpdate: (state: GameState) => void,
) {
    const newState = processAction(currentState, action);

    // Clear pending_action and write new state
    const { error } = await supabase
        .from('games')
        .update({ state: newState, pending_action: null })
        .eq('id', gameId);

    if (!error) {
        onStateUpdate(newState);
    }
}

/**
 * Load a lineup's data from Supabase.
 */
async function loadLineupData(lineupId: string): Promise<any> {
    const { data, error } = await supabase
        .from('lineups')
        .select('data')
        .eq('id', lineupId)
        .single();
    if (error) throw error;
    return data.data;
}

/**
 * Clean up a game session.
 */
export function endGameSession(session: GameSession) {
    session.channel.unsubscribe();
}
