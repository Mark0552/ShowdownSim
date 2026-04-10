import type { GameState, GameAction, TeamState } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';

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

// Layout constants for the bottom-left actions section (x=2..820, y=750..948)
const CX = 410;       // center of actions section (59% of 1400)
const MAX_ACTION_W = 790; // usable width for button rows
const BOT_TOP = 770;  // bottom bar top
const BOT_H = 178;    // bottom bar height
const ROW1_H = 78;    // button height — taller for big readable labels + math
const ROW1 = BOT_TOP + (BOT_H - ROW1_H) / 2; // vertically centered = 820
const ROW2 = ROW1 + ROW1_H + 4; // secondary row (G sub-buttons) below buttons
const LABEL_Y = ROW1 - 6;  // context label above buttons

/** All phase-specific action button groups rendered as an SVG <g> element */
export default function ActionButtons({ state, myRole, isMyTurn, iAmBatting, onAction, battingTeam, fieldingTeam, hasRunners, outcomeNames, onShowSubPanel }: ActionButtonsProps) {
    const curBatter = getCurrentBatter(state);
    const curPitcher = getCurrentPitcher(state);
    const ctrl = curPitcher.control || 0;
    const ob = curBatter.onBase || 0;
    const fatigue = state.fatiguePenalty || 0;
    const ctrlMod = state.controlModifier || 0;
    const effCtrl = ctrl - fatigue + ctrlMod;
    const pitchMath = `d20+Ctrl(${ctrl}${fatigue ? `-${fatigue}` : ''}${ctrlMod ? `+${ctrlMod}` : ''}${(fatigue || ctrlMod) ? `=${effCtrl}` : ''}) vs OB(${ob})`;
    const pitch20Math = `d20+Ctrl(${ctrl}${fatigue ? `-${fatigue}` : ''}+3${ctrlMod ? `+${ctrlMod}` : ''}=${effCtrl + 3}) vs OB(${ob})`;
    const swingMath = `d20 on ${state.usedPitcherChart ? 'Pitcher' : 'Batter'} chart`;
    return (
        <g>
            {/* SP Roll phase: home team rolls for starting pitchers */}
            {!state.isOver && isMyTurn && state.phase === 'sp_roll' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_STARTERS' })} cursor="pointer">
                    <rect x={CX - 130} y={ROW1} width="260" height={ROW1_H} rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 46} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact,sans-serif" letterSpacing="3">ROLL FOR PITCHERS</text>
                </g>
            )}
            {!state.isOver && !isMyTurn && state.phase === 'sp_roll' && (
                <g>
                    <rect x={CX - 160} y={ROW1} width="320" height={ROW1_H} rx="6" fill="rgba(0,0,0,0.6)"/>
                    <text x={CX} y={ROW1 + 46} textAnchor="middle" fontSize="16" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for home team to roll...</text>
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
                if (eligibleBench.length > 0) items.push({ type: 'pinch', width: 170 });
                sbRunners.forEach(sb => items.push({ type: 'sb', width: 190, data: sb }));
                if (state.bases.first && !state.bases.second) items.push({ type: 'steal2', width: 200 });
                if (state.bases.second && !state.bases.third) items.push({ type: 'steal3', width: 200 });
                items.push({ type: 'skip', width: 130 });
                const gap = 10;
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
                                <text x={x + item.width / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">PINCH HIT</text>
                                <text x={x + item.width / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Replace current batter</text>
                            </g>
                        );
                        if (item.type === 'sb') {
                            const sb = item.data;
                            return (
                                <g key={`sb-${idx}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: sb.cardId, icon: 'SB' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">SB: {sb.name}</text>
                                    <text x={x + item.width / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">{sb.fromBase}{'\u2192'}{sb.toBase} (auto safe)</text>
                                </g>
                            );
                        }
                        if (item.type === 'steal2') {
                            const r = battingTeam.lineup.find(p => p.cardId === state.bases.first);
                            const arm = fieldingTeam.catcherArm || 0;
                            return (
                                <g key="steal2" className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.first! })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">STEAL 2ND</text>
                                    <text x={x + item.width / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">Spd {r?.speed ?? '?'} vs d20+Arm({arm})</text>
                                </g>
                            );
                        }
                        if (item.type === 'steal3') {
                            const r = battingTeam.lineup.find(p => p.cardId === state.bases.second);
                            const arm = fieldingTeam.catcherArm || 0;
                            return (
                                <g key="steal3" className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.second! })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">STEAL 3RD</text>
                                    <text x={x + item.width / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">Spd {r?.speed ?? '?'} vs d20+Arm({arm})+5</text>
                                </g>
                            );
                        }
                        // skip
                        return (
                            <g key="skip" className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                                <rect x={x} y={ROW1} width={item.width} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                <text x={x + item.width / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#ccc" fontWeight="normal" fontFamily="Impact">NO ACTION</text>
                                <text x={x + item.width / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.7)" fontFamily="Arial">Skip to defense</text>
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
                if (canChangePitcher) row1Items.push({ type: 'change', width: 190 });
                if (hasRP) row1Items.push({ type: 'rp', width: 190 });

                const row2Items: { type: string; width: number }[] = [];
                row2Items.push({ type: 'ibb', width: 200 });
                if (canBunt) {
                    row2Items.push({ type: 'pitch_bunt', width: 190 }); // goes to bunt decision
                } else {
                    row2Items.push({ type: 'roll_pitch', width: 200 });
                    if (has20) row2Items.push({ type: '20', width: 220 });
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
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">CHANGE PITCHER</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Bring in reliever</text>
                                </g>
                            );
                            case 'rp': return (
                                <g key="rp" className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">RP ICON (+3 CTRL)</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Rest of inning</text>
                                </g>
                            );
                            case 'ibb': return (
                                <g key="ibb" className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">INTENTIONAL WALK</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Walk batter to 1st</text>
                                </g>
                            );
                            case 'pitch_bunt': return (
                                <g key="pitch_bunt" className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="24" fill="white" fontWeight="normal" fontFamily="Impact" letterSpacing="1">READY TO PITCH</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.7)" fontFamily="Arial">Bunt option next</text>
                                </g>
                            );
                            case 'roll_pitch': return (
                                <g key="roll_pitch" className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="24" fill="white" fontWeight="normal" fontFamily="Impact" letterSpacing="1">ROLL PITCH</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="monospace">{pitchMath}</text>
                                </g>
                            );
                            case '20': return (
                                <g key="20" className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH', useIcon20: true })} cursor="pointer">
                                    <rect x={x} y={y} width={item.width} height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                    <text x={x + item.width / 2} y={y + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">USE 20 ICON</text>
                                    <text x={x + item.width / 2} y={y + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{pitch20Math}</text>
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
                const currentFieldingTeamId2 = state.halfInning === 'top' ? 'home' : 'away';
                const rpUsed2 = state.rpActiveInning === state.inning && state.rpActiveTeam === currentFieldingTeamId2;
                const hasRP2 = state.inning > 6 && !rpUsed2 && fieldingTeam.pitcher.icons?.includes('RP');
                // Build button list and center it
                const items: { type: string; w: number }[] = [{ type: 'ibb', w: 200 }];
                if (hasRP2) items.push({ type: 'rp', w: 190 });
                if (canBunt) items.push({ type: 'pitch_bunt', w: 190 });
                else {
                    items.push({ type: 'roll_pitch', w: 200 });
                    if (has20) items.push({ type: '20', w: 220 });
                }
                const ibgap = 10;
                const ibTotal = items.reduce((s, it) => s + it.w, 0) + (items.length - 1) * ibgap;
                let ibx = CX - ibTotal / 2;
                return (
                    <g>
                        {items.map((it, idx) => {
                            const x = ibx; ibx += it.w + ibgap;
                            if (it.type === 'ibb') return (
                                <g key={`ib-${idx}`} className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">INTENTIONAL WALK</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Walk batter to 1st</text>
                                </g>
                            );
                            if (it.type === 'pitch_bunt') return (
                                <g key={`ib-${idx}`} className="roll-button" onClick={() => onAction({ type: 'SKIP_IBB' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="24" fill="white" fontWeight="normal" fontFamily="Impact">READY TO PITCH</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.7)" fontFamily="Arial">Bunt option next</text>
                                </g>
                            );
                            if (it.type === 'rp') return (
                                <g key={`ib-${idx}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">RP ICON (+3 CTRL)</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Rest of inning</text>
                                </g>
                            );
                            if (it.type === 'roll_pitch') return (
                                <g key={`ib-${idx}`} className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="24" fill="white" fontWeight="normal" fontFamily="Impact">ROLL PITCH</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="monospace">{pitchMath}</text>
                                </g>
                            );
                            return (
                                <g key={`ib-${idx}`} className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH', useIcon20: true })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">USE 20 ICON</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{pitch20Math}</text>
                                </g>
                            );
                        })}
                    </g>
                );
            })()}

            {/* Bunt decision phase: offense can sac bunt */}
            {!state.isOver && isMyTurn && state.phase === 'bunt_decision' && (
                <g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SAC_BUNT' })} cursor="pointer">
                        <rect x={CX - 196} y={ROW1} width="190" height={ROW1_H} rx="6" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1.5"/>
                        <text x={CX - 101} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="white" fontWeight="normal" fontFamily="Impact">SAC BUNT</text>
                        <text x={CX - 101} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.75)" fontFamily="Arial">Batter out, runners advance</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_BUNT' })} cursor="pointer">
                        <rect x={CX + 6} y={ROW1} width="160" height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 86} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#ccc" fontWeight="normal" fontFamily="Impact">NO BUNT</text>
                        <text x={CX + 86} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.75)" fontFamily="Arial">Proceed to pitch</text>
                    </g>
                </g>
            )}

            {/* Pitch phase — with optional 20/RP icons */}
            {!state.isOver && isMyTurn && state.phase === 'pitch' && (() => {
                const has20 = !state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20');
                const pCurrentFieldingTeamId = state.halfInning === 'top' ? 'home' : 'away';
                const pRpUsed = state.rpActiveInning === state.inning && state.rpActiveTeam === pCurrentFieldingTeamId;
                const hasRP = state.inning > 6 && !pRpUsed && fieldingTeam.pitcher.icons?.includes('RP');
                const items: { type: string; w: number }[] = [];
                items.push({ type: 'roll_pitch', w: 200 });
                if (has20) items.push({ type: '20', w: 210 });
                if (hasRP) items.push({ type: 'rp', w: 190 });
                const pgap = 10;
                const ptotalW = items.reduce((s, it) => s + it.w, 0) + (items.length - 1) * pgap;
                let px = CX - ptotalW / 2;
                return (
                    <g>
                        {items.map((it, idx) => {
                            const x = px; px += it.w + pgap;
                            if (it.type === 'roll_pitch') return (
                                <g key={`p-${idx}`} className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="24" fill="white" fontWeight="normal" fontFamily="Impact" letterSpacing="2">ROLL PITCH</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="monospace">{pitchMath}</text>
                                </g>
                            );
                            if (it.type === '20') return (
                                <g key={`p-${idx}`} className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH', useIcon20: true })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="2"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">USE 20 ICON</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{pitch20Math}</text>
                                </g>
                            );
                            return (
                                <g key={`p-${idx}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={it.w} height={ROW1_H} rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                                    <text x={x + it.w / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">RP ICON (+3 CTRL)</text>
                                    <text x={x + it.w / 2} y={ROW1 + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.7)" fontFamily="Arial">Rest of inning</text>
                                </g>
                            );
                        })}
                    </g>
                );
            })()}

            {/* Swing phase */}
            {!state.isOver && isMyTurn && state.phase === 'swing' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_SWING' })} cursor="pointer">
                    <rect x={CX - 120} y={ROW1} width="240" height={ROW1_H} rx="8" fill="#4ade80" stroke="#6bff9a" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 32} textAnchor="middle" fontSize="24" fill="#002" fontWeight="normal" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL SWING</text>
                    <text x={CX} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{swingMath}</text>
                </g>
            )}

            {/* Result icons phase: show icon buttons */}
            {!state.isOver && isMyTurn && state.phase === 'result_icons' && state.iconPrompt && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#d4a018" fontWeight="normal" fontFamily="Arial">
                        {state.lastOutcome ? `Result: ${outcomeNames[state.lastOutcome] || state.lastOutcome}` : 'Icon Decision'}
                    </text>
                    {(() => {
                        const icons = state.iconPrompt.availableIcons;
                        const btnW = 220;
                        const skipW = 160;
                        const gap = 12;
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
                                            <text x={x + btnW / 2} y={ROW1 + 46} textAnchor="middle" fontSize="20" fill="#002" fontWeight="normal" fontFamily="Arial">{ic.description.split(':')[0]}</text>
                                        </g>
                                    );
                                })}
                                <g className="roll-button" onClick={() => onAction({ type: 'SKIP_ICONS' })} cursor="pointer">
                                    <rect x={bx} y={ROW1} width={skipW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                    <text x={bx + skipW / 2} y={ROW1 + 46} textAnchor="middle" fontSize="20" fill="#ccc" fontWeight="normal" fontFamily="Arial">DECLINE</text>
                                </g>
                            </>
                        );
                    })()}
                </g>
            )}

            {/* Extra base offer phase: offense decides whether to send runners */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base_offer' && state.extraBaseEligible && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="normal" fontFamily="Arial">
                        Send runners for extra bases?
                    </text>
                    {(() => {
                        const runners = state.extraBaseEligible!;
                        const btnW = 230;
                        const sendAllW = 170;
                        const holdW = 170;
                        const gap = 10;
                        const hasSendAll = runners.length > 1;
                        const truncate = (name: string, max: number) => name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
                        // Try single row first; if too wide, wrap: runners on row 1, sendAll/hold on row 2
                        const singleRowW = runners.length * (btnW + gap) + (hasSendAll ? sendAllW + gap : 0) + holdW;
                        const MAX_W = MAX_ACTION_W;
                        const wrap = singleRowW > MAX_W;
                        const rowGap = 6;
                        const totalH = wrap ? 2 * ROW1_H + rowGap : ROW1_H;
                        const startY = BOT_TOP + (BOT_H - totalH) / 2;
                        const row1Y = startY;
                        const row2Y = wrap ? startY + ROW1_H + rowGap : startY;
                        // Row 1: runner buttons
                        const row1W = wrap
                            ? runners.length * btnW + (runners.length - 1) * gap
                            : singleRowW;
                        let bx = CX - row1W / 2;
                        const runnerBtns = runners.map((runner, i) => {
                            const x = bx;
                            bx += btnW + gap;
                            const target = (runner as any).targetWithBonuses ?? runner.runnerSpeed;
                            const homeBonus = runner.toBase === 'home' ? 5 : 0;
                            const twoOutBonus = (state.outs >= 2) ? 5 : 0;
                            const fb = runner.fromBase === 'second' ? '2nd' : runner.fromBase === 'third' ? '3rd' : '1st';
                            const tb = runner.toBase === 'home' ? 'H' : runner.toBase === 'third' ? '3rd' : '2nd';
                            const parts = [`${runner.runnerSpeed}`];
                            if (homeBonus) parts.push('+5h');
                            if (twoOutBonus) parts.push('+5(2o)');
                            const bonusText = `${fb}\u2192${tb} Spd ${parts.join('')}=${target}`;
                            return (
                                <g key={`ebo-${i}`} className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: [runner.runnerId] })} cursor="pointer">
                                    <rect x={x} y={row1Y} width={btnW} height={ROW1_H} rx="6" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                                    <text x={x + btnW / 2} y={row1Y + 32} textAnchor="middle" fontSize="20" fill="#002" fontWeight="normal" fontFamily="Impact">SEND: {truncate(runner.runnerName, 14)}</text>
                                    <text x={x + btnW / 2} y={row1Y + 56} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{bonusText}</text>
                                </g>
                            );
                        });
                        // Row 2 (or end of row 1): send all + hold
                        const row2W = (hasSendAll ? sendAllW + gap : 0) + holdW;
                        let sx = wrap ? CX - row2W / 2 : bx;
                        const sendAllEl = hasSendAll ? (
                            <g className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: runners.map(r => r.runnerId) })} cursor="pointer">
                                <rect x={sx} y={row2Y} width={sendAllW} height={ROW1_H} rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                                <text x={sx + sendAllW / 2} y={row2Y + 32} textAnchor="middle" fontSize="22" fill="#002" fontWeight="normal" fontFamily="Impact">SEND ALL</text>
                                <text x={sx + sendAllW / 2} y={row2Y + 58} textAnchor="middle" fontSize="15" fill="rgba(0,0,0,0.75)" fontFamily="Arial">All runners advance</text>
                            </g>
                        ) : null;
                        if (hasSendAll) sx += sendAllW + gap;
                        const holdEl = (
                            <g className="roll-button" onClick={() => onAction({ type: 'HOLD_RUNNERS' })} cursor="pointer">
                                <rect x={sx} y={row2Y} width={holdW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                                <text x={sx + holdW / 2} y={row2Y + 32} textAnchor="middle" fontSize="22" fill="#ccc" fontWeight="normal" fontFamily="Impact">HOLD RUNNERS</text>
                                <text x={sx + holdW / 2} y={row2Y + 58} textAnchor="middle" fontSize="15" fill="rgba(204,204,204,0.75)" fontFamily="Arial">Stay at current bases</text>
                            </g>
                        );
                        return (<>{runnerBtns}{sendAllEl}{holdEl}</>);
                    })()}
                </g>
            )}

            {/* GB Decision phase: defense chooses how to handle ground ball */}
            {!state.isOver && isMyTurn && state.phase === 'gb_decision' && state.gbOptions && (() => {
                const batter = getCurrentBatter(state);
                const ifField = fieldingTeam.totalInfieldFielding || 0;
                const batSpd = batter.speed;
                // Hold uses average speed of batter + runners (fast runners make the throw harder)
                const runnerSpeeds: number[] = [];
                if (state.bases.first) { const r = battingTeam.lineup.find(p => p.cardId === state.bases.first); if (r) runnerSpeeds.push(r.speed); }
                if (state.bases.second) { const r = battingTeam.lineup.find(p => p.cardId === state.bases.second); if (r) runnerSpeeds.push(r.speed); }
                if (state.bases.third) { const r = battingTeam.lineup.find(p => p.cardId === state.bases.third); if (r) runnerSpeeds.push(r.speed); }
                const avgSpd = Math.round([batSpd, ...runnerSpeeds].reduce((a, b) => a + b, 0) / (1 + runnerSpeeds.length));
                const rollVs = `d20+IF(${ifField}) vs Spd ${batSpd}`;
                const rollVsG = `d20+IF(${ifField}+10) vs Spd ${batSpd}`;
                const holdRollVs = `d20+IF(${ifField}) vs AvgSpd ${avgSpd}`;
                const holdRollVsG = `d20+IF(${ifField}+10) vs AvgSpd ${avgSpd}`;
                const buttons: { label: string; sub: string; choice: string; color: string; needsRoll: boolean; useHoldRoll?: boolean }[] = [];
                if (state.gbOptions.canDP) buttons.push({ label: 'DOUBLE PLAY', sub: rollVs, choice: 'dp', color: '#e94560', needsRoll: true });
                if (state.gbOptions.canForceHome) buttons.push({ label: 'FORCE HOME', sub: 'Out at home, batter to 1st', choice: 'force_home', color: '#8b5cf6', needsRoll: false });
                if (state.gbOptions.canHoldThird) buttons.push({ label: 'HOLD RUNNER', sub: holdRollVs, choice: 'hold', color: '#d4a018', needsRoll: true, useHoldRoll: true });
                if (state.gbOptions.canHoldRunners) buttons.push({ label: 'HOLD RUNNERS', sub: holdRollVs, choice: 'hold', color: '#d4a018', needsRoll: true, useHoldRoll: true });
                if (state.gbOptions.canAdvanceRunners) buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance, out at 1st', choice: 'advance', color: '#334155', needsRoll: false });
                if (!state.gbOptions.canDP && !state.gbOptions.canHoldRunners && !state.gbOptions.canHoldThird && !state.gbOptions.canAdvanceRunners) {
                    buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance', choice: 'advance', color: '#334155', needsRoll: false });
                }
                const gPlayers = state.gbOptions.gPlayers || [];
                const bw = 175, gap = 10;
                const totalW = buttons.length * bw + (buttons.length - 1) * gap;
                const startX = CX - totalW / 2;
                return (
                    <g>
                        <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="normal" fontFamily="Arial">
                            Ground Ball — IF: {ifField}  |  Batter Spd: {batSpd}{runnerSpeeds.length > 0 ? `  |  Avg Spd: ${avgSpd}` : ''}
                        </text>
                        {buttons.map((btn, i) => (
                            <g key={`gb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any })} cursor="pointer">
                                    <rect x={startX + i * (bw + gap)} y={ROW1} width={bw} height={ROW1_H} rx="6" fill={btn.color} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                                    <text x={startX + i * (bw + gap) + bw / 2} y={ROW1 + 32} textAnchor="middle" fontSize="22" fill="white" fontWeight="normal" fontFamily="Impact">{btn.label}</text>
                                    <text x={startX + i * (bw + gap) + bw / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="monospace">{btn.sub}</text>
                                </g>
                                {btn.needsRoll && gPlayers.map((gp, gi) => (
                                    <g key={`gb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any, goldGloveCardId: gp.cardId })} cursor="pointer">
                                        <rect x={startX + i * (bw + gap)} y={ROW2 + gi * 32} width={bw} height="28" rx="4" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                        <text x={startX + i * (bw + gap) + bw / 2} y={ROW2 + 12 + gi * 32} textAnchor="middle" fontSize="12" fill="#002" fontWeight="normal" fontFamily="Impact">USE G: {gp.name} ({gp.position})</text>
                                        <text x={startX + i * (bw + gap) + bw / 2} y={ROW2 + 24 + gi * 32} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.7)" fontFamily="monospace">{btn.useHoldRoll ? holdRollVsG : rollVsG}</text>
                                    </g>
                                ))}
                            </g>
                        ))}
                    </g>
                );
            })()}

            {/* Steal SB phase: offense decides whether to use SB icon */}
            {!state.isOver && isMyTurn && state.phase === 'steal_sb' && state.pendingSteal && (
                <g>
                    <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="normal" fontFamily="Arial">
                        {state.pendingSteal.runnerName} stealing {state.pendingSteal.toBase} — Use SB icon for automatic safe?
                    </text>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_SB_DECISION', useSB: true })} cursor="pointer">
                        <rect x={CX - 206} y={ROW1} width="200" height={ROW1_H} rx="6" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                        <text x={CX - 106} y={ROW1 + 32} textAnchor="middle" fontSize="20" fill="#002" fontWeight="normal" fontFamily="Impact">USE SB (AUTO SAFE)</text>
                        <text x={CX - 106} y={ROW1 + 58} textAnchor="middle" fontSize="14" fill="rgba(0,0,0,0.75)" fontFamily="Arial">Runner safe automatically</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_SB_DECISION', useSB: false })} cursor="pointer">
                        <rect x={CX + 6} y={ROW1} width="200" height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 106} y={ROW1 + 32} textAnchor="middle" fontSize="20" fill="#ccc" fontWeight="normal" fontFamily="Impact">NORMAL STEAL</text>
                        <text x={CX + 106} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(204,204,204,0.85)" fontFamily="monospace">Spd {state.pendingSteal.runnerSpeed} vs d20+Arm({state.pendingSteal.catcherArm}){state.pendingSteal.stealThirdBonus ? `+${state.pendingSteal.stealThirdBonus}` : ''}</text>
                    </g>
                </g>
            )}

            {/* Steal resolve phase: defense decides whether to use G */}
            {!state.isOver && isMyTurn && state.phase === 'steal_resolve' && state.pendingSteal && (() => {
                const ps = state.pendingSteal;
                const arm = ps.catcherArm || 0;
                const bonus = ps.stealThirdBonus || 0;
                const baseDef = `d20+Arm(${arm})${bonus ? `+${bonus}(3rd)` : ''} vs Spd ${ps.runnerSpeed}`;
                const gDef = `d20+Arm(${arm}+10)${bonus ? `+${bonus}(3rd)` : ''} vs Spd ${ps.runnerSpeed}`;
                const catchers = ps.catcherGPlayers || [];
                const btnW = 240;
                const noGW = 200;
                const gap = 10;
                const totalW = catchers.length * (btnW + gap) + noGW;
                let bx = CX - totalW / 2;
                return (
                    <g>
                        <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="normal" fontFamily="Arial">
                            {ps.runnerName} stealing {ps.toBase} — Use Gold Glove?
                        </text>
                        {catchers.map((gp: any, i: number) => {
                            const x = bx;
                            bx += btnW + gap;
                            return (
                                <g key={`sg-${i}`} className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION', goldGloveCardId: gp.cardId })} cursor="pointer">
                                    <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                    <text x={x + btnW / 2} y={ROW1 + 32} textAnchor="middle" fontSize="20" fill="#002" fontWeight="normal" fontFamily="Impact">USE G: {gp.name}</text>
                                    <text x={x + btnW / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,0.8)" fontFamily="monospace">{gDef}</text>
                                </g>
                            );
                        })}
                        <g className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION' })} cursor="pointer">
                            <rect x={bx} y={ROW1} width={noGW} height={ROW1_H} rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                            <text x={bx + noGW / 2} y={ROW1 + 32} textAnchor="middle" fontSize="20" fill="#ccc" fontWeight="normal" fontFamily="Impact">NO GOLD GLOVE</text>
                            <text x={bx + noGW / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(204,204,204,0.85)" fontFamily="monospace">{baseDef}</text>
                        </g>
                    </g>
                );
            })()}

            {/* Extra base phase: defense chooses who to throw at (with optional G) */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base' && state.extraBaseEligible && (() => {
                const ofField = fieldingTeam.totalOutfieldFielding || 0;
                // Only outfielders with G are relevant for extra base throws (OF fielding)
                const OF_POSITIONS = ['LF', 'CF', 'RF', 'LF-RF'];
                const gPlayers = fieldingTeam.lineup
                    .filter((p: any) => {
                        const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
                        return p.icons?.includes('G') && !fieldingTeam.iconUsage?.[p.cardId]?.['G'] && OF_POSITIONS.includes(pos);
                    })
                    .map((p: any) => ({ cardId: p.cardId, name: p.name, position: (p.assignedPosition || '').replace(/-\d+$/, '') }));
                const runners = state.extraBaseEligible!;
                const truncate = (name: string, max: number) => name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
                const btnW = 260;
                const gap = 12;
                const totalW = runners.length * btnW + (runners.length - 1) * gap;
                let bx = CX - totalW / 2;
                return (
                    <g>
                        <text x={CX} y={LABEL_Y} textAnchor="middle" fontSize="14" fill="#e94560" fontWeight="normal" fontFamily="Arial">
                            Runners advancing — OF total: {ofField}  |  Choose who to throw at:
                        </text>
                        {runners.map((runner, i) => {
                            const x = bx;
                            bx += btnW + gap;
                            const target = (runner as any).targetWithBonuses ?? runner.runnerSpeed;
                            return (
                                <g key={`eb-${i}`}>
                                    <g className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId })} cursor="pointer">
                                        <rect x={x} y={ROW1} width={btnW} height={ROW1_H} rx="6" fill="#e94560" stroke="#ff6b8a" strokeWidth="1.5"/>
                                        <text x={x + btnW / 2} y={ROW1 + 32} textAnchor="middle" fontSize="20" fill="white" fontWeight="normal" fontFamily="Impact">THROW: {truncate(runner.runnerName, 16)}</text>
                                        <text x={x + btnW / 2} y={ROW1 + 58} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} | d20+OF({ofField}) vs {target}</text>
                                    </g>
                                    {gPlayers.map((gp: any, gi: number) => (
                                        <g key={`eb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId, goldGloveCardId: gp.cardId })} cursor="pointer">
                                            <rect x={x} y={ROW2 + gi * 32} width={btnW} height="28" rx="4" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                            <text x={x + btnW / 2} y={ROW2 + 12 + gi * 32} textAnchor="middle" fontSize="12" fill="#002" fontWeight="normal" fontFamily="Impact">USE G: {gp.name} ({gp.position})</text>
                                            <text x={x + btnW / 2} y={ROW2 + 24 + gi * 32} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.7)" fontFamily="monospace">d20+OF({ofField}+10) vs {target}</text>
                                        </g>
                                    ))}
                                </g>
                            );
                        })}
                    </g>
                );
            })()}

            {/* Waiting for opponent — phase-specific context */}
            {!state.isOver && !isMyTurn && state.phase !== 'sp_roll' && (() => {
                const waitMsg: Record<string, string> = {
                    pre_atbat: 'Batter choosing action...',
                    defense_sub: 'Pitcher choosing action...',
                    ibb_decision: 'Pitcher choosing action...',
                    pitch: 'Pitcher rolling...',
                    swing: 'Batter swinging...',
                    bunt_decision: 'Batter deciding bunt...',
                    gb_decision: 'Defense making fielding play...',
                    extra_base_offer: 'Offense deciding extra bases...',
                    extra_base: 'Defense choosing throw...',
                    steal_sb: 'Runner deciding steal...',
                    steal_resolve: 'Defense deciding throw...',
                    result_icons: 'Deciding on icon use...',
                    offense_re: 'Batter choosing action...',
                };
                const msg = waitMsg[state.phase] || 'Waiting for opponent...';
                return (
                    <g>
                        <rect x={CX - 160} y={ROW1} width="320" height={ROW1_H} rx="6" fill="rgba(0,0,0,0.6)"/>
                        <text x={CX} y={ROW1 + 46} textAnchor="middle" fontSize="16" fill="#999" fontStyle="italic" fontFamily="Arial">{msg}</text>
                    </g>
                );
            })()}

            {/* Game over */}
            {state.isOver && (() => {
                const iWon = state.winnerId === (myRole === 'home' ? state.homeTeam.userId : state.awayTeam.userId);
                const winnerName = state.winnerId === state.homeTeam.userId ? 'HOME' : 'AWAY';
                return (
                    <g>
                        <rect x={CX - 200} y={ROW1 - 10} width="400" height="66" rx="10" fill="rgba(0,0,0,0.9)" stroke={iWon ? '#4ade80' : '#e94560'} strokeWidth="2"/>
                        <text x={CX} y={ROW1 + 16} textAnchor="middle" fontSize="26" fill={iWon ? '#4ade80' : '#e94560'} fontWeight="normal" fontFamily="Impact,sans-serif" letterSpacing="3">
                            {iWon ? 'YOU WIN!' : `${winnerName} WINS!`}
                        </text>
                        <text x={CX} y={ROW1 + 58} textAnchor="middle" fontSize="20" fill="white" fontWeight="normal" fontFamily="Impact,sans-serif" letterSpacing="2">
                            {state.score.away} {'\u2013'} {state.score.home}
                        </text>
                    </g>
                );
            })()}
        </g>
    );
}
