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

// Layout constants for action area (viewBox 2410x2100, action area y=1900..2100)
const ROW1 = 1920;   // main button row y
const ROW1_H = 55;   // button height
const ROW2 = 1985;   // secondary row for G icons etc
const CX = 1205;     // center x

/** All phase-specific action button groups rendered as an SVG <g> element */
export default function ActionButtons({ state, myRole, isMyTurn, iAmBatting, onAction, battingTeam, fieldingTeam, hasRunners, outcomeNames, onShowSubPanel }: ActionButtonsProps) {
    return (
        <g>
            {/* SP Roll phase: home team rolls for starting pitchers */}
            {!state.isOver && isMyTurn && state.phase === 'sp_roll' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_STARTERS' })} cursor="pointer">
                    <rect x={CX - 195} y={ROW1} width="390" height={ROW1_H} rx="12" fill="#d4a018" stroke="#f0c840" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 38} textAnchor="middle" fontSize="33" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">ROLL FOR PITCHERS</text>
                </g>
            )}
            {!state.isOver && !isMyTurn && state.phase === 'sp_roll' && (
                <g>
                    <rect x={CX - 195} y={ROW1 + 5} width="390" height={ROW1_H - 5} rx="8" fill="rgba(0,0,0,0.6)"/>
                    <text x={CX} y={ROW1 + 38} textAnchor="middle" fontSize="21" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for home team to roll...</text>
                </g>
            )}

            {/* Pre-atbat phase: offense can pinch hit, steal, or skip */}
            {!state.isOver && isMyTurn && state.phase === 'pre_atbat' && (() => {
                // Filter bench: backups can't PH before 7th (home exception: bottom of 6th)
                // With DH, backups can never PH for pitcher, so they just can't PH at all before 7th
                const isHomeBatting = state.halfInning === 'bottom';
                const backupAllowed = isHomeBatting ? state.inning >= 6 : state.inning >= 7;
                const eligibleBench = battingTeam.bench.filter(p => !p.isBackup || backupAllowed);
                return (
                <g>
                    {eligibleBench.length > 0 && (
                        <g className="roll-button" onClick={() => onShowSubPanel()} cursor="pointer">
                            <rect x={CX - 340} y={ROW1} width="170" height="45" rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x={CX - 255} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">PINCH HIT</text>
                        </g>
                    )}
                    {/* Steal buttons for eligible runners */}
                    {state.bases.first && !state.bases.second && (
                        <g className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.first! })} cursor="pointer">
                            <rect x={CX - 85} y={ROW1} width="170" height="45" rx="8" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x={CX} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 2ND</text>
                        </g>
                    )}
                    {state.bases.second && !state.bases.third && (
                        <g className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.second! })} cursor="pointer">
                            <rect x={state.bases.first && !state.bases.second ? CX + 95 : CX - 85} y={ROW1} width="170" height="45" rx="8" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x={state.bases.first && !state.bases.second ? CX + 180 : CX} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 3RD</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                        <rect x={CX + 170} y={ROW1} width="104" height="45" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 222} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                    </g>
                </g>
                );
            })()}

            {/* Defense sub phase: defense can change pitcher or skip */}
            {!state.isOver && isMyTurn && state.phase === 'defense_sub' && (() => {
                const hasRelievers = fieldingTeam.bullpen.filter(p => p.role !== 'Starter').length > 0;
                const isStarter = fieldingTeam.pitcher.role === 'Starter' && fieldingTeam.pitcherEntryInning === 1;
                // Determine runs scored against fielding team's pitcher
                const battingSideKey = state.halfInning === 'top' ? 'away' : 'home';
                const runsAgainst = state.score[battingSideKey];
                // Starter can only be removed if: inning >= 5 OR 10+ runs scored
                const canChangePitcher = hasRelievers && (!isStarter || state.inning >= 5 || runsAgainst >= 10);
                return (
                <g>
                    {canChangePitcher && (
                        <g className="roll-button" onClick={() => onShowSubPanel()} cursor="pointer">
                            <rect x={CX - 400} y={ROW1} width="208" height="45" rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x={CX - 296} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">CHANGE PITCHER</text>
                        </g>
                    )}
                    {/* 20 icon: +3 control for one pitch this inning */}
                    {!state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20') && (
                        <g className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: '20' })} cursor="pointer">
                            <rect x={CX - 170} y={ROW1} width="170" height="45" rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                            <text x={CX - 85} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">USE 20 (+3)</text>
                        </g>
                    )}
                    {/* RP icon: +3 control for full inning after 6th */}
                    {state.inning > 6 && !state.rpActiveInning && fieldingTeam.pitcher.icons?.includes('RP') && (
                        <g className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                            <rect x={CX + 20} y={ROW1} width="170" height="45" rx="8" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                            <text x={CX + 105} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">USE RP (+3)</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                        <rect x={CX + 210} y={ROW1} width="104" height="45" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 262} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                    </g>
                </g>
                );
            })()}

            {/* IBB decision phase: defense can intentionally walk */}
            {!state.isOver && isMyTurn && state.phase === 'ibb_decision' && (
                <g>
                    <g className="roll-button" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })} cursor="pointer">
                        <rect x={CX - 190} y={ROW1} width="234" height="45" rx="8" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5"/>
                        <text x={CX - 73} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#002" fontWeight="900" fontFamily="Impact">INTENTIONAL WALK</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_IBB' })} cursor="pointer">
                        <rect x={CX + 60} y={ROW1} width="104" height="45" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 112} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="900" fontFamily="Impact">PITCH</text>
                    </g>
                </g>
            )}

            {/* Bunt decision phase: offense can sac bunt */}
            {!state.isOver && isMyTurn && state.phase === 'bunt_decision' && (
                <g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SAC_BUNT' })} cursor="pointer">
                        <rect x={CX - 175} y={ROW1} width="195" height="45" rx="8" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1.5"/>
                        <text x={CX - 78} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="white" fontWeight="900" fontFamily="Impact">SAC BUNT</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_BUNT' })} cursor="pointer">
                        <rect x={CX + 40} y={ROW1} width="104" height="45" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX + 92} y={ROW1 + 30} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                    </g>
                </g>
            )}

            {/* Pitch phase */}
            {!state.isOver && isMyTurn && state.phase === 'pitch' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                    <rect x={CX - 130} y={ROW1} width="260" height={ROW1_H} rx="10" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 38} textAnchor="middle" fontSize="30" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL PITCH</text>
                </g>
            )}

            {/* Swing phase */}
            {!state.isOver && isMyTurn && state.phase === 'swing' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_SWING' })} cursor="pointer">
                    <rect x={CX - 130} y={ROW1} width="260" height={ROW1_H} rx="10" fill="#4ade80" stroke="#6bff9a" strokeWidth="2"/>
                    <text x={CX} y={ROW1 + 38} textAnchor="middle" fontSize="30" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL SWING</text>
                </g>
            )}

            {/* Result icons phase: show icon buttons */}
            {!state.isOver && isMyTurn && state.phase === 'result_icons' && state.iconPrompt && (
                <g>
                    <rect x={CX - 286} y={ROW1 - 65} width="572" height={ROW1_H} rx="8" fill="rgba(0,0,0,0.8)"/>
                    <text x={CX} y={ROW1 - 27} textAnchor="middle" fontSize="20" fill="#d4a018" fontWeight="bold" fontFamily="Arial">
                        {state.lastOutcome ? `Result: ${outcomeNames[state.lastOutcome] || state.lastOutcome}` : 'Icon Decision'}
                    </text>
                    {state.iconPrompt.availableIcons.map((ic, i) => (
                        <g key={`icon-${i}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: ic.cardId, icon: ic.icon })} cursor="pointer">
                            <rect x={CX - 200 + i * 195} y={ROW1} width="182" height="50" rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x={CX - 109 + i * 195} y={ROW1 + 32} textAnchor="middle" fontSize="18" fill="#002" fontWeight="bold" fontFamily="Arial">{ic.description.split(':')[0]}</text>
                        </g>
                    ))}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_ICONS' })} cursor="pointer">
                        <rect x={CX - 200 + state.iconPrompt.availableIcons.length * 195} y={ROW1} width="130" height="50" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX - 135 + state.iconPrompt.availableIcons.length * 195} y={ROW1 + 32} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="bold" fontFamily="Arial">DECLINE</text>
                    </g>
                </g>
            )}

            {/* Extra base offer phase: offense decides whether to send runners */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base_offer' && state.extraBaseEligible && (
                <g>
                    <rect x={CX - 416} y={ROW1 - 65} width="832" height={ROW1_H} rx="8" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 - 27} textAnchor="middle" fontSize="20" fill="#4ade80" fontWeight="bold" fontFamily="Arial">
                        Send runners for extra bases?
                    </text>
                    {state.extraBaseEligible.map((runner, i) => (
                        <g key={`ebo-${i}`} className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: [runner.runnerId] })} cursor="pointer">
                            <rect x={CX - 380 + i * 247} y={ROW1} width="234" height="50" rx="8" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                            <text x={CX - 263 + i * 247} y={ROW1 + 22} textAnchor="middle" fontSize="17" fill="#002" fontWeight="bold" fontFamily="Arial">SEND: {runner.runnerName}</text>
                            <text x={CX - 263 + i * 247} y={ROW1 + 40} textAnchor="middle" fontSize="14" fill="rgba(0,0,0,0.6)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Spd:{runner.runnerSpeed}</text>
                        </g>
                    ))}
                    {state.extraBaseEligible.length > 1 && (
                        <g className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: state.extraBaseEligible!.map(r => r.runnerId) })} cursor="pointer">
                            <rect x={CX - 380 + state.extraBaseEligible.length * 247} y={ROW1} width="156" height="50" rx="8" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x={CX - 302 + state.extraBaseEligible.length * 247} y={ROW1 + 32} textAnchor="middle" fontSize="17" fill="#002" fontWeight="bold" fontFamily="Arial">SEND ALL</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'HOLD_RUNNERS' })} cursor="pointer">
                        <rect x={CX - 380 + (state.extraBaseEligible.length + (state.extraBaseEligible.length > 1 ? 1 : 0)) * 247} y={ROW1} width="130" height="50" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX - 315 + (state.extraBaseEligible.length + (state.extraBaseEligible.length > 1 ? 1 : 0)) * 247} y={ROW1 + 32} textAnchor="middle" fontSize="17" fill="#ccc" fontWeight="bold" fontFamily="Arial">HOLD</text>
                    </g>
                </g>
            )}

            {/* GB Decision phase: defense chooses how to handle ground ball */}
            {!state.isOver && isMyTurn && state.phase === 'gb_decision' && state.gbOptions && (
                <g>
                    <rect x={CX - 455} y={ROW1 - 75} width="910" height={ROW1_H} rx="8" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 - 37} textAnchor="middle" fontSize="20" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        Ground Ball — Choose defensive play:
                    </text>
                    {(() => {
                        const buttons: { label: string; sub: string; choice: string; color: string }[] = [];
                        if (state.gbOptions.canDP) buttons.push({ label: 'DOUBLE PLAY', sub: 'Runner on 1st out + roll', choice: 'dp', color: '#e94560' });
                        if (state.gbOptions.canForceHome) buttons.push({ label: 'FORCE HOME', sub: 'Out at home, no run', choice: 'force_home', color: '#8b5cf6' });
                        if (state.gbOptions.canHoldThird) buttons.push({ label: 'HOLD 3RD', sub: 'No DP, roll at 1st', choice: 'hold', color: '#d4a018' });
                        if (state.gbOptions.canHoldRunners) buttons.push({ label: 'HOLD', sub: 'Roll for out at 1st', choice: 'hold', color: '#d4a018' });
                        if (!state.gbOptions.canDP && !state.gbOptions.canHoldRunners && !state.gbOptions.canHoldThird) {
                            buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance', choice: 'dp', color: '#334155' });
                        }
                        const gPlayers = state.gbOptions.gPlayers || [];
                        const bw = 182, gap = 10;
                        const startX = CX - (buttons.length * (bw + gap)) / 2;
                        return buttons.map((btn, i) => (
                            <g key={`gb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any })} cursor="pointer">
                                    <rect x={startX + i * (bw + gap)} y={ROW1} width={bw} height="50" rx="8" fill={btn.color} stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                                    <text x={startX + i * (bw + gap) + bw/2} y={ROW1 + 21} textAnchor="middle" fontSize="15" fill="white" fontWeight="bold" fontFamily="Arial">{btn.label}</text>
                                    <text x={startX + i * (bw + gap) + bw/2} y={ROW1 + 39} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.6)" fontFamily="Arial">{btn.sub}</text>
                                </g>
                                {btn.choice !== 'force_home' && gPlayers.map((gp, gi) => (
                                    <g key={`gb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any, goldGloveCardId: gp.cardId })} cursor="pointer">
                                        <rect x={startX + i * (bw + gap)} y={ROW2 + gi * 24} width={bw} height="21" rx="4" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                        <text x={startX + i * (bw + gap) + bw/2} y={ROW2 + 16 + gi * 24} textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">+ G: {gp.name} ({gp.position})</text>
                                    </g>
                                ))}
                            </g>
                        ));
                    })()}
                </g>
            )}

            {/* Steal resolve phase: defense decides whether to use G */}
            {!state.isOver && isMyTurn && state.phase === 'steal_resolve' && state.pendingSteal && (
                <g>
                    <rect x={CX - 416} y={ROW1 - 65} width="832" height={ROW1_H} rx="8" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 - 27} textAnchor="middle" fontSize="20" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        {state.pendingSteal.runnerName} stealing {state.pendingSteal.toBase} — Use Gold Glove?
                    </text>
                    {(state.pendingSteal.catcherGPlayers || []).map((gp: any, i: number) => (
                        <g key={`sg-${i}`} className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION', goldGloveCardId: gp.cardId })} cursor="pointer">
                            <rect x={CX - 220 + i * 208} y={ROW1} width="195" height="50" rx="8" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x={CX - 123 + i * 208} y={ROW1 + 32} textAnchor="middle" fontSize="17" fill="#002" fontWeight="bold" fontFamily="Arial">G: {gp.name} (+10)</text>
                        </g>
                    ))}
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION' })} cursor="pointer">
                        <rect x={CX - 220 + (state.pendingSteal.catcherGPlayers || []).length * 208} y={ROW1} width="156" height="50" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX - 142 + (state.pendingSteal.catcherGPlayers || []).length * 208} y={ROW1 + 32} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO G</text>
                    </g>
                </g>
            )}

            {/* Extra base phase: defense chooses who to throw at (with optional G) */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base' && state.extraBaseEligible && (
                <g>
                    <rect x={CX - 455} y={ROW1 - 75} width="910" height={ROW1_H} rx="8" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 - 37} textAnchor="middle" fontSize="20" fill="#e94560" fontWeight="bold" fontFamily="Arial">
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
                        return state.extraBaseEligible!.map((runner, i) => (
                            <g key={`eb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId })} cursor="pointer">
                                    <rect x={CX - 380 + i * 260} y={ROW1} width="234" height="45" rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="1.5"/>
                                    <text x={CX - 263 + i * 260} y={ROW1 + 20} textAnchor="middle" fontSize="17" fill="white" fontWeight="bold" fontFamily="Arial">THROW: {runner.runnerName}</text>
                                    <text x={CX - 263 + i * 260} y={ROW1 + 37} textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.7)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Tgt:{(runner as any).targetWithBonuses || runner.runnerSpeed}</text>
                                </g>
                                {gPlayers.map((gp: any, gi: number) => (
                                    <g key={`eb-g-${i}-${gi}`} className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId, goldGloveCardId: gp.cardId })} cursor="pointer">
                                        <rect x={CX - 380 + i * 260} y={ROW2 + gi * 24} width="234" height="21" rx="4" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                        <text x={CX - 263 + i * 260} y={ROW2 + 16 + gi * 24} textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">+ G: {gp.name} ({gp.position})</text>
                                    </g>
                                ))}
                            </g>
                        ));
                    })()}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_EXTRA_BASE' })} cursor="pointer">
                        <rect x={CX - 380 + state.extraBaseEligible.length * 260} y={ROW1} width="156" height="50" rx="8" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={CX - 302 + state.extraBaseEligible.length * 260} y={ROW1 + 32} textAnchor="middle" fontSize="18" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO THROW</text>
                    </g>
                </g>
            )}

            {/* Waiting for opponent */}
            {!state.isOver && !isMyTurn && (
                <g>
                    <rect x={CX - 156} y={ROW1} width="312" height={ROW1_H - 5} rx="8" fill="rgba(0,0,0,0.6)"/>
                    <text x={CX} y={ROW1 + 35} textAnchor="middle" fontSize="21" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for opponent...</text>
                </g>
            )}

            {/* Game over */}
            {state.isOver && (
                <g>
                    <rect x={CX - 234} y={ROW1 - 10} width="468" height="75" rx="12" fill="rgba(0,0,0,0.85)"/>
                    <text x={CX} y={ROW1 + 40} textAnchor="middle" fontSize="42" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">
                        GAME OVER  {state.score.away}{'\u2013'}{state.score.home}
                    </text>
                </g>
            )}
        </g>
    );
}
