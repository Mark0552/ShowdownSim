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
 */
export async function startGameSession(
    gameId: string,
    role: PlayerRole,
    onStateUpdate: (state: GameState) => void,
): Promise<GameSession> {
    const game = await getGame(gameId);

    let state: GameState;

    if (role === 'home') {
        // Check if game already has a full state (resuming)
        if (game.state && game.state.inning) {
            state = game.state as GameState;
        } else {
            // Wait for both lineups to be on the game row
            let gameData = game;
            for (let attempt = 0; attempt < 15; attempt++) {
                const homeLineup = gameData.state?.homeLineup;
                const awayLineup = gameData.state?.awayLineup;
                if (homeLineup && awayLineup) break;
                await new Promise(r => setTimeout(r, 1000));
                const { data } = await supabase.from('games').select('*').eq('id', gameId).single();
                if (data) gameData = data;
            }

            const homeLineup = gameData.state?.homeLineup;
            const awayLineup = gameData.state?.awayLineup;

            if (!homeLineup || !awayLineup) {
                throw new Error('Both lineups must be selected before starting');
            }

            state = initializeGameState(
                homeLineup,
                awayLineup,
                gameData.home_user_id,
                gameData.away_user_id!,
            );

            // Update game status and write initial state
            await supabase.from('games').update({
                status: 'in_progress',
                state: state,
            }).eq('id', gameId);
        }
    } else {
        // Away: wait for host to initialize, then read state
        // Poll until state is ready
        let attempts = 0;
        while (attempts < 20) {
            const { data } = await supabase.from('games').select('state, status').eq('id', gameId).single();
            if (data?.state?.inning) {
                state = data.state as GameState;
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
        if (!state!) {
            throw new Error('Game failed to initialize');
        }
    }

    // Subscribe to updates
    const channel = subscribeToGame(gameId, (updated) => {
        const newState = updated.state;
        if (newState && typeof newState === 'object' && newState.inning && newState.isOver !== undefined) {
            onStateUpdate(newState as GameState);
        }

        // Host: check for pending actions from away player
        if (role === 'home' && updated.pending_action) {
            handlePendingAction(gameId, updated.pending_action, updated.state as GameState, onStateUpdate);
        }
    });

    // Also poll for state changes (Realtime fallback)
    const pollInterval = setInterval(async () => {
        try {
            const { data, error } = await supabase.from('games').select('state, pending_action').eq('id', gameId).maybeSingle();
            if (error || !data) return;
            if (data.state && typeof data.state === 'object' && data.state.inning) {
                onStateUpdate(data.state as GameState);
            }
            if (role === 'home' && data.pending_action) {
                handlePendingAction(gameId, data.pending_action, data.state as GameState, onStateUpdate);
            }
        } catch (e) { /* ignore */ }
    }, 3000);

    onStateUpdate(state);

    return {
        gameId,
        role,
        state,
        channel: Object.assign(channel, { _pollInterval: pollInterval }),
        onStateUpdate,
    };
}

/**
 * Submit an action.
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

    const { error } = await supabase
        .from('games')
        .update({ state: newState, pending_action: null })
        .eq('id', gameId);

    if (!error) {
        onStateUpdate(newState);
    }
}

/**
 * Clean up a game session.
 */
export function endGameSession(session: GameSession) {
    session.channel.unsubscribe();
    if ((session.channel as any)._pollInterval) {
        clearInterval((session.channel as any)._pollInterval);
    }
}
