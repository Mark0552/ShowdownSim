import { useState, useEffect } from 'react';
import { getGameHistory, getCareerBattingStats, getCareerPitchingStats } from '../lib/stats';
import { supabase } from '../lib/supabase';
import type { GameRow } from '../types/game';
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

    // Career
    const [battingStats, setBattingStats] = useState<any[]>([]);
    const [pitchingStats, setPitchingStats] = useState<any[]>([]);
    const [sortKey, setSortKey] = useState('h');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
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

    const sortedBatting = [...battingStats].sort((a, b) => {
        const av = sortKey === 'avg' ? (a.ab > 0 ? a.h / a.ab : 0) : (a[sortKey] ?? 0);
        const bv = sortKey === 'avg' ? (b.ab > 0 ? b.h / b.ab : 0) : (b[sortKey] ?? 0);
        return sortDir === 'desc' ? bv - av : av - bv;
    });

    const sortedPitching = [...pitchingStats].sort((a, b) => {
        const av = sortKey === 'era' ? (a.ip > 0 ? (a.r * 9) / (a.ip / 3) : 99) : (a[sortKey] ?? 0);
        const bv = sortKey === 'era' ? (b.ip > 0 ? (b.r * 9) / (b.ip / 3) : 99) : (b[sortKey] ?? 0);
        return sortDir === 'desc' ? bv - av : av - bv;
    });

    const fmtAvg = (h: number, ab: number) => ab === 0 ? '.000' : (h / ab).toFixed(3).replace(/^0/, '');
    const fmtEra = (r: number, ip: number) => ip === 0 ? '-' : ((r * 9) / (ip / 3)).toFixed(2);
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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {games.map(game => {
                                            const isHome = game.home_user_id === userId;
                                            const opponent = isHome ? game.away_user_email : game.home_user_email;
                                            const myLineup = isHome ? game.home_lineup_name : game.away_lineup_name;
                                            const won = game.winner_user_id === userId;
                                            const homeScore = game.state?.homeTeam?.runs ?? '?';
                                            const awayScore = game.state?.awayTeam?.runs ?? '?';
                                            const score = isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;
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
                                                <th className="sortable" onClick={() => handleSort('ab')}>AB{sortIndicator('ab')}</th>
                                                <th className="sortable" onClick={() => handleSort('h')}>H{sortIndicator('h')}</th>
                                                <th className="sortable" onClick={() => handleSort('hr')}>HR{sortIndicator('hr')}</th>
                                                <th className="sortable" onClick={() => handleSort('r')}>R{sortIndicator('r')}</th>
                                                <th className="sortable" onClick={() => handleSort('rbi')}>RBI{sortIndicator('rbi')}</th>
                                                <th className="sortable" onClick={() => handleSort('bb')}>BB{sortIndicator('bb')}</th>
                                                <th className="sortable" onClick={() => handleSort('so')}>SO{sortIndicator('so')}</th>
                                                <th className="sortable" onClick={() => handleSort('sb')}>SB{sortIndicator('sb')}</th>
                                                <th className="sortable" onClick={() => handleSort('avg')}>AVG{sortIndicator('avg')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedBatting.map(s => (
                                                <tr key={s.card_id}>
                                                    <td className="stats-player-name">{s.card_name}</td>
                                                    <td>{s.games}</td>
                                                    <td>{s.ab}</td>
                                                    <td>{s.h}</td>
                                                    <td>{s.hr}</td>
                                                    <td>{s.r}</td>
                                                    <td>{s.rbi}</td>
                                                    <td>{s.bb}</td>
                                                    <td>{s.so}</td>
                                                    <td>{s.sb}</td>
                                                    <td>{fmtAvg(s.h, s.ab)}</td>
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
                                                <th className="sortable" onClick={() => handleSort('ip')}>IP{sortIndicator('ip')}</th>
                                                <th className="sortable" onClick={() => handleSort('h')}>H{sortIndicator('h')}</th>
                                                <th className="sortable" onClick={() => handleSort('r')}>R{sortIndicator('r')}</th>
                                                <th className="sortable" onClick={() => handleSort('bb')}>BB{sortIndicator('bb')}</th>
                                                <th className="sortable" onClick={() => handleSort('so')}>SO{sortIndicator('so')}</th>
                                                <th className="sortable" onClick={() => handleSort('hr')}>HR{sortIndicator('hr')}</th>
                                                <th className="sortable" onClick={() => handleSort('bf')}>BF{sortIndicator('bf')}</th>
                                                <th className="sortable" onClick={() => handleSort('era')}>ERA{sortIndicator('era')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedPitching.map(s => (
                                                <tr key={s.card_id}>
                                                    <td className="stats-player-name">{s.card_name}</td>
                                                    <td>{s.games}</td>
                                                    <td>{s.wins}</td>
                                                    <td>{fmtIp(s.ip)}</td>
                                                    <td>{s.h}</td>
                                                    <td>{s.r}</td>
                                                    <td>{s.bb}</td>
                                                    <td>{s.so}</td>
                                                    <td>{s.hr}</td>
                                                    <td>{s.bf}</td>
                                                    <td>{fmtEra(s.r, s.ip)}</td>
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
        </div>
    );
}
