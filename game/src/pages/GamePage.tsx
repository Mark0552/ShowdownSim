import { useState, useEffect, useRef, useCallback } from 'react';
import { initializeGameState, processAction, getCurrentBatter, getCurrentPitcher } from '../engine/gameEngine';
import type { GameState, GameAction } from '../engine/gameEngine';
import { getGame, subscribeToGame, getMyRole } from '../lib/games';
import { supabase } from '../lib/supabase';
import type { PlayerRole } from '../types/game';
import Scoreboard from '../components/game/Scoreboard';
import Diamond from '../components/game/Diamond';
import AtBatPanel from '../components/game/AtBatPanel';
import ActionBar from '../components/game/ActionBar';
import GameLog from '../components/game/GameLog';
import './GamePage.css';

interface Props {
    gameId: string;
    onBack: () => void;
}

export default function GamePage({ gameId, onBack }: Props) {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [homeName, setHomeName] = useState('Home');
    const [awayName, setAwayName] = useState('Away');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    // Initialize game
    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not logged in');

                const game = await getGame(gameId);
                const role = getMyRole(game, user.id);
                if (!role) throw new Error('Not a participant');

                setMyRole(role);
                setHomeName(game.home_user_email || 'Home');
                setAwayName(game.away_user_email || 'Away');

                // Check if game already has an active state
                if (game.state?.inning && game.state?.homeTeam) {
                    if (mounted) {
                        setGameState(game.state as GameState);
                        setLoading(false);
                    }
                    return;
                }

                // Host initializes the game
                if (role === 'home') {
                    // Wait for both lineups
                    let gameData = game;
                    for (let i = 0; i < 15; i++) {
                        if (gameData.state?.homeLineup && gameData.state?.awayLineup) break;
                        await new Promise(r => setTimeout(r, 1000));
                        const { data } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
                        if (data) gameData = data;
                    }

                    const homeLineup = gameData.state?.homeLineup;
                    const awayLineup = gameData.state?.awayLineup;
                    if (!homeLineup || !awayLineup) throw new Error('Lineups not ready');

                    const state = initializeGameState(homeLineup, awayLineup, game.home_user_id, game.away_user_id!);

                    await supabase.from('games').update({ status: 'in_progress', state }).eq('id', gameId);

                    if (mounted) {
                        setGameState(state);
                        setLoading(false);
                    }
                } else {
                    // Away: poll until state is ready
                    for (let i = 0; i < 20; i++) {
                        const { data } = await supabase.from('games').select('state').eq('id', gameId).maybeSingle();
                        if (data?.state?.inning && data?.state?.homeTeam) {
                            if (mounted) {
                                setGameState(data.state as GameState);
                                setLoading(false);
                            }
                            return;
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    throw new Error('Game failed to start');
                }
            } catch (err: any) {
                if (mounted) {
                    setError(err.message);
                    setLoading(false);
                }
            }
        }

        init();
        return () => { mounted = false; };
    }, [gameId]);

    // Poll for state updates (both players)
    useEffect(() => {
        if (!gameState || !myRole) return;

        const interval = setInterval(async () => {
            try {
                const { data } = await supabase.from('games').select('state, pending_action').eq('id', gameId).maybeSingle();
                if (!data) return;

                // Host: process pending actions from away
                if (myRole === 'home' && data.pending_action) {
                    const currentState = data.state as GameState;
                    if (currentState?.phase) {
                        const newState = processAction(currentState, data.pending_action);
                        await supabase.from('games').update({ state: newState, pending_action: null }).eq('id', gameId);
                        setGameState(newState);
                    }
                }

                // Away: read latest state
                if (myRole === 'away' && data.state?.inning) {
                    setGameState(data.state as GameState);
                }
            } catch (e) { /* ignore */ }
        }, 2000);

        return () => clearInterval(interval);
    }, [gameState?.inning, myRole, gameId]);

    // Handle action (host processes directly, away writes to pending_action)
    const handleAction = useCallback(async (action: GameAction) => {
        if (!gameState) return;

        if (myRole === 'home') {
            const newState = processAction(gameState, action);
            setGameState(newState);
            await supabase.from('games').update({ state: newState }).eq('id', gameId);
        } else {
            await supabase.from('games').update({ pending_action: action }).eq('id', gameId);
        }
    }, [gameState, myRole, gameId]);

    if (loading) {
        return <div className="game-page loading"><div>Loading game...</div></div>;
    }

    if (error) {
        return (
            <div className="game-page loading">
                <div className="game-error">{error}</div>
                <button onClick={onBack} style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 16 }}>
                    Back to Lobby
                </button>
            </div>
        );
    }

    if (!gameState) {
        return <div className="game-page loading"><div>Initializing...</div></div>;
    }

    return (
        <div className="game-page">
            <div className="game-top">
                <button className="game-back-btn" onClick={onBack}>&larr; Leave</button>
                <Scoreboard state={gameState} homeName={homeName} awayName={awayName} />
            </div>
            <div className="game-main">
                <div className="game-left">
                    <Diamond state={gameState} />
                    <ActionBar state={gameState} onRoll={handleAction} />
                </div>
                <div className="game-center">
                    <AtBatPanel state={gameState} />
                </div>
                <div className="game-right">
                    <GameLog state={gameState} />
                </div>
            </div>
        </div>
    );
}
