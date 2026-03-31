import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, GameAction } from '../engine/gameEngine';
import { getGame, getMyRole, getSeries } from '../lib/games';
import { getLineups } from '../lib/lineups';
import { saveGameStats } from '../lib/stats';
import { supabase } from '../lib/supabase';
import type { GameRow, PlayerRole } from '../types/game';
import GameBoard from '../components/game/GameBoard';
import './GamePage.css';

const WS_URL = 'wss://showdownsim-production.up.railway.app';
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000; // 1 second

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
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const [gameRow, setGameRow] = useState<GameRow | null>(null);
    const statsSavedRef = useRef(false);
    const mountedRef = useRef(true);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cached connection data for reconnects
    const connDataRef = useRef<{
        userId: string;
        role: PlayerRole;
        lineupData: any;
        seriesContext: any;
    } | null>(null);

    const connectWs = useCallback(() => {
        if (!connDataRef.current || !mountedRef.current) return;
        const { userId, role, lineupData, seriesContext } = connDataRef.current;

        // Close existing connection if any
        if (wsRef.current) {
            wsRef.current.onclose = null; // prevent reconnect loop
            wsRef.current.close();
        }

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!mountedRef.current) return;
            reconnectAttemptRef.current = 0;
            setStatus('Connected. Joining game...');
            ws.send(JSON.stringify({ type: 'join_game', gameId, userId, role, lineupData, seriesContext }));
        };

        ws.onmessage = (event) => {
            if (!mountedRef.current) return;
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'game_state':
                    setGameState(msg.state);
                    setMyTurn(msg.turn);
                    setLoading(false);
                    setStatus('');
                    setOpponentDisconnected(false);
                    break;
                case 'joined':
                    setMyRole(msg.role as PlayerRole);
                    setStatus(`Joined as ${msg.role}. ${msg.players < 2 ? 'Waiting for opponent...' : 'Starting...'}`);
                    if (msg.players >= 2) setOpponentDisconnected(false);
                    break;
                case 'waiting':
                    setStatus(msg.message);
                    break;
                case 'player_left':
                    setOpponentDisconnected(true);
                    setStatus('Opponent disconnected — waiting for them to reconnect...');
                    break;
                case 'error':
                    setError(msg.message);
                    break;
            }
        };

        ws.onclose = () => {
            if (!mountedRef.current) return;
            const attempt = reconnectAttemptRef.current;
            if (attempt < MAX_RECONNECT_ATTEMPTS && !gameState?.isOver) {
                const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt), 15000);
                reconnectAttemptRef.current = attempt + 1;
                setStatus(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                reconnectTimerRef.current = setTimeout(() => {
                    if (mountedRef.current) connectWs();
                }, delay);
            } else if (gameState?.isOver) {
                setStatus('Game over. Connection closed.');
            } else {
                setStatus('Unable to reconnect. Please refresh the page.');
            }
        };

        ws.onerror = () => {
            // onclose will fire after onerror, which handles reconnection
        };
    }, [gameId, gameState?.isOver]);

    useEffect(() => {
        mountedRef.current = true;

        async function init() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not logged in');

                const game = await getGame(gameId);
                setGameRow(game);
                const role = getMyRole(game, user.id);
                if (!role) throw new Error('Not a participant');

                setMyRole(role);
                setHomeName(game.home_user_email || 'Home');
                setAwayName(game.away_user_email || 'Away');

                const lineupId = role === 'home' ? game.home_lineup_id : game.away_lineup_id;
                let lineupData = null;
                if (game.state && game.state[`${role}Lineup`]) {
                    lineupData = game.state[`${role}Lineup`];
                } else if (lineupId) {
                    const lineups = await getLineups();
                    const lineup = lineups.find(l => l.id === lineupId);
                    if (lineup) lineupData = lineup.data;
                }

                let seriesContext = undefined;
                if (game.series_id && game.game_number > 1) {
                    try {
                        const series = await getSeries(game.series_id);
                        seriesContext = {
                            gameNumber: game.game_number,
                            homeStarterOffset: series.starter_offset || 1,
                            awayStarterOffset: series.starter_offset || 1,
                            relieverHistory: series.reliever_history || { home: {}, away: {} },
                        };
                    } catch (e) { /* series context optional */ }
                }

                // Cache connection data for reconnects
                connDataRef.current = { userId: user.id, role, lineupData, seriesContext };
                connectWs();

            } catch (err: any) {
                if (mountedRef.current) { setError(err.message); setLoading(false); }
            }
        }

        init();

        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [gameId, connectWs]);

    // Save stats when game ends
    useEffect(() => {
        if (gameState?.isOver && !statsSavedRef.current) {
            statsSavedRef.current = true;
            saveGameStats(gameId, gameRow?.series_id || null, gameState).catch(console.error);
        }
    }, [gameState?.isOver, gameId, gameRow?.series_id]);

    const handleAction = useCallback((action: GameAction) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'action', action }));
        }
    }, []);

    if (error) {
        return (
            <div className="game-page loading">
                <div className="game-error">{error}</div>
                <button onClick={onBack} className="back-btn-simple">Back to Lobby</button>
            </div>
        );
    }

    if (loading || !gameState || !myRole) {
        return (
            <div className="game-page loading">
                <div>{status || 'Loading game...'}</div>
            </div>
        );
    }

    const isMyTurn = myTurn === myRole;

    return (
        <div className="game-page">
            <GameBoard
                state={gameState}
                myRole={myRole}
                isMyTurn={isMyTurn}
                onAction={handleAction}
                homeName={homeName}
                awayName={awayName}
            />
            {opponentDisconnected && !gameState.isOver && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(10,20,40,0.95)', border: '2px solid #d4a018', borderRadius: '10px',
                    padding: '20px 30px', zIndex: 2000, textAlign: 'center',
                }}>
                    <div style={{ color: '#d4a018', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Opponent Disconnected</div>
                    <div style={{ color: '#8aade0', fontSize: '13px' }}>Waiting for them to reconnect...</div>
                    <div style={{ color: '#4a6a90', fontSize: '11px', marginTop: '8px' }}>The game will resume when they return.</div>
                </div>
            )}
        </div>
    );
}
