import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '../engine/gameEngine';
import { getGame, getMyRole } from '../lib/games';
import { getLineups } from '../lib/lineups';
import { supabase } from '../lib/supabase';
import type { PlayerRole } from '../types/game';
import Scoreboard from '../components/game/Scoreboard';
import Diamond from '../components/game/Diamond';
import AtBatPanel from '../components/game/AtBatPanel';
import ActionBar from '../components/game/ActionBar';
import GameLog from '../components/game/GameLog';
import './GamePage.css';

const WS_URL = 'wss://showdownsim-production.up.railway.app';

interface Props {
    gameId: string;
    onBack: () => void;
}

export default function GamePage({ gameId, onBack }: Props) {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [myTurn, setMyTurn] = useState<string | null>(null);
    const [homeName, setHomeName] = useState('Home');
    const [awayName, setAwayName] = useState('Away');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('Connecting...');
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        let mounted = true;

        async function connect() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not logged in');

                const game = await getGame(gameId);
                const role = getMyRole(game, user.id);
                if (!role) throw new Error('Not a participant');

                setMyRole(role);
                setHomeName(game.home_user_email || 'Home');
                setAwayName(game.away_user_email || 'Away');

                // Get lineup data
                const lineupId = role === 'home' ? game.home_lineup_id : game.away_lineup_id;
                let lineupData = null;

                // Try to get lineup from the game state first (stored during selection)
                if (game.state && game.state[`${role}Lineup`]) {
                    lineupData = game.state[`${role}Lineup`];
                } else if (lineupId) {
                    // Fetch from lineups table
                    const lineups = await getLineups();
                    const lineup = lineups.find(l => l.id === lineupId);
                    if (lineup) lineupData = lineup.data;
                }

                // Connect WebSocket
                const ws = new WebSocket(WS_URL);
                wsRef.current = ws;

                ws.onopen = () => {
                    if (!mounted) return;
                    setStatus('Connected. Joining game...');
                    ws.send(JSON.stringify({
                        type: 'join_game',
                        gameId,
                        userId: user.id,
                        role,
                        lineupData,
                    }));
                };

                ws.onmessage = (event) => {
                    if (!mounted) return;
                    const msg = JSON.parse(event.data);

                    switch (msg.type) {
                        case 'game_state':
                            setGameState(msg.state);
                            setMyTurn(msg.turn);
                            setLoading(false);
                            setStatus('');
                            break;
                        case 'joined':
                            // Use the server-confirmed role
                            setMyRole(msg.role as PlayerRole);
                            setStatus(`Joined as ${msg.role}. ${msg.players < 2 ? 'Waiting for opponent...' : 'Starting...'}`);
                            break;
                        case 'waiting':
                            setStatus(msg.message);
                            break;
                        case 'player_left':
                            setStatus('Opponent disconnected');
                            break;
                        case 'error':
                            setError(msg.message);
                            break;
                    }
                };

                ws.onclose = () => {
                    if (mounted) setStatus('Disconnected. Refresh to reconnect.');
                };

                ws.onerror = () => {
                    if (mounted) setError('Connection error');
                };

            } catch (err: any) {
                if (mounted) {
                    setError(err.message);
                    setLoading(false);
                }
            }
        }

        connect();

        return () => {
            mounted = false;
            wsRef.current?.close();
        };
    }, [gameId]);

    const handleAction = useCallback((action: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'action', action }));
        }
    }, []);

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

    if (loading || !gameState) {
        return (
            <div className="game-page loading">
                <div>{status || 'Loading game...'}</div>
            </div>
        );
    }

    const isMyTurn = myTurn === myRole;
    console.log('GamePage render:', { myRole, myTurn, isMyTurn, phase: gameState.phase, halfInning: gameState.halfInning });

    return (
        <div className="game-page">
            <div className="game-top">
                <button className="game-back-btn" onClick={onBack}>&larr; Leave</button>
                <Scoreboard state={gameState} homeName={homeName} awayName={awayName} />
                {!gameState.isOver && (
                    <div className="turn-indicator">
                        {isMyTurn
                            ? <span className="your-turn">Your turn — {gameState.phase === 'pitch' ? 'Roll Pitch' : 'Roll Swing'}</span>
                            : <span className="opp-turn">Waiting for opponent...</span>
                        }
                    </div>
                )}
            </div>
            <div className="game-main">
                <div className="game-left">
                    <Diamond state={gameState} />
                    {isMyTurn && <ActionBar state={gameState} onRoll={handleAction} />}
                    {!isMyTurn && !gameState.isOver && (
                        <div className="action-bar">
                            <div className="waiting-msg">Waiting for opponent...</div>
                        </div>
                    )}
                    {gameState.isOver && <ActionBar state={gameState} onRoll={handleAction} />}
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
