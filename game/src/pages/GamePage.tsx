import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, GameAction } from '../engine/gameEngine';
import { computeRunnerMovements } from '../engine/movements';
import { getGame, getMyRole, getSeries, ensureNextSeriesGame, syncSeriesWinsFromGames, syncSeriesRelieverHistoryFromGames, syncSeriesStarterOffsetFromGames, findGame1StarterNumber, updateSeries, subscribeToSeriesGames, getSeriesGames, setReadyForNextGame } from '../lib/games';
import { getLineups } from '../lib/lineups';
import { saveGameStats } from '../lib/stats';
import { getUser } from '../lib/auth';
import { playSound } from '../lib/sounds';
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
    const [seriesRow, setSeriesRow] = useState<import('../types/game').SeriesRow | null>(null);
    /** Last gameState we processed — used as the diff base for client-side
     *  movement computation when the server-supplied runnerMovements field
     *  is missing (e.g. after a brief reconnect). */
    const prevGameStateRef = useRef<GameState | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [myTurn, setMyTurn] = useState<string | null>(null);
    const [homeName, setHomeName] = useState('Home');
    const [awayName, setAwayName] = useState('Away');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('Connecting...');
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    const [pendingMovements, setPendingMovements] = useState<any[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [gameRow, setGameRow] = useState<GameRow | null>(null);
    const statsSavedRef = useRef(false);
    const mountedRef = useRef(true);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pumpedUpPlayedRef = useRef(false);
    const starterOffsetSyncedRef = useRef(false);
    // Ready-for-next-game flags live on the current game's pending_action.
    // Both clients poll / subscribe to the game row and update local state;
    // when both are true, each client auto-advances to the next series game.
    const [readyNext, setReadyNext] = useState<{ home: boolean; away: boolean }>({ home: false, away: false });
    const advancingRef = useRef(false);

    // Play "I'm pumped up" once when the game first finishes loading
    useEffect(() => {
        if (!loading && !pumpedUpPlayedRef.current) {
            pumpedUpPlayedRef.current = true;
            playSound('pumped-up');
        }
    }, [loading]);

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
                case 'game_state': {
                    const prev = prevGameStateRef.current;
                    const next = msg.state as GameState;
                    setGameState(next);
                    setMyTurn(msg.turn);
                    // Prefer the server-supplied movements when present, but
                    // fall back to client-side diff so animations still fire
                    // if the WS dropped that field (reconnect, race, etc).
                    let movements = (msg.runnerMovements && msg.runnerMovements.length > 0)
                        ? msg.runnerMovements
                        : computeRunnerMovements(prev, next);
                    if (movements.length > 0) setPendingMovements(movements);
                    prevGameStateRef.current = next;
                    setLoading(false);
                    setStatus('');
                    setOpponentDisconnected(false);
                    break;
                }
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
                case 'player_joined':
                    setOpponentDisconnected(false);
                    setStatus('');
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
                const user = await getUser();
                if (!user) throw new Error('Not logged in');

                const game = await getGame(gameId);
                setGameRow(game);
                // Hydrate readyNext from the row's pending_action (may be null)
                const pa: any = (game as any).pending_action || {};
                const rn = pa.readyNext || {};
                setReadyNext({ home: !!rn.home, away: !!rn.away });
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
                if (game.series_id) {
                    try {
                        const seriesId = game.series_id;
                        // For games 2+ in a series, re-sync wins from the finished
                        // games on mount. If the previous game's game-over effect
                        // hasn't committed yet (race), this catches up the stored
                        // home_wins / away_wins so the scoreboard doesn't show 0-0.
                        const series = game.game_number > 1
                            ? await syncSeriesWinsFromGames(seriesId).catch(() => getSeries(seriesId))
                            : await getSeries(seriesId);
                        setSeriesRow(series);
                        if (game.game_number > 1) {
                            // Prefer the stored series.starter_offset; if it
                            // hasn't been synced yet (race with game-1 over),
                            // derive it by scanning game 1's state across
                            // pitcher + bullpen + archivedPlayers so a mid-
                            // game pitching change doesn't hide the starter.
                            let offset = series.starter_offset;
                            if (!offset) {
                                try {
                                    const allGames = await getSeriesGames(game.series_id);
                                    const game1 = allGames.find(g => g.game_number === 1);
                                    if (game1?.state) offset = findGame1StarterNumber(game1.state) ?? 0;
                                } catch { /* fall through */ }
                            }
                            offset = offset || 1;
                            seriesContext = {
                                gameNumber: game.game_number,
                                homeStarterOffset: offset,
                                awayStarterOffset: offset,
                                relieverHistory: series.reliever_history || { home: {}, away: {} },
                            };
                        }
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

    // Save stats + sync series wins when the game ends. Both are idempotent —
    // syncSeriesWinsFromGames recomputes from the games table so revisiting
    // this page after the game ended doesn't double-count.
    useEffect(() => {
        if (!gameState?.isOver) return;
        if (!statsSavedRef.current) {
            statsSavedRef.current = true;
            saveGameStats(gameId, gameRow?.series_id || null, gameState).catch(console.error);
        }
        if (gameRow?.series_id) {
            syncSeriesWinsFromGames(gameRow.series_id)
                .then(setSeriesRow)
                .catch(console.error);
            // Update reliever history so the next game's init applies
            // the correct stacking IP penalty for back-to-back appearances.
            syncSeriesRelieverHistoryFromGames(gameRow.series_id).catch(console.error);
            // Capture the SP rotation start from game 1 so subsequent games
            // cycle through SP1→SP2→SP3→SP4 from the correct starting point.
            syncSeriesStarterOffsetFromGames(gameRow.series_id).catch(console.error);
        }
    }, [gameState?.isOver, gameId, gameRow?.series_id]);

    // Subscribe to the current game's row so both players see each other's
    // ready-for-next-game flag flips in realtime. When both sides flip to
    // true, auto-advance via ensureNextSeriesGame (race-safe).
    useEffect(() => {
        if (!gameId) return;
        const ch = supabase
            .channel(`game-row-${gameId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
                const pa: any = (payload.new as any)?.pending_action || {};
                const rn = pa.readyNext || {};
                setReadyNext({ home: !!rn.home, away: !!rn.away });
            })
            .subscribe();
        return () => { ch.unsubscribe(); };
    }, [gameId]);

    // Auto-advance when both players are ready for the next game in the series.
    useEffect(() => {
        if (!readyNext.home || !readyNext.away) return;
        if (advancingRef.current) return;
        if (!gameRow?.series_id) return;
        if (!gameState?.isOver) return;
        // Series already decided — nothing to advance to
        const bestOf = seriesRow?.best_of || 1;
        const maxWins = Math.max(seriesRow?.home_wins || 0, seriesRow?.away_wins || 0);
        if (maxWins > bestOf / 2) return;
        advancingRef.current = true;
        (async () => {
            try {
                const next = await ensureNextSeriesGame(
                    gameRow.series_id!,
                    (gameRow.game_number || 1) + 1,
                    gameRow.home_user_id, gameRow.away_user_id || '',
                    gameRow.home_user_email || '', gameRow.away_user_email || '',
                );
                window.location.hash = `game/${next.id}`;
            } catch (e) {
                console.error('Auto-advance failed', e);
                advancingRef.current = false;
            }
        })();
    }, [readyNext.home, readyNext.away, gameState?.isOver, gameRow?.series_id, seriesRow?.best_of, seriesRow?.home_wins, seriesRow?.away_wins]); // eslint-disable-line

    const toggleReadyForNext = useCallback(async () => {
        if (!gameId || !myRole) return;
        const newValue = !readyNext[myRole];
        // Optimistic update — the realtime subscription will reconcile.
        setReadyNext(prev => ({ ...prev, [myRole]: newValue }));
        try {
            await setReadyForNextGame(gameId, myRole, newValue);
        } catch (e) {
            console.error('Failed to toggle ready', e);
            // Revert on failure
            setReadyNext(prev => ({ ...prev, [myRole]: !newValue }));
        }
    }, [gameId, myRole, readyNext]);

    // Write series.starter_offset as soon as game 1's SP roll has resolved.
    // Reads the Starter-N from the LIVE in-memory state (not Supabase) to
    // avoid racing with the server's saveState, and scans bullpen +
    // archivedPlayers so a mid-game pitching change doesn't lose the
    // originally-rolled starter's number.
    useEffect(() => {
        if (starterOffsetSyncedRef.current) return;
        if (!gameRow?.series_id) return;
        if ((gameRow?.game_number || 1) !== 1) return;
        if (!gameState || gameState.phase === 'sp_roll') return;
        const offset = findGame1StarterNumber(gameState as any);
        if (!offset) return;
        starterOffsetSyncedRef.current = true;
        updateSeries(gameRow.series_id, { starter_offset: offset } as any).catch(console.error);
    }, [gameState, gameRow?.series_id, gameRow?.game_number]);

    // Subscribe to series-game inserts so when the opponent creates the next
    // game, this client auto-navigates to it without requiring a click.
    useEffect(() => {
        if (!gameRow?.series_id || !gameState?.isOver) return;
        const myGameNumber = gameRow.game_number || 1;
        const unsub = subscribeToSeriesGames(gameRow.series_id, (newGame) => {
            if (newGame.game_number === myGameNumber + 1) {
                // Just update the hash — App.tsx's hashchange listener picks it
                // up and sets activeGameId, which remounts GamePage via its
                // key= binding. No full page reload, so the music keeps going.
                window.location.hash = `game/${newGame.id}`;
            }
        });
        return unsub;
    }, [gameRow?.series_id, gameRow?.game_number, gameState?.isOver]);

    const handleAction = useCallback((action: GameAction) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'action', action }));
        }
    }, []);

    // Either client can click "Next Game". ensureNextSeriesGame is race-safe:
    // if the opponent created it first, this returns the existing row.
    const handleNextSeriesGame = useCallback(async () => {
        if (!gameRow?.series_id) return;
        try {
            const next = await ensureNextSeriesGame(
                gameRow.series_id,
                (gameRow.game_number || 1) + 1,
                gameRow.home_user_id, gameRow.away_user_id || '',
                gameRow.home_user_email || '', gameRow.away_user_email || '',
            );
            window.location.hash = `game/${next.id}`;
        } catch (e) {
            console.error('Failed to advance to next series game', e);
        }
    }, [gameRow]);

    if (error) {
        return (
            <div className="game-page loading">
                <div className="game-error">{error}</div>
                <button onClick={onBack} className="back-btn-simple">Back to Lobby</button>
            </div>
        );
    }

    if (loading || !gameState || !myRole) {
        // Always offer a Back to Lobby escape hatch — easy to get stuck on
        // this screen when waiting for an opponent who isn't coming, or
        // when the WS is still connecting.
        return (
            <div className="game-page loading">
                <div>{status || 'Loading game...'}</div>
                <button onClick={onBack} className="back-btn-simple" style={{ marginTop: 20 }}>
                    &larr; Back to Lobby
                </button>
            </div>
        );
    }

    const isMyTurn = myTurn === myRole && !opponentDisconnected;

    return (
        <div className="game-page">
            <GameBoard
                state={gameState}
                myRole={myRole}
                isMyTurn={isMyTurn}
                onAction={handleAction}
                pendingMovements={pendingMovements}
                onMovementsConsumed={() => setPendingMovements([])}
                homeName={homeName}
                awayName={awayName}
                seriesInfo={seriesRow ? {
                    gameNumber: gameRow?.game_number || 1,
                    bestOf: seriesRow.best_of,
                    homeWins: seriesRow.home_wins || 0,
                    awayWins: seriesRow.away_wins || 0,
                } : undefined}
                onNextSeriesGame={seriesRow ? handleNextSeriesGame : undefined}
                onExit={onBack}
                myReadyForNext={myRole ? readyNext[myRole] : false}
                oppReadyForNext={myRole ? readyNext[myRole === 'home' ? 'away' : 'home'] : false}
                onToggleReadyForNext={toggleReadyForNext}
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
