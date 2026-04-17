import { useState, useEffect, useMemo } from 'react';
import { getGameHistory, getCareerBattingStats, getCareerPitchingStats } from '../lib/stats';
import { supabase } from '../lib/supabase';
import { getUser } from '../lib/auth';
import type { GameRow } from '../types/game';
import type { Card } from '../types/cards';
import { loadCards } from '../data/cardData';
import BoxScore from '../components/game/BoxScore';
import GameLogOverlay from '../components/game/GameLogOverlay';
import CardTooltip from '../components/cards/CardTooltip';
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
        return sortDir === 'desc' ? bv - av : av - bv;
    });

    const sortedPitching = [...pitchingStats].sort((a, b) => {
        const av = sortKey === 'era' ? (a.ip > 0 ? (a.r * 9) / (a.ip / 3) : 99) : (a[sortKey] ?? 0);
        const bv = sortKey === 'era' ? (b.ip > 0 ? (b.r * 9) / (b.ip / 3) : 99) : (b[sortKey] ?? 0);
        return sortDir === 'desc' ? bv - av : av - bv;
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

                {!loading && tab === 'history' && (
                    <div className="stats-history">
                        {games.length === 0 && <p className="stats-empty">No finished games yet.</p>}
                        <div className="stats-table-wrap">
                            {games.length > 0 && (
                                <table className="stats-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Opponent</th>
                                            <th>Result</th>
                                            <th>Lineup</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {games.map(game => {
                                            const isHome = game.home_user_id === userId;
                                            const opponent = isHome ? game.away_user_email : game.home_user_email;
                                            const myLineup = isHome ? game.home_lineup_name : game.away_lineup_name;
                                            const won = game.winner_user_id === userId;
                                            const homeScore = game.state?.score?.home ?? '?';
                                            const awayScore = game.state?.score?.away ?? '?';
                                            const score = isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;
                                            const hasState = !!game.state?.homeTeam && !!game.state?.awayTeam;
                                            return (
                                                <tr key={game.id}>
                                                    <td>{new Date(game.created_at).toLocaleDateString()}</td>
                                                    <td>{opponent || '???'}</td>
                                                    <td>
                                                        <span className={`stats-result ${won ? 'win' : 'loss'}`}>
                                                            {won ? 'W' : 'L'} {score}
                                                        </span>
                                                    </td>
                                                    <td>{myLineup || '-'}</td>
                                                    <td>
                                                        {hasState && (
                                                            <button className="stats-view-btn" onClick={() => { setSelectedGame(game); setDetailTab('box'); }}>
                                                                View
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

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
