import type { GameState, GameAction, TeamState } from '../../engine/gameEngine';

interface ActionButtonsProps {
    state: GameState;
    myRole: 'home' | 'away';
    isMyTurn: boolean;
    iAmBatting: boolean;
    onAction: (action: GameAction) => void;
    battingTeam: TeamState;
    fieldingTeam: TeamState;
    hasRunners: boolean;
    outcomeNames: Record<string, string>;
    onShowSubPanel: () => void;
}

// Layout constants for the bottom-left actions section (x=2..700, y=750..948)
const CX = 350;       // center of actions section
const BOT_TOP = 770;  // bottom bar top
const BOT_H = 178;    // bottom bar height
const ROW1_H = 52;    // button height (taller for 2-line labels)
const ROW1 = BOT_TOP + (BOT_H - ROW1_H) / 2; // vertically centered = 833
const ROW2 = ROW1 + ROW1_H + 6; // secondary row below buttons
const LABEL_Y = ROW1 - 16;  // context label above buttons

/** All phase-specific action button groups rendered as an SVG <g> element */
export default function ActionButtons({ state, myRole, isMyTurn, iAmBatting, onAction, battingTeam, fieldingTeam, hasRunners, outcomeNames, onShowSubPanel }: ActionButtonsProps) {
    return (
        <g>
            {/* SP Roll phase: home team rolls for starting pitchers */}
            {!state.isOver && isMyTurn && state.phase === 'sp_roll' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_STARTERS' })} cursor="pointer">
                    <rect x={CX - 100} y={ROW1} width="200" height={ROW1_H} rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 28} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">ROLL FOR PITCHERS</text>
                </g>
            )}
            {!state.isOver && !isMyTurn && state.phase === 'sp_roll' && (
                <g>
                    <rect x={CX - 130} y={ROW1} width="260" height={ROW1_H} rx="6" fill="rgba(0,0,0,0.6)"/>
                    <text x={CX} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for home team to roll...</text>
                </g>
            )}

            {/* Pre-atbat phase: offense can pinch hit, steal, use SB, or skip */}
            {!state.isOver && isMyTurn && state.phase === 'pre_atbat' && (() => {
                const isHomeBatting = state.halfInning === 'bottom';
                const backupAllowed = isHomeBatting ? state.inning >= 6 : state.inning >= 7;
                const eligibleBench = battingTeam.bench.filter(p => !p.isBackup || backupAllowed);
                // Find runners with unused SB icon
                const sbRunners: { cardId: string; name: string; fromBase: string; toBase: string }[] = [];
                if (state.bases.first && !state.bases.second) {
                    const runner = battingTeam.lineup.find(p => p.cardId === state.bases.first);
                    if (runner?.icons?.includes('SB') && !battingTeam.iconUsage?.[runner.cardId]?.['SB']) {
                        sbRunners.push({ cardId: runner.cardId, name: runner.name, fromBase: '1st', toBase: '2nd' });
                    }
                }
                if (state.bases.second && !state.bases.third) {
                    const runner = battingTeam.lineup.find(p => p.cardId === state.bases.second);
                    if (runner?.icons?.includes('SB') && !battingTeam.iconUsage?.[runner.cardId]?.['SB']) {
                        sbRunners.push({ cardId: runner.cardId, name: runner.name, fromBase: '2nd', toBase: '3rd' });
                    }
                }
                // Collect all buttons, then center them
                const items: { type: string; width: number; data?: any }[] = [];
                if (eligibleBench.length > 0) items.push({ type: 'pinch', width: 150 });
                sbRunners.forEach(sb => items.push({ type: 'sb', width: 160, data: sb }));
                if (state.bases.first && !state.bases.second) items.push({ type: 'steal2', width: 150 });
                if (state.bases.second && !state.bases.third) items.push({ type: 'steal3', width: 150 });
                items.push({ type: 'skip', width: 100 });
                const gap = 8;
                const totalW = items.reduce((s, it) => s + it.width, 0) + (items.length - 1) * gap;
                let bx = CX - totalW / 2;
                return (
                <g>
                    {items.map((item, idx) => {
                        const x = bx;
                        bx += item.width + gap;
                        if (item.type === 'pinch') return (
                            <g key="pinch" className="roll-button" onClick={() => onShowSubPanel()} cursor="pointer">
                                <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                <text x={x + item.width / 2} y={ROW1 + 20} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">PINCH HIT</text>
                                <text x={x + item.width / 2} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Replace current batter</text>
                            </g>
                        );
                        if (item.type === 'sb') {
                            const sb = item.data;
                            return (
                                <g key={`sb-${idx}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: sb.cardId, icon: 'SB' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={ROW1 + 18} textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">SB: {sb.name}</text>
                                    <text x={x + item.width / 2} y={ROW1 + 33} textAnchor="middle" fontSize="11" fill="#002860" fontFamily="Arial">{sb.fromBase}{'\u2192'}{sb.toBase} (auto)</text>
                                </g>
                            );
                        }
                        if (item.type === 'steal2') return (
                            <g key="steal2" className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.first! })} cursor="pointer">
                                <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                <text x={x + item.width / 2} y={ROW1 + 20} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 2ND</text>
                                <text x={x + item.width / 2} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Spd vs d20 + Arm</text>
                            </g>
                        );
                        if (item.type === 'steal3') return (
                            <g key="steal3" className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.second! })} cursor="pointer">
                                <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                <text x={x + item.width / 2} y={ROW1 + 20} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 3RD</text>
                                <text x={x + item.width / 2} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Spd vs d20 + Arm + 5</text>
                            </g>
                        );
                        // skip
                        return (
                            <g key="skip" className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                                <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                <text x={x + item.width / 2} y={ROW1 + 20} textAnchor="middle" fontSize="13" fill="#ccc" fontWeight="900" fontFamily="Impact">NO ACTION</text>
                                <text x={x + item.width / 2} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)" fontFamily="Arial">Skip to defense</text>
                            </g>
                        );
                    })}
                </g>
                );
            })()}

            {/* Defense sub phase: change pitcher, RP, IBB, or roll pitch */}
            {!state.isOver && isMyTurn && state.phase === 'defense_sub' && (() => {
                const hasRelievers = fieldingTeam.bullpen.filter(p => p.role !== 'Starter').length > 0;
                const isStarter = fieldingTeam.pitcher.role === 'Starter' && fieldingTeam.pitcherEntryInning === 1;
                const battingSideKey = state.halfInning === 'top' ? 'away' : 'home';
                const runsAgainst = state.score[battingSideKey];
                const canChangePitcher = hasRelievers && (!isStarter || state.inning >= 5 || runsAgainst >= 10);
                const currentFieldingTeamId = state.halfInning === 'top' ? 'home' : 'away';
                const rpAlreadyUsed = state.rpActiveInning === state.inning && state.rpActiveTeam === currentFieldingTeamId;
                const hasRP = state.inning > 6 && !rpAlreadyUsed && fieldingTeam.pitcher.icons?.includes('RP');
                const has20 = !state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20');
                const bases = state.bases;
                const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;

                // Row 1: pitcher change options (if any)
                // Row 2: IBB | ROLL PITCH (+ 20 option) — always shown
                const row1Items: { type: string; width: number }[] = [];
                if (canChangePitcher) row1Items.push({ type: 'change', width: 160 });
                if (hasRP) row1Items.push({ type: 'rp', width: 150 });

                const row2Items: { type: string; width: number }[] = [];
                row2Items.push({ type: 'ibb', width: 170 });
                if (canBunt) {
                    row2Items.push({ type: 'pitch_bunt', width: 160 }); // goes to bunt decision
                } else {
                    row2Items.push({ type: 'roll_pitch', width: 170 });
                    if (has20) row2Items.push({ type: '20', width: 180 });
                }

                const gap = 10;
                const renderRow = (items: typeof row1Items, y: number) => {
                    const totalW = items.reduce((s, it) => s + it.width, 0) + (items.length - 1) * gap;
                    let bx = CX - totalW / 2;
                    return items.map((item, idx) => {
                        const x = bx;
                        bx += item.width + gap;
                        switch (item.type) {
                            case 'change': return (
                                <g key="change" className="roll-button" onClick={() => onShowSubPanel()} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">CHANGE PITCHER</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Bring in reliever</text>
                                </g>
                            );
                            case 'rp': return (
                                <g key="rp" className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="13" fill="#002" fontWeight="900" fontFamily="Impact">RP ICON (+3 CTRL)</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Rest of inning</text>
                                </g>
                            );
                            case 'ibb': return (
                                <g key="ibb" className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="13" fill="#002" fontWeight="900" fontFamily="Impact">INTENTIONAL WALK</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">Walk batter to 1st</text>
                                </g>
                            );
                            case 'pitch_bunt': return (
                                <g key="pitch_bunt" className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="15" fill="white" fontWeight="900" fontFamily="Impact" letterSpacing="1">READY TO PITCH</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Arial">Bunt option next</text>
                                </g>
                            );
                            case 'roll_pitch': return (
                                <g key="roll_pitch" className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="16" fill="white" fontWeight="900" fontFamily="Impact" letterSpacing="1">ROLL PITCH</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Arial">d20 + control vs OB</text>
                                </g>
                            );
                            case '20': return (
                                <g key="20" className="roll-button" onClick={() => { onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: '20' }); }} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 20} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">PITCH + 20 (+3)</text>
                                    <text x={x + item.width / 2} y={y + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">+3 control this pitch</text>
                                </g>
                            );
                            default: return null;
                        }
                    });
                };

                const totalRows = row1Items.length > 0 ? 2 : 1;
                const rowGap = 6;
                const totalH = totalRows * ROW1_H + (totalRows - 1) * rowGap;
                const startY = BOT_TOP + (BOT_H - totalH) / 2;
                return (
                    <g>
                        {row1Items.length > 0 && renderRow(row1Items, startY)}
                        {renderRow(row2Items, row1Items.length > 0 ? startY + ROW1_H + rowGap : startY)}
                    </g>
                );
            })()}

            {/* IBB decision phase — ROLL PITCH directly when bunt isn't available */}
            {!state.isOver && isMyTurn && state.phase === 'ibb_decision' && (() => {
                const bases = state.bases;
                const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;
                const has20 = !state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20');
                if (canBunt) {
                    return (
                        <g>
                            <g className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                                <rect x={CX - 180} y={ROW1} width="170" height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                                <text x={CX - 95} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">INTENTIONAL WALK</text>
                            </g>
                            <g className="roll-button" onClick={() => onAction({ type: 'SKIP_IBB' })} cursor="pointer">
                                <rect x={CX + 10} y={ROW1} width="140" height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                <text x={CX + 80} y={ROW1 + 27} textAnchor="middle" fontSize="15" fill="#ccc" fontWeight="900" fontFamily="Impact">PITCH</text>
                            </g>
                        </g>
                    );
                }
                if (has20) {
                    return (
                        <g>
                            <g className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                                <rect x={CX - 300} y={ROW1} width="160" height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                                <text x={CX - 220} y={ROW1 + 27} textAnchor="middle" fontSize="13" fill="#002" fontWeight="900" fontFamily="Impact">INTENTIONAL WALK</text>
                            </g>
                            <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                <rect x={CX - 120} y={ROW1} width="160" height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                <text x={CX - 40} y={ROW1 + 28} textAnchor="middle" fontSize="18" fill="white" fontWeight="900" fontFamily="Impact">ROLL PITCH</text>
                            </g>
                            <g className="roll-button" onClick={() => { onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: '20' }); }} cursor="pointer">
                                <rect x={CX + 60} y={ROW1} width="180" height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                <text x={CX + 150} y={ROW1 + 28} textAnchor="middle" fontSize="15" fill="#002" fontWeight="900" fontFamily="Impact">PITCH + 20 (+3)</text>
                            </g>
                        </g>
                    );
                }
                return (
                    <g>
                        <g className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                            <rect x={CX - 190} y={ROW1} width="170" height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                            <text x={CX - 105} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">INTENTIONAL WALK</text>
                        </g>
                        <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                            <rect x={CX + 10} y={ROW1} width="180" height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                            <text x={CX + 100} y={ROW1 + 28} textAnchor="middle" fontSize="20" fill="white" fontWeight="900" fontFamily="Impact" letterSpacing="2">ROLL PITCH</text>
                        </g>
                    </g>
                );
            })()}

            {/* Bunt decision phase: offense can sac bunt */}
            {!state.isOver && isMyTurn && state.phase === 'bunt_decision' && (
                <g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SAC_BUNT' })} cursor="pointer">
                        <rect x={CX - 84} y={ROW1} width="160" height={ROW1_H} rx="6" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1.5"/>
                        <text x={CX - 4} y={ROW1 + 20} textAnchor="middle" fontSize="14" fill="white" fontWeight="900" fontFamily="Impact">SAC BUNT</text>
                        <text x={CX - 4} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Arial">Batter out, runners advance</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_BUNT' })} cursor="pointer">
                        <rect x={CX + 84} y={ROW1} width="120" height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 144} y={ROW1 + 20} textAnchor="middle" fontSize="13" fill="#ccc" fontWeight="900" fontFamily="Impact">NO BUNT</text>
                        <text x={CX + 144} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)" fontFamily="Arial">Proceed to pitch</text>
                    </g>
                </g>
            )}

            {/* Pitch phase — with optional 20 icon */}
            {!state.isOver && isMyTurn && state.phase === 'pitch' && (() => {
                const has20 = !state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20');
                if (has20) {
                    return (
                        <g>
                            <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                <rect x={CX - 210} y={ROW1} width="200" height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                <text x={CX - 110} y={ROW1 + 20} textAnchor="middle" fontSize="18" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL PITCH</text>
                                <text x={CX - 110} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Arial">d20 + control vs OB</text>
                            </g>
                            <g className="roll-button" onClick={() => { onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: '20' }); }} cursor="pointer">
                                <rect x={CX + 10} y={ROW1} width="200" height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                <text x={CX + 110} y={ROW1 + 20} textAnchor="middle" fontSize="16" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif">PITCH + 20 (+3)</text>
                                <text x={CX + 110} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.5)" fontFamily="Arial">+3 control this pitch</text>
                            </g>
                        </g>
                    );
                }
                return (
                    <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                        <rect x={CX - 100} y={ROW1} width="200" height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                        <text x={CX} y={ROW1 + 20} textAnchor="middle" fontSize="20" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL PITCH</text>
                        <text x={CX} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Arial">d20 + control vs OB</text>
                    </g>
                );
            })()}

            {/* Swing phase */}
            {!state.isOver && isMyTurn && state.phase === 'swing' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_SWING' })} cursor="pointer">
                    <rect x={CX - 100} y={ROW1} width="200" height={ROW1_H} rx="8" fill="#4ade80" stroke="#6bff9a" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 20} textAnchor="middle" fontSize="20" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL SWING</text>
                    <text x={CX} y={ROW1 + 36} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.4)" fontFamily="Arial">d20 on {state.usedPitcherChart ? "pitcher's" : "batter's"} chart</text>
                </g>
            )}

            {/* Result icons phase: show icon buttons */}
            {!state.isOver && isMyTurn && state.phase === 'result_icons' && state.iconPrompt && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#d4a018" fontWeight="bold" fontFamily="Arial">
                        {state.lastOutcome ? `Result: ${outcomeNames[state.lastOutcome] || state.lastOutcome}` : 'Icon Decision'}
                    </text>
                    {(() => {
                        const icons = state.iconPrompt.availableIcons;
                        const btnW = 150;
                        const skipW = 100;
                        const gap = 8;
                        const totalW = icons.length * btnW + skipW + icons.length * gap;
                        let bx = CX - totalW / 2;
                        return (
                            <>
                                {icons.map((ic, i) => {
                                    const x = bx;
                                    bx += btnW + gap;
                                    return (
                                        <g key={`icon-${i}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: ic.cardId, icon: ic.icon })} cursor="pointer">
                                            <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                            <text x={x + btnW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#002" fontWeight="bold" fontFamily="Arial">{ic.description.split(':')[0]}</text>
                                        </g>
                                    );
                                })}
                                <g className="roll-button" onClick={() => onAction({ type: 'SKIP_ICONS' })} cursor="pointer">
                                    <rect x={bx} y={ROW1} width={skipW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                    <text x={bx + skipW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#ccc" fontWeight="bold" fontFamily="Arial">DECLINE</text>
                                </g>
                            </>
                        );
                    })()}
                </g>
            )}

            {/* Extra base offer phase: offense decides whether to send runners */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base_offer' && state.extraBaseEligible && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="bold" fontFamily="Arial">
                        Send runners for extra bases?
                    </text>
                    {(() => {
                        const runners = state.extraBaseEligible!;
                        const btnW = 160;
                        const sendAllW = 140;
                        const holdW = 100;
                        const gap = 8;
                        const hasSendAll = runners.length > 1;
                        const totalW = runners.length * (btnW + gap) + (hasSendAll ? sendAllW + gap : 0) + holdW;
                        let bx = CX - totalW / 2;
                        return (
                            <>
                                {runners.map((runner, i) => {
                                    const x = bx;
                                    bx += btnW + gap;
                                    return (
                                        <g key={`ebo-${i}`} className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: [runner.runnerId] })} cursor="pointer">
                                            <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                                            <text x={x + btnW / 2} y={ROW1 + 17} textAnchor="middle" fontSize="14" fill="#002" fontWeight="bold" fontFamily="Arial">SEND: {runner.runnerName}</text>
                                            <text x={x + btnW / 2} y={ROW1 + 33} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.6)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Spd:{runner.runnerSpeed}</text>
                                        </g>
                                    );
                                })}
                                {hasSendAll && (() => {
                                    const x = bx;
                                    bx += sendAllW + gap;
                                    return (
                                        <g className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: runners.map(r => r.runnerId) })} cursor="pointer">
                                            <rect x={x} y={ROW1} width={sendAllW} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                            <text x={x + sendAllW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#002" fontWeight="bold" fontFamily="Arial">SEND ALL</text>
                                        </g>
                                    );
                                })()}
                                <g className="roll-button" onClick={() => onAction({ type: 'HOLD_RUNNERS' })} cursor="pointer">
                                    <rect x={bx} y={ROW1} width={holdW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                    <text x={bx + holdW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="13" fill="#ccc" fontWeight="bold" fontFamily="Arial">HOLD RUNNERS</text>
                                </g>
                            </>
                        );
                    })()}
                </g>
            )}

            {/* GB Decision phase: defense chooses how to handle ground ball */}
            {!state.isOver && isMyTurn && state.phase === 'gb_decision' && state.gbOptions && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        Ground Ball — Choose defensive play:
                    </text>
                    {(() => {
                        const buttons: { label: string; sub: string; choice: string; color: string }[] = [];
                        if (state.gbOptions.canDP) buttons.push({ label: 'DOUBLE PLAY', sub: 'Force 2nd, roll for 1st', choice: 'dp', color: '#e94560' });
                        if (state.gbOptions.canForceHome) buttons.push({ label: 'FORCE HOME', sub: 'Out at home, runners shift', choice: 'force_home', color: '#8b5cf6' });
                        if (state.gbOptions.canHoldThird) buttons.push({ label: 'HOLD RUNNER', sub: '3B stays, roll for 1st', choice: 'hold', color: '#d4a018' });
                        if (state.gbOptions.canHoldRunners) buttons.push({ label: 'HOLD RUNNERS', sub: 'Runners stay, roll for 1st', choice: 'hold', color: '#d4a018' });
                        if (state.gbOptions.canAdvanceRunners) buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance, out at 1st', choice: 'advance', color: '#334155' });
                        if (!state.gbOptions.canDP && !state.gbOptions.canHoldRunners && !state.gbOptions.canHoldThird && !state.gbOptions.canAdvanceRunners) {
                            buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance', choice: 'advance', color: '#334155' });
                        }
                        const gPlayers = state.gbOptions.gPlayers || [];
                        const bw = 150, gap = 8;
                        const totalW = buttons.length * bw + (buttons.length - 1) * gap;
                        const startX = CX - totalW / 2;
                        return buttons.map((btn, i) => (
                            <g key={`gb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any })} cursor="pointer">
                                    <rect x={startX + i * (bw + gap)} y={ROW1} width={bw} height={ROW1_H} rx="6" fill={btn.color} stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                                    <text x={startX + i * (bw + gap) + bw / 2} y={ROW1 + 18} textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Arial">{btn.label}</text>
                                    <text x={startX + i * (bw + gap) + bw / 2} y={ROW1 + 34} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.6)" fontFamily="Arial">{btn.sub}</text>
                                </g>
                                {btn.choice !== 'force_home' && btn.choice !== 'advance' && gPlayers.map((gp, gi) => (
                                    <g key={`gb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any, goldGloveCardId: gp.cardId })} cursor="pointer">
                                        <rect x={startX + i * (bw + gap)} y={ROW2 + gi * 22} width={bw} height="18" rx="3" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                        <text x={startX + i * (bw + gap) + bw / 2} y={ROW2 + 14 + gi * 22} textAnchor="middle" fontSize="11" fill="#002" fontWeight="bold" fontFamily="Arial">+ G: {gp.name} ({gp.position})</text>
                                    </g>
                                ))}
                            </g>
                        ));
                    })()}
                </g>
            )}

            {/* Steal SB phase: offense decides whether to use SB icon */}
            {!state.isOver && isMyTurn && state.phase === 'steal_sb' && state.pendingSteal && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="bold" fontFamily="Arial">
                        {state.pendingSteal.runnerName} stealing {state.pendingSteal.toBase} — Use SB icon for automatic safe?
                    </text>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_SB_DECISION', useSB: true })} cursor="pointer">
                        <rect x={CX - 162} y={ROW1} width="160" height={ROW1_H} rx="6" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                        <text x={CX - 82} y={ROW1 + 27} textAnchor="middle" fontSize="15" fill="#002" fontWeight="900" fontFamily="Impact">USE SB (AUTO SAFE)</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_SB_DECISION', useSB: false })} cursor="pointer">
                        <rect x={CX + 2} y={ROW1} width="160" height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 82} y={ROW1 + 27} textAnchor="middle" fontSize="15" fill="#ccc" fontWeight="900" fontFamily="Impact">NORMAL STEAL</text>
                    </g>
                </g>
            )}

            {/* Steal resolve phase: defense decides whether to use G */}
            {!state.isOver && isMyTurn && state.phase === 'steal_resolve' && state.pendingSteal && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        {state.pendingSteal.runnerName} stealing {state.pendingSteal.toBase} — Use Gold Glove?
                    </text>
                    {(() => {
                        const catchers = state.pendingSteal.catcherGPlayers || [];
                        const btnW = 160;
                        const noGW = 100;
                        const gap = 8;
                        const totalW = catchers.length * (btnW + gap) + noGW;
                        let bx = CX - totalW / 2;
                        return (
                            <>
                                {catchers.map((gp: any, i: number) => {
                                    const x = bx;
                                    bx += btnW + gap;
                                    return (
                                        <g key={`sg-${i}`} className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION', goldGloveCardId: gp.cardId })} cursor="pointer">
                                            <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                            <text x={x + btnW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="14" fill="#002" fontWeight="bold" fontFamily="Arial">G: {gp.name} (+10)</text>
                                        </g>
                                    );
                                })}
                                <g className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION' })} cursor="pointer">
                                    <rect x={bx} y={ROW1} width={noGW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                    <text x={bx + noGW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO GOLD GLOVE</text>
                                </g>
                            </>
                        );
                    })()}
                </g>
            )}

            {/* Extra base phase: defense chooses who to throw at (with optional G) */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base' && state.extraBaseEligible && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        Runners advancing — Choose who to throw at:
                    </text>
                    {(() => {
                        // Only outfielders with G are relevant for extra base throws (OF fielding)
                        const OF_POSITIONS = ['LF', 'CF', 'RF', 'LF-RF'];
                        const gPlayers = fieldingTeam.lineup
                            .filter((p: any) => {
                                const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
                                return p.icons?.includes('G') && !fieldingTeam.iconUsage?.[p.cardId]?.['G'] && OF_POSITIONS.includes(pos);
                            })
                            .map((p: any) => ({ cardId: p.cardId, name: p.name, position: (p.assignedPosition || '').replace(/-\d+$/, '') }));
                        const runners = state.extraBaseEligible!;
                        const btnW = 160;
                        const noThrowW = 120;
                        const gap = 8;
                        const totalW = runners.length * (btnW + gap) + noThrowW;
                        let bx = CX - totalW / 2;
                        return (
                            <>
                                {runners.map((runner, i) => {
                                    const x = bx;
                                    bx += btnW + gap;
                                    return (
                                        <g key={`eb-${i}`}>
                                            <g className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId })} cursor="pointer">
                                                <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#e94560" stroke="#ff6b8a" strokeWidth="1.5"/>
                                                <text x={x + btnW / 2} y={ROW1 + 17} textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Arial">THROW: {runner.runnerName}</text>
                                                <text x={x + btnW / 2} y={ROW1 + 34} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.7)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Tgt:{(runner as any).targetWithBonuses || runner.runnerSpeed}</text>
                                            </g>
                                            {gPlayers.map((gp: any, gi: number) => (
                                                <g key={`eb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId, goldGloveCardId: gp.cardId })} cursor="pointer">
                                                    <rect x={x} y={ROW2 + gi * 22} width={btnW} height="18" rx="3" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                                    <text x={x + btnW / 2} y={ROW2 + 14 + gi * 22} textAnchor="middle" fontSize="11" fill="#002" fontWeight="bold" fontFamily="Arial">+ G: {gp.name} ({gp.position})</text>
                                                </g>
                                            ))}
                                        </g>
                                    );
                                })}
                                <g className="roll-button" onClick={() => onAction({ type: 'SKIP_EXTRA_BASE' })} cursor="pointer">
                                    <rect x={bx} y={ROW1} width={noThrowW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                    <text x={bx + noThrowW / 2} y={ROW1 + 27} textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">LET ADVANCE</text>
                                </g>
                            </>
                        );
                    })()}
                </g>
            )}

            {/* Waiting for opponent */}
            {!state.isOver && !isMyTurn && (
                <g>
                    <rect x={CX - 130} y={ROW1} width="260" height={ROW1_H} rx="6" fill="rgba(0,0,0,0.6)"/>
                    <text x={CX} y={ROW1 + 27} textAnchor="middle" fontSize="16" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for opponent...</text>
                </g>
            )}

            {/* Game over */}
            {state.isOver && (
                <g>
                    <rect x={CX - 160} y={ROW1 - 10} width="320" height="60" rx="10" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 + 30} textAnchor="middle" fontSize="32" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">
                        GAME OVER  {state.score.away}{'\u2013'}{state.score.home}
                    </text>
                </g>
            )}
        </g>
    );
}
