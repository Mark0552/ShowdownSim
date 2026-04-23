import type { TeamState, BatterStats, PitcherStats } from '../../engine/gameEngine';
import './GameBoard.css';

interface BoxScoreProps {
    awayTeam: TeamState;
    homeTeam: TeamState;
    awayName: string;
    homeName: string;
    /** Optional: when provided, player-name cells become hoverable and emit cardId */
    onCardHover?: (cardId: string) => void;
    onCardLeave?: () => void;
}

const emptyBat: BatterStats = { pa: 0, ab: 0, h: 0, r: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hr: 0, db: 0, tr: 0, tb: 0, sb: 0, cs: 0, gidp: 0, sh: 0, sf: 0 };

const fmt3 = (n: number) => n === 0 ? '.000' : n.toFixed(3).replace(/^0/, '');
const fmtAvg = (h: number, ab: number) => ab === 0 ? '.000' : fmt3(h / ab);
const fmtObp = (s: BatterStats) => {
    const denom = s.ab + s.bb + s.ibb + s.sf;
    return denom === 0 ? '.000' : fmt3((s.h + s.bb + s.ibb) / denom);
};
const fmtSlg = (s: BatterStats) => s.ab === 0 ? '.000' : fmt3(s.tb / s.ab);
const fmtOps = (s: BatterStats) => {
    const denom = s.ab + s.bb + s.ibb + s.sf;
    const obp = denom === 0 ? 0 : (s.h + s.bb + s.ibb) / denom;
    const slg = s.ab === 0 ? 0 : s.tb / s.ab;
    return fmt3(obp + slg);
};
const fmtIp = (thirds: number) => {
    const full = Math.floor(thirds / 3);
    const rem = thirds % 3;
    return `${full}.${rem}`;
};
const fmtEra = (r: number, ip: number) => ip === 0 ? '-' : ((r * 9) / (ip / 3)).toFixed(2);
const fmtWhip = (s: PitcherStats) => s.ip === 0 ? '-' : ((s.h + s.bb) / (s.ip / 3)).toFixed(2);

/** Box Score component — full baseball-reference batting and pitching stats */
export default function BoxScore({ awayTeam, homeTeam, awayName, homeName, onCardHover, onCardLeave }: BoxScoreProps) {
    const hoverable = !!onCardHover;
    const nameCellProps = (cardId: string) => hoverable ? {
        className: 'box-card-hover',
        onMouseEnter: () => onCardHover?.(cardId),
        onMouseLeave: () => onCardLeave?.(),
    } : {};

    const renderBattingTable = (team: TeamState, label: string) => {
        const stats = team.batterStats || {};
        // Look up player by cardId from the current lineup, the bench, or
        // archivedPlayers (subbed-out players whose full data we preserved).
        const archived = (team as any).archivedPlayers || {};
        const findPlayer = (cardId: string) => {
            return team.lineup.find(p => p.cardId === cardId)
                || (team.bench || []).find(p => p.cardId === cardId)
                || archived[cardId]
                || null;
        };
        // Iterate the union of (current lineup) + (anyone with stats). Current
        // lineup keeps the batting order; subbed-out players (no longer in
        // lineup) get appended after.
        const orderedIds: string[] = [];
        for (const p of team.lineup) orderedIds.push(p.cardId);
        for (const cardId of Object.keys(stats)) {
            if (!orderedIds.includes(cardId)) orderedIds.push(cardId);
        }
        const rows = orderedIds
            .map((cardId, i) => {
                const p = findPlayer(cardId);
                if (!p) return null;
                const s: BatterStats = { ...emptyBat, ...(stats[cardId] || {}) };
                return { p, s, i };
            })
            .filter((r): r is { p: typeof team.lineup[number]; s: BatterStats; i: number } => r !== null)
            // Skip players who never appeared (no PA, no SB/CS, no R)
            .filter(r => r.s.pa > 0 || r.s.ab > 0 || r.s.bb > 0 || r.s.sb > 0 || r.s.cs > 0 || r.s.r > 0);

        const totals = rows.reduce((a, r) => {
            const s = r.s;
            return {
                pa: a.pa + s.pa, ab: a.ab + s.ab, h: a.h + s.h, r: a.r + s.r, rbi: a.rbi + s.rbi,
                bb: a.bb + s.bb, ibb: a.ibb + s.ibb, so: a.so + s.so, hr: a.hr + s.hr,
                db: a.db + s.db, tr: a.tr + s.tr, tb: a.tb + s.tb,
                sb: a.sb + s.sb, cs: a.cs + s.cs, gidp: a.gidp + s.gidp, sh: a.sh + s.sh, sf: a.sf + s.sf,
            };
        }, { ...emptyBat });

        return (
            <>
                <div className="stats-section-label">{label} BATTING</div>
                <table className="stats-table">
                    <thead>
                        <tr>
                            <th>PLAYER</th>
                            <th>PA</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th>
                            <th>R</th><th>RBI</th><th>SB</th><th>CS</th>
                            <th>BB</th><th>IBB</th><th>SO</th><th>GIDP</th><th>SH</th><th>SF</th>
                            <th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ p, s, i }) => (
                            <tr key={`bat-${i}`}>
                                <td {...nameCellProps(p.cardId)}>{p.name}</td>
                                <td>{s.pa}</td><td>{s.ab}</td><td>{s.h}</td><td>{s.db}</td><td>{s.tr}</td><td>{s.hr}</td>
                                <td>{s.r}</td><td>{s.rbi}</td><td>{s.sb}</td><td>{s.cs}</td>
                                <td>{s.bb}</td><td>{s.ibb}</td><td>{s.so}</td><td>{s.gidp}</td><td>{s.sh}</td><td>{s.sf}</td>
                                <td>{fmtAvg(s.h, s.ab)}</td>
                                <td>{fmtObp(s)}</td>
                                <td>{fmtSlg(s)}</td>
                                <td>{fmtOps(s)}</td>
                            </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid #d4a018' }}>
                            <td style={{ color: '#d4a018' }}>TOTALS</td>
                            <td>{totals.pa}</td><td>{totals.ab}</td><td>{totals.h}</td><td>{totals.db}</td><td>{totals.tr}</td><td>{totals.hr}</td>
                            <td>{totals.r}</td><td>{totals.rbi}</td><td>{totals.sb}</td><td>{totals.cs}</td>
                            <td>{totals.bb}</td><td>{totals.ibb}</td><td>{totals.so}</td><td>{totals.gidp}</td><td>{totals.sh}</td><td>{totals.sf}</td>
                            <td>{fmtAvg(totals.h, totals.ab)}</td>
                            <td>{fmtObp(totals)}</td>
                            <td>{fmtSlg(totals)}</td>
                            <td>{fmtOps(totals)}</td>
                        </tr>
                    </tbody>
                </table>
            </>
        );
    };

    const renderPitchingTable = (team: TeamState, label: string) => {
        const stats = team.pitcherStats || {};
        const pitcherIds = Object.keys(stats).filter(id => {
            const s = stats[id];
            return s && s.bf > 0;
        });

        return (
            <>
                <div className="stats-section-label">{label} PITCHING</div>
                <table className="stats-table">
                    <thead>
                        <tr>
                            <th>PITCHER</th>
                            <th>IP</th><th>H</th><th>R</th><th>BB</th><th>IBB</th><th>SO</th>
                            <th>HR</th><th>BF</th><th>ERA</th><th>WHIP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pitcherIds.map((id, i) => {
                            const s: PitcherStats = stats[id] || { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
                            const archived = (team as any).archivedPlayers || {};
                            const p = team.pitcher.cardId === id ? team.pitcher
                                : team.bullpen.find(bp => bp.cardId === id)
                                ?? archived[id];
                            const name = p?.name || id;
                            return (
                                <tr key={`pit-${i}`}>
                                    <td {...nameCellProps(id)}>{name}</td>
                                    <td>{fmtIp(s.ip)}</td>
                                    <td>{s.h}</td><td>{s.r}</td><td>{s.bb}</td><td>{s.ibb}</td><td>{s.so}</td>
                                    <td>{s.hr}</td><td>{s.bf}</td>
                                    <td>{fmtEra(s.r, s.ip)}</td>
                                    <td>{fmtWhip(s)}</td>
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
