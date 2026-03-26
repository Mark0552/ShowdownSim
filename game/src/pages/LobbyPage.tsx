import { useState, useEffect } from 'react';
import type { GameRow } from '../types/game';
import type { SavedLineup } from '../lib/lineups';
import { createGame, getOpenGames, getMyGames, joinGame, selectLineup, deleteGame, subscribeToGame, subscribeToLobby, getMyRole } from '../lib/games';
import { getLineups } from '../lib/lineups';
import { supabase } from '../lib/supabase';
import './LobbyPage.css';

interface Props {
    onBack: () => void;
    onGameStart: (gameId: string) => void;
}

export default function LobbyPage({ onBack, onGameStart }: Props) {
    const [openGames, setOpenGames] = useState<GameRow[]>([]);
    const [myGames, setMyGames] = useState<GameRow[]>([]);
    const [myLineups, setMyLineups] = useState<SavedLineup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState('');

    // Game we're currently in the lineup-select phase for
    const [activeGame, setActiveGame] = useState<GameRow | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id);
        });
    }, []);

    // Load data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [open, mine, lineups] = await Promise.all([
                    getOpenGames(),
                    getMyGames(),
                    getLineups(),
                ]);
                setOpenGames(open);
                setMyGames(mine);
                setMyLineups(lineups);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();

        // Subscribe to lobby changes
        const channel = subscribeToLobby(setOpenGames);
        return () => { channel.unsubscribe(); };
    }, []);

    // Subscribe to active game for lineup select + poll as fallback
    useEffect(() => {
        if (!activeGame) return;

        // Realtime subscription
        const channel = subscribeToGame(activeGame.id, (updated) => {
            setActiveGame(updated);
            if (updated.home_ready && updated.away_ready && updated.status === 'lineup_select') {
                onGameStart(updated.id);
            }
        });

        // Polling fallback every 3 seconds (Realtime can be unreliable)
        const poll = setInterval(async () => {
            try {
                const { data } = await supabase.from('games').select('*').eq('id', activeGame.id).single();
                if (data) {
                    setActiveGame(data);
                    if (data.home_ready && data.away_ready && data.status === 'lineup_select') {
                        onGameStart(data.id);
                    }
                }
            } catch (e) { /* ignore */ }
        }, 3000);

        return () => {
            channel.unsubscribe();
            clearInterval(poll);
        };
    }, [activeGame?.id]);

    const handleCreate = async () => {
        try {
            const game = await createGame();
            setActiveGame(game);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleJoin = async (game: GameRow) => {
        try {
            const updated = await joinGame(game.id);
            setActiveGame(updated);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleSelectLineup = async (lineup: SavedLineup) => {
        if (!activeGame || !userId) return;
        const role = getMyRole(activeGame, userId);
        if (!role) return;
        try {
            await selectLineup(activeGame.id, role, lineup.id, lineup.name, lineup.data);
            // Refresh
            const { data } = await supabase.from('games').select('*').eq('id', activeGame.id).single();
            if (data) {
                setActiveGame(data);
                if (data.home_ready && data.away_ready) {
                    onGameStart(data.id);
                }
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCancelGame = async () => {
        if (activeGame) {
            try {
                await deleteGame(activeGame.id);
            } catch (e) { /* ignore */ }
        }
        setActiveGame(null);
    };

    const handleResumeGame = (game: GameRow) => {
        if (game.status === 'lineup_select') {
            setActiveGame(game);
        } else if (game.status === 'in_progress') {
            onGameStart(game.id);
        }
    };

    const formatTime = (d: string) => {
        const date = new Date(d);
        const mins = Math.floor((Date.now() - date.getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Lineup selection view
    if (activeGame) {
        const role = getMyRole(activeGame, userId);
        const myReady = role === 'home' ? activeGame.home_ready : activeGame.away_ready;
        const oppReady = role === 'home' ? activeGame.away_ready : activeGame.home_ready;
        const oppEmail = role === 'home' ? activeGame.away_user_email : activeGame.home_user_email;
        const waiting = activeGame.status === 'waiting';

        return (
            <div className="lobby-page">
                <div className="lobby-container">
                    <div className="lobby-header">
                        <button className="lobby-back" onClick={handleCancelGame}>&larr; Cancel</button>
                        <h1>{waiting ? 'Waiting for Opponent' : 'Select Lineup'}</h1>
                        <div />
                    </div>

                    {waiting && (
                        <div className="lobby-waiting">
                            <div className="waiting-spinner" />
                            <p>Waiting for another player to join...</p>
                            <p className="waiting-id">Game ID: {activeGame.id.slice(0, 8)}</p>
                        </div>
                    )}

                    {!waiting && (
                        <>
                            <div className="lobby-matchup">
                                <div className={`matchup-player ${myReady ? 'ready' : ''}`}>
                                    <span className="matchup-label">You</span>
                                    {myReady && <span className="matchup-lineup">{role === 'home' ? activeGame.home_lineup_name : activeGame.away_lineup_name}</span>}
                                    <span className={`matchup-status ${myReady ? 'ready' : ''}`}>{myReady ? 'Ready' : 'Selecting...'}</span>
                                </div>
                                <span className="matchup-vs">VS</span>
                                <div className={`matchup-player ${oppReady ? 'ready' : ''}`}>
                                    <span className="matchup-label">{oppEmail || 'Opponent'}</span>
                                    {oppReady && <span className="matchup-lineup">{role === 'home' ? activeGame.away_lineup_name : activeGame.home_lineup_name}</span>}
                                    <span className={`matchup-status ${oppReady ? 'ready' : ''}`}>{oppReady ? 'Ready' : 'Selecting...'}</span>
                                </div>
                            </div>

                            {!myReady && (
                                <div className="lineup-picker">
                                    <h2>Choose Your Lineup</h2>
                                    {myLineups.length === 0 && (
                                        <p className="no-lineups">No saved lineups. Go back and create one first.</p>
                                    )}
                                    <div className="lineup-picker-grid">
                                        {myLineups.map(lineup => {
                                            const count = lineup.data?.slots?.length || 0;
                                            return (
                                                <button key={lineup.id} className="lineup-pick-btn" onClick={() => handleSelectLineup(lineup)}>
                                                    <span className="pick-name">{lineup.name}</span>
                                                    <span className="pick-meta">{count} players</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {myReady && !oppReady && (
                                <div className="lobby-waiting">
                                    <div className="waiting-spinner" />
                                    <p>Waiting for opponent to select lineup...</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="lobby-page">
            <div className="lobby-container">
                <div className="lobby-header">
                    <button className="lobby-back" onClick={onBack}>&larr; Back</button>
                    <h1>Game Lobby</h1>
                    <button className="lobby-create" onClick={handleCreate}>Create Game</button>
                </div>

                {error && <div className="lobby-error">{error}</div>}

                {/* My active games */}
                {myGames.length > 0 && (
                    <div className="lobby-section">
                        <h2>My Games</h2>
                        <div className="lobby-games">
                            {myGames.map(game => {
                                const role = getMyRole(game, userId);
                                const opp = role === 'home' ? game.away_user_email : game.home_user_email;
                                const isCreator = game.home_user_id === userId;
                                return (
                                    <div key={game.id} className="game-row">
                                        <div className="game-info">
                                            <span className="game-opponent">vs {opp || '???'}</span>
                                            <span className={`game-status status-${game.status}`}>{game.status.replace('_', ' ')}</span>
                                        </div>
                                        <div className="game-actions">
                                            <button className="game-resume" onClick={() => handleResumeGame(game)}>
                                                {game.status === 'in_progress' ? 'Resume' : 'Continue'}
                                            </button>
                                            {isCreator && (
                                                <button className="game-delete" onClick={async () => {
                                                    if (confirm('Delete this game?')) {
                                                        try {
                                                            await deleteGame(game.id);
                                                            setMyGames(prev => prev.filter(g => g.id !== game.id));
                                                        } catch (err: any) {
                                                            setError(err.message);
                                                        }
                                                    }
                                                }}>Delete</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Open games to join */}
                <div className="lobby-section">
                    <h2>Open Games</h2>
                    {loading && <p className="lobby-loading">Loading...</p>}
                    {!loading && openGames.length === 0 && (
                        <p className="lobby-empty">No open games. Create one!</p>
                    )}
                    <div className="lobby-games">
                        {openGames.map(game => (
                            <div key={game.id} className="game-row">
                                <div className="game-info">
                                    <span className="game-host">{game.home_user_email}</span>
                                    <span className="game-time">{formatTime(game.created_at)}</span>
                                </div>
                                <button className="game-join" onClick={() => handleJoin(game)}>Join</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
