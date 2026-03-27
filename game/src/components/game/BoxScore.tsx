import type { TeamState, BatterStats, PitcherStats } from '../../engine/gameEngine';
import './GameBoard.css';

interface BoxScoreProps {
    awayTeam: TeamState;
    homeTeam: TeamState;
    awayName: string;
    homeName: string;
}

/** Box Score component — batting and pitching stats */
export default function BoxScore({ awayTeam, homeTeam, awayName, homeName }: BoxScoreProps) {
    const formatIP = (thirds: number) => {
        const full = Math.floor(thirds / 3);
        const rem = thirds % 3;
        return rem === 0 ? `${full}.0` : `${full}.${rem}`;
    };

    const formatAVG = (h: number, ab: number) => {
        if (ab === 0) return '.000';
        return (h / ab).toFixed(3).replace(/^0/, '');
    };

    const renderBattingTable = (team: TeamState, label: string) => {
        const stats = team.batterStats || {};
        return (
            <>
                <div className="stats-section-label">{label} BATTING</div>
                <table className="stats-table">
                    <thead>
                        <tr>
                            <th>PLAYER</th><th>AB</th><th>H</th><th>R</th><th>RBI</th>
                            <th>BB</th><th>SO</th><th>HR</th><th>SB</th><th>AVG</th>
                        </tr>
                    </thead>
                    <tbody>
                        {team.lineup.map((p, i) => {
                            const s: BatterStats = stats[p.cardId] || { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, sb: 0, cs: 0 };
                            return (
                                <tr key={`bat-${i}`}>
                                    <td>{p.name}</td>
                                    <td>{s.ab}</td><td>{s.h}</td><td>{s.r}</td><td>{s.rbi}</td>
                                    <td>{s.bb}</td><td>{s.so}</td><td>{s.hr}</td><td>{s.sb}</td>
                                    <td>{formatAVG(s.h, s.ab)}</td>
                                </tr>
                            );
                        })}
                        <tr style={{ borderTop: '2px solid #d4a018' }}>
                            <td style={{ color: '#d4a018' }}>TOTALS</td>
                            {(() => {
                                const totals = team.lineup.reduce((acc, p) => {
                                    const s: BatterStats = stats[p.cardId] || { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, sb: 0, cs: 0 };
                                    return { ab: acc.ab + s.ab, h: acc.h + s.h, r: acc.r + s.r, rbi: acc.rbi + s.rbi, bb: acc.bb + s.bb, so: acc.so + s.so, hr: acc.hr + s.hr, sb: acc.sb + s.sb };
                                }, { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, sb: 0 });
                                return (
                                    <>
                                        <td>{totals.ab}</td><td>{totals.h}</td><td>{totals.r}</td><td>{totals.rbi}</td>
                                        <td>{totals.bb}</td><td>{totals.so}</td><td>{totals.hr}</td><td>{totals.sb}</td>
                                        <td>{formatAVG(totals.h, totals.ab)}</td>
                                    </>
                                );
                            })()}
                        </tr>
                    </tbody>
                </table>
            </>
        );
    };

    const renderPitchingTable = (team: TeamState, label: string) => {
        const stats = team.pitcherStats || {};
        // Get all pitcher cardIds that have stats
        const pitcherIds = Object.keys(stats).filter(id => {
            const s = stats[id];
            return s && (s.bf > 0 || s.ip > 0);
        });

        return (
            <>
                <div className="stats-section-label">{label} PITCHING</div>
                <table className="stats-table">
                    <thead>
                        <tr>
                            <th>PITCHER</th><th>IP</th><th>H</th><th>R</th>
                            <th>BB</th><th>SO</th><th>HR</th><th>BF</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pitcherIds.map((id, i) => {
                            const s: PitcherStats = stats[id] || { ip: 0, h: 0, r: 0, bb: 0, so: 0, hr: 0, bf: 0 };
                            // Find pitcher name
                            const p = team.pitcher.cardId === id ? team.pitcher
                                : team.bullpen.find(bp => bp.cardId === id);
                            const name = p?.name || id;
                            return (
                                <tr key={`pit-${i}`}>
                                    <td>{name}{team.pitcher.cardId === id ? ' *' : ''}</td>
                                    <td>{formatIP(s.ip)}</td><td>{s.h}</td><td>{s.r}</td>
                                    <td>{s.bb}</td><td>{s.so}</td><td>{s.hr}</td><td>{s.bf}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </>
        );
    };

    return (
        <div>
            {renderBattingTable(awayTeam, awayName.toUpperCase())}
            {renderPitchingTable(awayTeam, awayName.toUpperCase())}
            {renderBattingTable(homeTeam, homeName.toUpperCase())}
            {renderPitchingTable(homeTeam, homeName.toUpperCase())}
        </div>
    );
}
