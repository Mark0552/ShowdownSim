import { useState, useEffect, useRef } from 'react';
import type { GameRow, SeriesRow } from '../types/game';
import type { SavedLineup } from '../lib/lineups';
import { createGame, getOpenGames, getMyGames, joinGame, selectLineup, deleteGame, subscribeToGame, subscribeToLobby, subscribeToMyGames, getMyRole, createSeries, getSeries } from '../lib/games';
import { getLineups } from '../lib/lineups';
import { validateTeam } from '../logic/teamRules';
import { supabase } from '../lib/supabase';
import { getUser } from '../lib/auth';
import './LobbyPage.css';

interface Props {
    onBack: () => void;
    onGameStart: (gameId: string) => void;
}

export default function LobbyPage({ onBack, onGameStart }: Props) {
    const [openGames, setOpenGames] = useState<GameRow[]>([]);
    const [myGames, setMyGames] = useState<GameRow[]>([]);
    const [myLineups, setMyLineups] = useState<SavedLineup[]>([]);
    /** seriesId → series row, for tagging series games in the My Games list */
    const [seriesById, setSeriesById] = useState<Record<string, SeriesRow>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userId, setUserId] = useState('');

    // Game we're currently in the lineup-select phase for
    const [activeGame, setActiveGame] = useState<GameRow | null>(null);
    // Set to true when we initiate a delete ourselves, so the realtime
    // DELETE handler below doesn't show a "game was cancelled" toast on top
    // of our own intentional cancel.
    const selfDeletingRef = useRef(false);

    useEffect(() => {
        getUser().then((user) => {
            if (user) setUserId(user.id);
        });
    }, []);

    // Load data
    useEffect(() => {
        const refreshMyGames = async () => {
            try {
                const mine = await getMyGames();
                setMyGames(mine);
                // Pre-fetch any newly-referenced series rows we don't have yet
                const seriesIds = Array.from(new Set(mine.map(g => g.series_id).filter(Boolean) as string[]));
                if (seriesIds.length > 0) {
                    const rows = await Promise.all(seriesIds.map(id => getSeries(id).catch(() => null)));
                    setSeriesById(prev => {
                        const map = { ...prev };
                        for (const row of rows) { if (row && !map[row.id]) map[row.id] = row; }
                        return map;
                    });
                }
            } catch { /* ignore transient */ }
        };

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
                // Pre-fetch series data for any games tied to a series
                const seriesIds = Array.from(new Set([...open, ...mine].map(g => g.series_id).filter(Boolean) as string[]));
                if (seriesIds.length > 0) {
                    const rows = await Promise.all(seriesIds.map(id => getSeries(id).catch(() => null)));
                    const map: Record<string, SeriesRow> = {};
                    for (const row of rows) { if (row) map[row.id] = row; }
                    setSeriesById(map);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();

        // Subscribe to both: open-games (so inserts/deletes appear live) and
        // my-games (so a game deleted by the opponent disappears from my list).
        const lobbyCh = subscribeToLobby(setOpenGames);
        const myCh = subscribeToMyGames(refreshMyGames);
        return () => { lobbyCh.unsubscribe(); myCh.unsubscribe(); };
    }, []);

    // Subscribe to active game for lineup select + poll as fallback
    useEffect(() => {
        if (!activeGame) return;

        const handleGameGone = () => {
            if (selfDeletingRef.current) return; // we initiated the cancel
            setError('The other player cancelled this game.');
            setActiveGame(null);
            setSelectedLineup(null);
        };

        // Realtime subscription — updates on UPDATE, kicks out on DELETE
        const channel = subscribeToGame(activeGame.id, (updated) => {
            setActiveGame(updated);
            if (updated.home_ready && updated.away_ready && updated.status === 'lineup_select') {
                onGameStart(updated.id);
            }
        }, handleGameGone);

        // Polling fallback every 3 seconds (Realtime can be unreliable)
        const poll = setInterval(async () => {
            try {
                const { data, error } = await supabase.from('games').select('*').eq('id', activeGame.id).maybeSingle();
                if (error) return; // transient
                if (!data) { handleGameGone(); return; }
                setActiveGame(data);
                if (data.home_ready && data.away_ready && data.status === 'lineup_select') {
                    onGameStart(data.id);
                }
            } catch (e) { /* ignore */ }
        }, 3000);

        return () => {
            channel.unsubscribe();
            clearInterval(poll);
        };
    }, [activeGame?.id]);

    const [selectedLineup, setSelectedLineup] = useState<SavedLineup | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createBestOf, setCreateBestOf] = useState(1);
    const [createPassword, setCreatePassword] = useState('');

    const handleCreate = async (bestOf: number, password?: string) => {
        try {
            setShowCreateModal(false);
            setCreateBestOf(1);
            setCreatePassword('');
            const pw = password && password.trim() ? password.trim() : undefined;
            if (bestOf === 1) {
                const game = await createGame(pw);
                setActiveGame(game);
            } else {
                const { game } = await createSeries(bestOf, pw);
                setActiveGame(game);
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleJoin = async (game: GameRow) => {
        try {
            if (game.password) {
                const entered = window.prompt('This game is password-protected. Enter password:');
                if (entered === null) return; // cancelled
                if (entered !== game.password) {
                    setError('Incorrect password');
                    return;
                }
            }
            const updated = await joinGame(game.id);
            setActiveGame(updated);
        } catch (err: any) {
            setError(err?.message || 'Failed to join');
            // The row is likely gone — drop it from the open list immediately
            // so the user doesn't click the same stale entry again.
            setOpenGames(prev => prev.filter(g => g.id !== game.id));
            // And refetch in case the realtime subscription missed the delete.
            getOpenGames().then(setOpenGames).catch(() => { /* ignore */ });
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
            selfDeletingRef.current = true;
            try {
                await deleteGame(activeGame.id);
            } catch (e) { /* ignore */ }
            // Clear shortly after — long enough for the realtime DELETE
            // handler to no-op, short enough not to swallow a truly
            // opponent-initiated cancel later in the session.
            setTimeout(() => { selfDeletingRef.current = false; }, 2000);
        }
        setActiveGame(null);
        setSelectedLineup(null);
    };

    const handleResumeGame = (game: GameRow) => {
        // Series games 2+ are pre-populated with both lineups + both ready=true
        // by ensureNextSeriesGame. Skip the lineup-select UI in that case and
        // go straight into the game.
        if (game.status === 'lineup_select' && game.home_ready && game.away_ready) {
            onGameStart(game.id);
            return;
        }
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
                                            const validation = lineup.data?.slots ? validateTeam(lineup.data) : { valid: false, errors: [], totalPoints: 0, playerCount: 0 };
                                            const isSelected = selectedLineup?.id === lineup.id;
                                            return (
                                                <button
                                                    key={lineup.id}
                                                    className={`lineup-pick-btn ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => validation.valid ? setSelectedLineup(isSelected ? null : lineup) : undefined}
                                                    disabled={!validation.valid}
                                                    style={{
                                                        opacity: validation.valid ? 1 : 0.4,
                                                        cursor: validation.valid ? 'pointer' : 'not-allowed',
                                                        border: isSelected ? '2px solid #4ade80' : undefined,
                                                    }}
                                                >
                                                    <span className="pick-name">
                                                        <span style={{ color: isSelected ? '#4ade80' : validation.valid ? '#8aade0' : '#e94560', marginRight: 6 }}>
                                                            {isSelected ? '\u2713' : validation.valid ? '\u25CB' : '\u2717'}
                                                        </span>
                                                        {lineup.name}
                                                    </span>
                                                    <span className="pick-meta">{count} players {'\u2022'} {validation.totalPoints.toLocaleString()} pts</span>
                                                    {!validation.valid && (
                                                        <span className="pick-meta" style={{ color: '#e94560', fontSize: 10 }}>Invalid</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {selectedLineup && (
                                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                                            <button
                                                className="lobby-create"
                                                style={{ padding: '10px 32px', fontSize: 16 }}
                                                onClick={() => handleSelectLineup(selectedLineup)}
                                            >READY</button>
                                            <button
                                                className="lobby-back"
                                                onClick={() => setSelectedLineup(null)}
                                            >Deselect</button>
                                        </div>
                                    )}
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
                    <button className="lobby-create" onClick={() => setShowCreateModal(true)}>Create Game</button>
                </div>

                {showCreateModal && (
                    <div className="create-modal-overlay" onClick={() => setShowCreateModal(false)}>
                        <div className="create-modal" onClick={e => e.stopPropagation()}>
                            <h2 className="create-modal-title">CREATE GAME</h2>

                            <div className="create-modal-section">
                                <label className="create-modal-label">Series Type</label>
                                <div className="create-modal-series-row">
                                    {[{ v: 1, l: 'Single Game' }, { v: 3, l: 'Best of 3' }, { v: 5, l: 'Best of 5' }, { v: 7, l: 'Best of 7' }].map(opt => (
                                        <button
                                            key={opt.v}
                                            className={`create-modal-series-btn ${createBestOf === opt.v ? 'active' : ''}`}
                                            onClick={() => setCreateBestOf(opt.v)}
                                        >{opt.l}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="create-modal-section">
                                <label className="create-modal-label">Password (optional)</label>
                                <input
                                    type="text"
                                    className="create-modal-input"
                                    placeholder="Leave empty for public game"
                                    value={createPassword}
                                    onChange={e => setCreatePassword(e.target.value)}
                                />
                            </div>

                            <div className="create-modal-section create-modal-disabled">
                                <div className="create-modal-future-row">
                                    <span className="create-modal-label">Card Year Restrictions</span>
                                    <span className="create-modal-badge">Coming Soon</span>
                                </div>
                                <div className="create-modal-future-row">
                                    <span className="create-modal-label">Ruleset</span>
                                    <span className="create-modal-ruleset">Advanced</span>
                                    <span className="create-modal-badge">Coming Soon</span>
                                </div>
                            </div>

                            <div className="create-modal-actions">
                                <button className="create-modal-create-btn" onClick={() => handleCreate(createBestOf, createPassword)}>CREATE</button>
                                <button className="create-modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

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
                                const series = game.series_id ? seriesById[game.series_id] : null;
                                return (
                                    <div key={game.id} className="game-row">
                                        <div className="game-info">
                                            <span className="game-opponent">
                                                {role === 'away'
                                                    ? `@ ${game.home_user_email || 'Home'}`
                                                    : `vs ${game.away_user_email || 'Away'}`
                                                }
                                            </span>
                                            {series && (
                                                <span style={{
                                                    fontSize: 11, color: '#d4a018', background: 'rgba(212,160,24,0.12)',
                                                    padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(212,160,24,0.3)',
                                                    fontWeight: 600,
                                                }}>
                                                    SERIES — Game {game.game_number} of {series.best_of} ({series.home_user_email || 'Home'} {series.home_wins || 0}{'\u2013'}{series.away_wins || 0} {series.away_user_email || 'Away'})
                                                </span>
                                            )}
                                            <span className={`game-status status-${game.status}`}>{game.status === 'in_progress' && game.state?.inning
                                                ? `${game.state.halfInning === 'top' ? '\u25B2' : '\u25BC'}${game.state.inning} | ${game.state.score?.away ?? 0} - ${game.state.score?.home ?? 0}`
                                                : game.status.replace('_', ' ')}</span>
                                            {game.status === 'in_progress' && game.state?.score && (
                                                <span className="game-role-hint" style={{ fontSize: '11px', color: '#6a8aba' }}>
                                                    ({role === 'home' ? 'Home' : 'Away'})
                                                </span>
                                            )}
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
                                    <span className="game-host">
                                        {game.password && <span className="game-lock" title="Password protected">&#x1F512; </span>}
                                        {game.home_user_email}
                                    </span>
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
