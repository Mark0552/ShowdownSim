import { useState, useEffect, useMemo } from 'react';
import { getGameHistory, getCareerBattingStats, getCareerPitchingStats } from '../lib/stats';
import { supabase } from '../lib/supabase';
import { getUser } from '../lib/auth';
import { getSeries } from '../lib/series';
import type { GameRow, SeriesRow } from '../types/game';
import type { Card } from '../types/cards';
import { loadCards } from '../data/cardData';
import BoxScore from '../components/game/BoxScore';
import GameLogOverlay from '../components/game/GameLogOverlay';
import CardTooltip from '../components/cards/CardTooltip';
import SeriesCard from '../components/lobby/SeriesCard';
import './StatsPage.css';

interface Props {
    onBack: () => void;
}

type Tab = 'history' | 'career';
type CareerTab = 'hitters' | 'pitchers';
type SortDir = 'asc' | 'desc';

export default function StatsPage({ onBack }: Props) {
    const [tab, setTab] = useState<Tab>('history');
    const [careerTab, setCareerTab] = useState<CareerTab>('hitters');
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState('');

    // History
    const [games, setGames] = useState<GameRow[]>([]);
    const [seriesById, setSeriesById] = useState<Record<string, SeriesRow>>({});
    const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
    const [detailTab, setDetailTab] = useState<'box' | 'log'>('box');

    // Card lookup for hover tooltip — cached load
    const [cardsList, setCardsList] = useState<Card[]>([]);
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
    useEffect(() => { loadCards().then(({ all }) => setCardsList(all)); }, []);
    const cardsMap = useMemo(() => {
        const m = new Map<string, Card>();
        for (const c of cardsList) m.set(c.id, c);
        return m;
    }, [cardsList]);
    const showCard = (cardId: string) => {
        const c = cardsMap.get(cardId);
        if (c) setHoveredCard(c);
    };
    const hideCard = () => setHoveredCard(null);

    // Career
    const [battingStats, setBattingStats] = useState<any[]>([]);
    const [pitchingStats, setPitchingStats] = useState<any[]>([]);
    const [sortKey, setSortKey] = useState('h');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        getUser().then((user) => {
            if (user) setUserId(user.id);
        });
    }, []);

    useEffect(() => {
        setLoading(true);
        if (tab === 'history') {
            getGameHistory().then(data => { setGames(data); setLoading(false); }).catch(() => setLoading(false));
        } else {
            Promise.all([getCareerBattingStats(), getCareerPitchingStats()])
                .then(([b, p]) => { setBattingStats(b); setPitchingStats(p); setLoading(false); })
                .catch(() => setLoading(false));
        }
    }, [tab]);

    // Fetch series rows referenced by history games
    useEffect(() => {
        const ids = Array.from(new Set(games.map(g => g.series_id).filter(Boolean) as string[]));
        const missing = ids.filter(id => !seriesById[id]);
        if (missing.length === 0) return;
        Promise.all(missing.map(id => getSeries(id).catch(() => null))).then(rows => {
            setSeriesById(prev => {
                const next = { ...prev };
                for (const r of rows) { if (r) next[r.id] = r; }
                return next;
            });
        });
    }, [games]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortIndicator = (key: string) => sortKey === key ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

    const calcBatVal = (s: any, key: string) => {
        if (key === 'avg') return s.ab > 0 ? s.h / s.ab : 0;
        if (key === 'obp') { const d = s.ab + s.bb + (s.ibb || 0) + (s.sf || 0); return d > 0 ? (s.h + s.bb + (s.ibb || 0)) / d : 0; }
        if (key === 'slg') return s.ab > 0 ? (s.tb || 0) / s.ab : 0;
        if (key === 'ops') { const d = s.ab + s.bb + (s.ibb || 0) + (s.sf || 0); const obp = d > 0 ? (s.h + s.bb + (s.ibb || 0)) / d : 0; const slg = s.ab > 0 ? (s.tb || 0) / s.ab : 0; return obp + slg; }
        return s[key] ?? 0;
    };
    const sortedBatting = [...battingStats].sort((a, b) => {
        const av = calcBatVal(a, sortKey);
        const bv = calcBatVal(b, sortKey);
        const primary = sortDir === 'desc' ? bv - av : av - bv;
        if (primary !== 0) return primary;
        return (a.card_id || '').localeCompare(b.card_id || '');
    });

    const sortedPitching = [...pitchingStats].sort((a, b) => {
        const av = sortKey === 'era' ? (a.ip > 0 ? (a.r * 9) / (a.ip / 3) : 99) : (a[sortKey] ?? 0);
        const bv = sortKey === 'era' ? (b.ip > 0 ? (b.r * 9) / (b.ip / 3) : 99) : (b[sortKey] ?? 0);
        const primary = sortDir === 'desc' ? bv - av : av - bv;
        if (primary !== 0) return primary;
        return (a.card_id || '').localeCompare(b.card_id || '');
    });

    const fmt3 = (n: number) => n === 0 ? '.000' : n.toFixed(3).replace(/^0/, '');
    const fmtAvg = (h: number, ab: number) => ab === 0 ? '.000' : fmt3(h / ab);
    const fmtObp = (s: any) => {
        const denom = (s.ab || 0) + (s.bb || 0) + (s.ibb || 0) + (s.sf || 0);
        return denom === 0 ? '.000' : fmt3(((s.h || 0) + (s.bb || 0) + (s.ibb || 0)) / denom);
    };
    const fmtSlg = (s: any) => (s.ab || 0) === 0 ? '.000' : fmt3((s.tb || 0) / s.ab);
    const fmtOps = (s: any) => {
        const denom = (s.ab || 0) + (s.bb || 0) + (s.ibb || 0) + (s.sf || 0);
        const obp = denom === 0 ? 0 : ((s.h || 0) + (s.bb || 0) + (s.ibb || 0)) / denom;
        const slg = (s.ab || 0) === 0 ? 0 : (s.tb || 0) / s.ab;
        return fmt3(obp + slg);
    };
    const fmtEra = (r: number, ip: number) => ip === 0 ? '-' : ((r * 9) / (ip / 3)).toFixed(2);
    const fmtWhip = (s: any) => s.ip === 0 ? '-' : (((s.h || 0) + (s.bb || 0)) / (s.ip / 3)).toFixed(2);
    const fmtIp = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

    return (
        <div className="stats-page">
            <div className="stats-container">
                <div className="stats-header">
                    <button className="stats-back" onClick={onBack}>&larr; Back</button>
                    <h1>Stats</h1>
                    <div />
                </div>

                <div className="stats-tabs">
                    <button className={`stats-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Game History</button>
                    <button className={`stats-tab ${tab === 'career' ? 'active' : ''}`} onClick={() => setTab('career')}>Career Stats</button>
                </div>

                {loading && <p className="stats-loading">Loading...</p>}

                {!loading && tab === 'history' && (() => {
                    if (games.length === 0) {
                        return <div className="stats-history"><p className="stats-empty">No finished games yet.</p></div>;
                    }

                    // Overall + last-10 record
                    const totalWins = games.filter(g => g.winner_user_id === userId).length;
                    const totalLosses = games.length - totalWins;
                    const pct = games.length > 0 ? totalWins / games.length : 0;
                    const last10 = games.slice(0, 10);
                    const l10Wins = last10.filter(g => g.winner_user_id === userId).length;
                    const l10Losses = last10.length - l10Wins;

                    // Group into series + standalone
                    const seriesGroups: Record<string, GameRow[]> = {};
                    const standalone: GameRow[] = [];
                    for (const g of games) {
                        if (g.series_id) {
                            (seriesGroups[g.series_id] ??= []).push(g);
                        } else {
                            standalone.push(g);
                        }
                    }
                    // Sort combined list (series + standalone) by most-recent activity
                    const seriesIds = Object.keys(seriesGroups);
                    type Entry = { kind: 'series'; id: string; ts: number } | { kind: 'game'; game: GameRow; ts: number };
                    const entries: Entry[] = [
                        ...seriesIds.map(id => ({
                            kind: 'series' as const,
                            id,
                            ts: Math.max(...seriesGroups[id].map(g => new Date(g.created_at).getTime())),
                        })),
                        ...standalone.map(g => ({
                            kind: 'game' as const,
                            game: g,
                            ts: new Date(g.created_at).getTime(),
                        })),
                    ].sort((a, b) => b.ts - a.ts);

                    return (
                        <div className="stats-history">
                            <div className="stats-record-strip">
                                <span className="stats-record-overall">
                                    Overall: <strong>{totalWins}-{totalLosses}</strong>
                                    {games.length > 0 && (
                                        <span className="stats-record-pct"> ({pct.toFixed(3).replace(/^0/, '')})</span>
                                    )}
                                </span>
                                <span className="stats-record-sep">·</span>
                                <span className="stats-record-l10">
                                    Last {last10.length}: <strong>{l10Wins}-{l10Losses}</strong>
                                </span>
                            </div>

                            {entries.map(entry => {
                                if (entry.kind === 'series') {
                                    const series = seriesById[entry.id];
                                    const seriesGames = seriesGroups[entry.id];
                                    if (!series) return null;
                                    return (
                                        <SeriesCard
                                            key={`s-${entry.id}`}
                                            series={series}
                                            games={seriesGames}
                                            userId={userId}
                                            onGameClick={(game) => {
                                                if (game.state?.homeTeam && game.state?.awayTeam) {
                                                    setSelectedGame(game);
                                                    setDetailTab('box');
                                                }
                                            }}
                                        />
                                    );
                                }
                                const game = entry.game;
                                const isHome = game.home_user_id === userId;
                                const opponent = isHome ? game.away_user_email : game.home_user_email;
                                const won = game.winner_user_id === userId;
                                const homeScore = game.state?.score?.home ?? '?';
                                const awayScore = game.state?.score?.away ?? '?';
                                const score = isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;
                                const hasState = !!game.state?.homeTeam && !!game.state?.awayTeam;
                                return (
                                    <div key={`g-${game.id}`} className="stats-standalone-row">
                                        <span className="stats-standalone-date">{new Date(game.created_at).toLocaleDateString()}</span>
                                        <span className="stats-standalone-opp">
                                            {isHome ? `vs ${opponent || '???'}` : `@ ${opponent || '???'}`}
                                        </span>
                                        <span className={`stats-result ${won ? 'win' : 'loss'}`}>
                                            {won ? 'W' : 'L'} {score}
                                        </span>
                                        {hasState && (
                                            <button className="stats-view-btn" onClick={() => { setSelectedGame(game); setDetailTab('box'); }}>
                                                View
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {!loading && tab === 'career' && (
                    <div className="stats-career">
                        <div className="stats-career-tabs">
                            <button className={`stats-career-tab ${careerTab === 'hitters' ? 'active' : ''}`} onClick={() => { setCareerTab('hitters'); setSortKey('h'); setSortDir('desc'); }}>Hitters</button>
                            <button className={`stats-career-tab ${careerTab === 'pitchers' ? 'active' : ''}`} onClick={() => { setCareerTab('pitchers'); setSortKey('wins'); setSortDir('desc'); }}>Pitchers</button>
                        </div>

                        {careerTab === 'hitters' && (
                            <div className="stats-table-wrap">
                                {sortedBatting.length === 0 && <p className="stats-empty">No batting stats recorded yet.</p>}
                                {sortedBatting.length > 0 && (
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Player</th>
                                                <th className="sortable" onClick={() => handleSort('games')}>G{sortIndicator('games')}</th>
                                                <th className="sortable" onClick={() => handleSort('pa')}>PA{sortIndicator('pa')}</th>
                                                <th className="sortable" onClick={() => handleSort('ab')}>AB{sortIndicator('ab')}</th>
                                                <th className="sortable" onClick={() => handleSort('h')}>H{sortIndicator('h')}</th>
                                                <th className="sortable" onClick={() => handleSort('db')}>2B{sortIndicator('db')}</th>
                                                <th className="sortable" onClick={() => handleSort('tr')}>3B{sortIndicator('tr')}</th>
                                                <th className="sortable" onClick={() => handleSort('hr')}>HR{sortIndicator('hr')}</th>
                                                <th className="sortable" onClick={() => handleSort('r')}>R{sortIndicator('r')}</th>
                                                <th className="sortable" onClick={() => handleSort('rbi')}>RBI{sortIndicator('rbi')}</th>
                                                <th className="sortable" onClick={() => handleSort('sb')}>SB{sortIndicator('sb')}</th>
                                                <th className="sortable" onClick={() => handleSort('bb')}>BB{sortIndicator('bb')}</th>
                                                <th className="sortable" onClick={() => handleSort('ibb')}>IBB{sortIndicator('ibb')}</th>
                                                <th className="sortable" onClick={() => handleSort('so')}>SO{sortIndicator('so')}</th>
                                                <th className="sortable" onClick={() => handleSort('avg')}>AVG{sortIndicator('avg')}</th>
                                                <th className="sortable" onClick={() => handleSort('obp')}>OBP{sortIndicator('obp')}</th>
                                                <th className="sortable" onClick={() => handleSort('slg')}>SLG{sortIndicator('slg')}</th>
                                                <th className="sortable" onClick={() => handleSort('ops')}>OPS{sortIndicator('ops')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedBatting.map(s => (
                                                <tr key={s.card_id}>
                                                    <td className="stats-player-name stats-card-hover"
                                                        onMouseEnter={() => showCard(s.card_id)}
                                                        onMouseLeave={hideCard}>{s.card_name}</td>
                                                    <td>{s.games}</td>
                                                    <td>{s.pa}</td>
                                                    <td>{s.ab}</td>
                                                    <td>{s.h}</td>
                                                    <td>{s.db}</td>
                                                    <td>{s.tr}</td>
                                                    <td>{s.hr}</td>
                                                    <td>{s.r}</td>
                                                    <td>{s.rbi}</td>
                                                    <td>{s.sb}</td>
                                                    <td>{s.bb}</td>
                                                    <td>{s.ibb}</td>
                                                    <td>{s.so}</td>
                                                    <td>{fmtAvg(s.h, s.ab)}</td>
                                                    <td>{fmtObp(s)}</td>
                                                    <td>{fmtSlg(s)}</td>
                                                    <td>{fmtOps(s)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {careerTab === 'pitchers' && (
                            <div className="stats-table-wrap">
                                {sortedPitching.length === 0 && <p className="stats-empty">No pitching stats recorded yet.</p>}
                                {sortedPitching.length > 0 && (
                                    <table className="stats-table">
                                        <thead>
                                            <tr>
                                                <th>Player</th>
                                                <th className="sortable" onClick={() => handleSort('games')}>G{sortIndicator('games')}</th>
                                                <th className="sortable" onClick={() => handleSort('wins')}>W{sortIndicator('wins')}</th>
                                                <th className="sortable" onClick={() => handleSort('losses')}>L{sortIndicator('losses')}</th>
                                                <th className="sortable" onClick={() => handleSort('saves')}>SV{sortIndicator('saves')}</th>
                                                <th className="sortable" onClick={() => handleSort('ip')}>IP{sortIndicator('ip')}</th>
                                                <th className="sortable" onClick={() => handleSort('h')}>H{sortIndicator('h')}</th>
                                                <th className="sortable" onClick={() => handleSort('r')}>R{sortIndicator('r')}</th>
                                                <th className="sortable" onClick={() => handleSort('bb')}>BB{sortIndicator('bb')}</th>
                                                <th className="sortable" onClick={() => handleSort('ibb')}>IBB{sortIndicator('ibb')}</th>
                                                <th className="sortable" onClick={() => handleSort('so')}>SO{sortIndicator('so')}</th>
                                                <th className="sortable" onClick={() => handleSort('hr')}>HR{sortIndicator('hr')}</th>
                                                <th className="sortable" onClick={() => handleSort('bf')}>BF{sortIndicator('bf')}</th>
                                                <th className="sortable" onClick={() => handleSort('era')}>ERA{sortIndicator('era')}</th>
                                                <th className="sortable" onClick={() => handleSort('whip')}>WHIP{sortIndicator('whip')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedPitching.map(s => (
                                                <tr key={s.card_id}>
                                                    <td className="stats-player-name stats-card-hover"
                                                        onMouseEnter={() => showCard(s.card_id)}
                                                        onMouseLeave={hideCard}>{s.card_name}</td>
                                                    <td>{s.games}</td>
                                                    <td>{s.wins}</td>
                                                    <td>{s.losses}</td>
                                                    <td>{s.saves}</td>
                                                    <td>{fmtIp(s.ip)}</td>
                                                    <td>{s.h}</td>
                                                    <td>{s.r}</td>
                                                    <td>{s.bb}</td>
                                                    <td>{s.ibb}</td>
                                                    <td>{s.so}</td>
                                                    <td>{s.hr}</td>
                                                    <td>{s.bf}</td>
                                                    <td>{fmtEra(s.r, s.ip)}</td>
                                                    <td>{fmtWhip(s)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {hoveredCard && <CardTooltip card={hoveredCard} />}

            {selectedGame && selectedGame.state?.homeTeam && selectedGame.state?.awayTeam && (
                <div className="stats-game-modal" onClick={() => setSelectedGame(null)}>
                    <div className="stats-game-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="stats-game-modal-header">
                            <div className="stats-game-modal-title">
                                {selectedGame.away_user_email || 'Away'} {selectedGame.state.score.away}
                                {' \u2013 '}
                                {selectedGame.state.score.home} {selectedGame.home_user_email || 'Home'}
                                <span className="stats-game-modal-date">
                                    {new Date(selectedGame.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <button className="stats-game-modal-close" onClick={() => setSelectedGame(null)}>CLOSE</button>
                        </div>
                        <div className="stats-game-modal-tabs">
                            <button className={`stats-game-modal-tab ${detailTab === 'box' ? 'active' : ''}`} onClick={() => setDetailTab('box')}>Box Score</button>
                            <button className={`stats-game-modal-tab ${detailTab === 'log' ? 'active' : ''}`} onClick={() => setDetailTab('log')}>Game Log</button>
                        </div>
                        <div className="stats-game-modal-body">
                            {detailTab === 'box' ? (
                                <BoxScore
                                    awayTeam={selectedGame.state.awayTeam}
                                    homeTeam={selectedGame.state.homeTeam}
                                    awayName={selectedGame.away_lineup_name || 'Away'}
                                    homeName={selectedGame.home_lineup_name || 'Home'}
                                    onCardHover={showCard}
                                    onCardLeave={hideCard}
                                />
                            ) : (
                                <GameLogOverlay
                                    gameLog={selectedGame.state.gameLog || []}
                                    onClose={() => setSelectedGame(null)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
