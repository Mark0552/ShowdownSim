import type { TeamState } from '../../engine/gameEngine';

interface Props {
    awayTeam: TeamState;
    homeTeam: TeamState;
    awayName: string;
    homeName: string;
    innings: number[];
    /** Frozen inning (1-based) — used to highlight the active column. */
    displayInning: number;
    displayHalfInning: string;
    displayScore: { away: number; home: number };
    displayOuts: number;
    isOver: boolean;
    /** "svg" (default) renders SVG groups for the parent game-board SVG.
     *  "html" renders a <table> + outs row for direct CSS-grid placement
     *  on mobile. */
    layout?: 'svg' | 'html';
}

/**
 * Centered scoreboard table + outs indicator at the top of the board.
 */
export default function Scoreboard({
    awayTeam, homeTeam, awayName, homeName,
    innings, displayInning, displayHalfInning,
    displayScore, displayOuts, isOver,
    layout = 'svg',
}: Props) {
    const curInnIdx = displayInning - 1;
    const isBattingTeam = (team: TeamState) =>
        (displayHalfInning === 'top' && team === awayTeam) || (displayHalfInning === 'bottom' && team === homeTeam);

    if (layout === 'html') {
        const renderHtmlRow = (team: TeamState, teamName: string) => (
            <tr>
                <td className="team-col">{teamName.slice(0, 10).toUpperCase()}</td>
                {innings.slice(0, 9).map((inn, i) => {
                    const isCurInning = i === curInnIdx && !isOver;
                    const isBatting = isBattingTeam(team) && isCurInning;
                    const hasBatted = i < curInnIdx || (i === curInnIdx && (
                        team === awayTeam ||
                        (team === homeTeam && displayHalfInning === 'bottom')
                    ));
                    const val = team.runsPerInning[i];
                    const displayVal = !hasBatted
                        ? undefined
                        : (isBatting && val === undefined ? 0 : val);
                    const cls = isBatting ? 'batting' : (displayVal === undefined ? 'empty' : '');
                    return (
                        <td key={`c-${team.userId}-${inn}`} className={cls}>
                            {displayVal ?? '—'}
                        </td>
                    );
                })}
                <td className="r-col">{team === awayTeam ? displayScore.away : displayScore.home}</td>
            </tr>
        );

        return (
            <div className="gb-m-scoreboard">
                <table className="gb-m-sb-table">
                    <thead>
                        <tr>
                            <th className="team-col">TEAM</th>
                            {innings.slice(0, 9).map((inn, i) => {
                                const isCur = i === curInnIdx && !isOver;
                                return <th key={`h-${inn}`} className={isCur ? 'cur' : ''}>{inn}</th>;
                            })}
                            <th className="r-col">R</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderHtmlRow(awayTeam, awayName)}
                        {renderHtmlRow(homeTeam, homeName)}
                    </tbody>
                </table>
                <div className="gb-m-outs">
                    OUTS
                    {[0, 1, 2].map(i => (
                        <span key={`o-${i}`} className={`gb-m-outs-dot${displayOuts > i ? ' on' : ''}`} />
                    ))}
                </div>
            </div>
        );
    }

    const colW = 40, teamW = 100, rhW = 44;
    const sbTableW = teamW + 9 * colW + rhW; // scoreboard table width (no H column)
    const innW = 96; // outs section only (inning/halfInning indicated on scoreboard itself)
    const gapBetween = 16;
    const unitW = sbTableW + gapBetween + innW;
    const unitX = (1400 - unitW) / 2;
    const hdrH = 20, rowH = 22;
    const sbY = 6; // top padding

    const renderRow = (team: TeamState, teamName: string, ry: number) => (
        <g>
            <rect x={unitX} y={ry} width={teamW} height={rowH} fill="#0c1a40"/>
            <text x={unitX + teamW / 2} y={ry + 16} textAnchor="middle" fontSize="12" fill="#8aade0" fontWeight="normal" fontFamily="Arial">{teamName.slice(0, 10).toUpperCase()}</text>
            {innings.slice(0, 9).map((inn, i) => {
                const isCurInning = i === curInnIdx && !isOver;
                const isBatting = isBattingTeam(team) && isCurInning;
                // Team has batted (or is batting) in inning i+1?
                const hasBatted = i < curInnIdx || (i === curInnIdx && (
                    team === awayTeam ||
                    (team === homeTeam && displayHalfInning === 'bottom')
                ));
                const val = team.runsPerInning[i];
                const displayVal = !hasBatted
                    ? undefined
                    : (isBatting && val === undefined ? 0 : val);
                const cellFill = isBatting ? 'rgba(212,160,24,0.35)' : (i % 2 === 0 ? '#0a1830' : '#071024');
                const textFill = displayVal !== undefined ? (isBatting ? '#fff' : '#c8d8f8') : '#1e3a7a';
                return (
                    <g key={`r-${ry}-${inn}`}>
                        <rect x={unitX + teamW + i * colW} y={ry} width={colW} height={rowH} fill={cellFill}/>
                        <text x={unitX + teamW + i * colW + colW / 2} y={ry + 16} textAnchor="middle" fontSize="14" fill={textFill} fontWeight="normal" fontFamily="Arial">{displayVal ?? '—'}</text>
                    </g>
                );
            })}
            <rect x={unitX + teamW + 9 * colW} y={ry} width={rhW} height={rowH} fill="#3a0a0a"/>
            <text x={unitX + teamW + 9 * colW + rhW / 2} y={ry + 16} textAnchor="middle" fontSize="16" fill="white" fontWeight="normal" fontFamily="Impact">{team === awayTeam ? displayScore.away : displayScore.home}</text>
        </g>
    );

    const innX = unitX + sbTableW + gapBetween; // inning section start
    return (
        <g>
            {/* Scoreboard header */}
            <rect x={unitX} y={sbY} width={teamW} height={hdrH} rx="2" fill="#002868"/>
            <text x={unitX + teamW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="normal" fontFamily="Arial">TEAM</text>
            {innings.slice(0, 9).map((inn, i) => {
                const isCur = i === curInnIdx && !isOver;
                return (
                    <g key={`hdr-${inn}`}>
                        <rect x={unitX + teamW + i * colW} y={sbY} width={colW} height={hdrH}
                            fill={isCur ? '#3a2a00' : (i % 2 === 0 ? '#002868' : '#001e50')}
                            stroke={isCur ? '#d4a018' : 'none'} strokeWidth={isCur ? 1.5 : 0}/>
                        <text x={unitX + teamW + i * colW + colW / 2} y={sbY + 14} textAnchor="middle"
                            fontSize="10" fill={isCur ? '#d4a018' : '#c8d8f8'} fontWeight="normal" fontFamily="Arial">{inn}</text>
                    </g>
                );
            })}
            <rect x={unitX + teamW + 9 * colW} y={sbY} width={rhW} height={hdrH} rx="2" fill="#9a0000"/>
            <text x={unitX + teamW + 9 * colW + rhW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="normal" fontFamily="Arial">R</text>
            {/* Team rows */}
            {renderRow(awayTeam, awayName, sbY + hdrH + 1)}
            {renderRow(homeTeam, homeName, sbY + hdrH + 1 + rowH + 1)}
            {/* Gold border overlay on entire current inning column */}
            {!isOver && curInnIdx < 9 && (
                <rect x={unitX + teamW + curInnIdx * colW} y={sbY} width={colW} height={hdrH + 2 + rowH * 2 + 1}
                    fill="none" stroke="#d4a018" strokeWidth="2" rx="2" />
            )}

            {/* Outs — label centered over middle ball */}
            <text x={innX + 48} y={sbY + 14} textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="normal" letterSpacing="2" fontFamily="Impact">OUTS</text>
            {[0, 1, 2].map(i => (
                <g key={`out-${i}`}>
                    <circle cx={innX + 20 + i * 28} cy={sbY + 36} r="10" fill={displayOuts > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="1.5"/>
                    <circle cx={innX + 20 + i * 28} cy={sbY + 36} r="6" fill={displayOuts > i ? '#ff3030' : '#0e0408'}/>
                </g>
            ))}
        </g>
    );
}
