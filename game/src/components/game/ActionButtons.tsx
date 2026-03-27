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

/** All phase-specific action button groups rendered as an SVG <g> element */
export default function ActionButtons({ state, myRole, isMyTurn, iAmBatting, onAction, battingTeam, fieldingTeam, hasRunners, outcomeNames, onShowSubPanel }: ActionButtonsProps) {
    return (
        <g>
            {/* Pre-atbat phase: offense can pinch hit, steal, sac bunt, or skip */}
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
                            <rect x="460" y="720" width="130" height="34" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x="525" y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">PINCH HIT</text>
                        </g>
                    )}
                    {/* Sac bunt: runners on 1st/2nd, no runner on 3rd, less than 2 outs */}
                    {hasRunners && !state.bases.third && state.outs < 2 && (
                        <g className="roll-button" onClick={() => onAction({ type: 'SAC_BUNT' })} cursor="pointer">
                            <rect x="600" y="720" width="110" height="34" rx="6" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1.5"/>
                            <text x="655" y="742" textAnchor="middle" fontSize="12" fill="white" fontWeight="900" fontFamily="Impact">SAC BUNT</text>
                        </g>
                    )}
                    {/* Steal buttons for eligible runners */}
                    {state.bases.first && !state.bases.second && (
                        <g className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.first! })} cursor="pointer">
                            <rect x="720" y="720" width="130" height="34" rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x="785" y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 2ND</text>
                        </g>
                    )}
                    {state.bases.second && !state.bases.third && (
                        <g className="roll-button" onClick={() => onAction({ type: 'STEAL', runnerId: state.bases.second! })} cursor="pointer">
                            <rect x={state.bases.first && !state.bases.second ? 860 : 720} y="720" width="130" height="34" rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x={state.bases.first && !state.bases.second ? 925 : 785} y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">STEAL 3RD</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                        <rect x="860" y="720" width="80" height="34" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x="900" y="742" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
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
                            <rect x="420" y="720" width="160" height="34" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x="500" y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">CHANGE PITCHER</text>
                        </g>
                    )}
                    {/* 20 icon: +3 control for one pitch this inning */}
                    {!state.icon20UsedThisInning && fieldingTeam.pitcher.icons?.includes('20') && (
                        <g className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: '20' })} cursor="pointer">
                            <rect x="590" y="720" width="130" height="34" rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                            <text x="655" y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">USE 20 (+3)</text>
                        </g>
                    )}
                    {/* RP icon: +3 control for full inning after 6th */}
                    {state.inning > 6 && !state.rpActiveInning && fieldingTeam.pitcher.icons?.includes('RP') && (
                        <g className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: fieldingTeam.pitcher.cardId, icon: 'RP' })} cursor="pointer">
                            <rect x="730" y="720" width="130" height="34" rx="6" fill="#60a5fa" stroke="#93c5fd" strokeWidth="1.5"/>
                            <text x="795" y="742" textAnchor="middle" fontSize="12" fill="#002" fontWeight="900" fontFamily="Impact">USE RP (+3)</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                        <rect x="870" y="720" width="80" height="34" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x="910" y="742" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                    </g>
                </g>
                );
            })()}

            {/* Pitch phase */}
            {!state.isOver && isMyTurn && state.phase === 'pitch' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                    <rect x="600" y="730" width="200" height="45" rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                    <text x="700" y="760" textAnchor="middle" fontSize="20" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL PITCH</text>
                </g>
            )}

            {/* Swing phase */}
            {!state.isOver && isMyTurn && state.phase === 'swing' && (
                <g className="roll-button" onClick={() => onAction({ type: 'ROLL_SWING' })} cursor="pointer">
                    <rect x="600" y="730" width="200" height="45" rx="8" fill="#4ade80" stroke="#6bff9a" strokeWidth="2"/>
                    <text x="700" y="760" textAnchor="middle" fontSize="20" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL SWING</text>
                </g>
            )}

            {/* Result icons phase: show icon buttons */}
            {!state.isOver && isMyTurn && state.phase === 'result_icons' && state.iconPrompt && (
                <g>
                    <rect x="480" y="670" width="440" height="40" rx="6" fill="rgba(0,0,0,0.8)"/>
                    <text x="700" y="696" textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="bold" fontFamily="Arial">
                        {state.lastOutcome ? `Result: ${outcomeNames[state.lastOutcome] || state.lastOutcome}` : 'Icon Decision'}
                    </text>
                    {state.iconPrompt.availableIcons.map((ic, i) => (
                        <g key={`icon-${i}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: ic.cardId, icon: ic.icon })} cursor="pointer">
                            <rect x={500 + i * 150} y="720" width="140" height="38" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                            <text x={570 + i * 150} y="744" textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">{ic.description.split(':')[0]}</text>
                        </g>
                    ))}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_ICONS' })} cursor="pointer">
                        <rect x={500 + state.iconPrompt.availableIcons.length * 150} y="720" width="100" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={550 + state.iconPrompt.availableIcons.length * 150} y="744" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">DECLINE</text>
                    </g>
                </g>
            )}

            {/* Extra base offer phase: offense decides whether to send runners */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base_offer' && state.extraBaseEligible && (
                <g>
                    <rect x="380" y="660" width="640" height="40" rx="6" fill="rgba(0,0,0,0.85)"/>
                    <text x="700" y="686" textAnchor="middle" fontSize="13" fill="#4ade80" fontWeight="bold" fontFamily="Arial">
                        Send runners for extra bases?
                    </text>
                    {state.extraBaseEligible.map((runner, i) => (
                        <g key={`ebo-${i}`} className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: [runner.runnerId] })} cursor="pointer">
                            <rect x={420 + i * 190} y="710" width="180" height="38" rx="6" fill="#4ade80" stroke="#6bff9a" strokeWidth="1.5"/>
                            <text x={510 + i * 190} y="728" textAnchor="middle" fontSize="11" fill="#002" fontWeight="bold" fontFamily="Arial">SEND: {runner.runnerName}</text>
                            <text x={510 + i * 190} y="742" textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.6)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Spd:{runner.runnerSpeed}</text>
                        </g>
                    ))}
                    {state.extraBaseEligible.length > 1 && (
                        <g className="roll-button" onClick={() => onAction({ type: 'SEND_RUNNERS', runnerIds: state.extraBaseEligible!.map(r => r.runnerId) })} cursor="pointer">
                            <rect x={420 + state.extraBaseEligible.length * 190} y="710" width="120" height="38" rx="6" fill="#22c55e" stroke="#4ade80" strokeWidth="1.5"/>
                            <text x={480 + state.extraBaseEligible.length * 190} y="734" textAnchor="middle" fontSize="11" fill="#002" fontWeight="bold" fontFamily="Arial">SEND ALL</text>
                        </g>
                    )}
                    <g className="roll-button" onClick={() => onAction({ type: 'HOLD_RUNNERS' })} cursor="pointer">
                        <rect x={420 + (state.extraBaseEligible.length + (state.extraBaseEligible.length > 1 ? 1 : 0)) * 190} y="710" width="100" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={470 + (state.extraBaseEligible.length + (state.extraBaseEligible.length > 1 ? 1 : 0)) * 190} y="734" textAnchor="middle" fontSize="11" fill="#ccc" fontWeight="bold" fontFamily="Arial">HOLD</text>
                    </g>
                </g>
            )}

            {/* GB Decision phase: defense chooses how to handle ground ball */}
            {!state.isOver && isMyTurn && state.phase === 'gb_decision' && state.gbOptions && (
                <g>
                    <rect x="350" y="650" width="700" height="40" rx="6" fill="rgba(0,0,0,0.85)"/>
                    <text x="700" y="676" textAnchor="middle" fontSize="13" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        Ground Ball — Choose defensive play:{state.gbOptions.gAvailable ? ` (G: ${state.gbOptions.gPlayerName})` : ''}
                    </text>
                    {(() => {
                        const buttons: { label: string; sub: string; choice: string; color: string }[] = [];
                        if (state.gbOptions.canDP) buttons.push({ label: 'DOUBLE PLAY', sub: 'Runner on 1st out + roll for batter', choice: 'dp', color: '#e94560' });
                        if (state.gbOptions.canForceHome) buttons.push({ label: 'FORCE AT HOME', sub: 'Out at home, no run scores', choice: 'force_home', color: '#8b5cf6' });
                        if (state.gbOptions.canHoldThird) buttons.push({ label: 'HOLD 3RD', sub: 'No DP, roll for out at 1st', choice: 'hold', color: '#d4a018' });
                        if (state.gbOptions.canHoldRunners) buttons.push({ label: 'HOLD RUNNERS', sub: 'Roll for out at 1st', choice: 'hold', color: '#d4a018' });
                        if (!state.gbOptions.canDP && !state.gbOptions.canHoldRunners && !state.gbOptions.canHoldThird) {
                            buttons.push({ label: 'LET ADVANCE', sub: 'Runners advance, batter out', choice: 'dp', color: '#334155' });
                        }
                        const bw = 160, gap = 10;
                        const totalW = buttons.length * (bw + gap) + (state.gbOptions.gAvailable ? bw + gap : 0);
                        const startX = 700 - totalW / 2;
                        return buttons.map((btn, i) => (
                            <g key={`gb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any, useGoldGlove: false })} cursor="pointer">
                                    <rect x={startX + i * (bw + gap)} y="700" width={bw} height="42" rx="6" fill={btn.color} stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                                    <text x={startX + i * (bw + gap) + bw/2} y="718" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">{btn.label}</text>
                                    <text x={startX + i * (bw + gap) + bw/2} y="734" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)" fontFamily="Arial">{btn.sub}</text>
                                </g>
                                {state.gbOptions!.gAvailable && btn.choice !== 'force_home' && (
                                    <g className="roll-button" onClick={() => onAction({ type: 'GB_DECISION', choice: btn.choice as any, useGoldGlove: true })} cursor="pointer">
                                        <rect x={startX + i * (bw + gap)} y="746" width={bw} height="20" rx="3" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                        <text x={startX + i * (bw + gap) + bw/2} y="760" textAnchor="middle" fontSize="9" fill="#002" fontWeight="bold" fontFamily="Arial">+ USE G (+10)</text>
                                    </g>
                                )}
                            </g>
                        ));
                    })()}
                </g>
            )}

            {/* Steal resolve phase: defense decides whether to use G */}
            {!state.isOver && isMyTurn && state.phase === 'steal_resolve' && state.pendingSteal && (
                <g>
                    <rect x="440" y="660" width="520" height="40" rx="6" fill="rgba(0,0,0,0.85)"/>
                    <text x="700" y="686" textAnchor="middle" fontSize="13" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        {state.pendingSteal.runnerName} stealing {state.pendingSteal.toBase} — Use Gold Glove?
                    </text>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION', useGoldGlove: true })} cursor="pointer">
                        <rect x="530" y="710" width="150" height="38" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                        <text x="605" y="734" textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">USE G (+10 Arm)</text>
                    </g>
                    <g className="roll-button" onClick={() => onAction({ type: 'STEAL_G_DECISION', useGoldGlove: false })} cursor="pointer">
                        <rect x="700" y="710" width="150" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x="775" y="734" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO G</text>
                    </g>
                </g>
            )}

            {/* Extra base phase: defense chooses who to throw at (with optional G) */}
            {!state.isOver && isMyTurn && state.phase === 'extra_base' && state.extraBaseEligible && (
                <g>
                    <rect x="350" y="650" width="700" height="40" rx="6" fill="rgba(0,0,0,0.85)"/>
                    <text x="700" y="676" textAnchor="middle" fontSize="13" fill="#e94560" fontWeight="bold" fontFamily="Arial">
                        Runners advancing — Choose who to throw at:
                    </text>
                    {state.extraBaseEligible.map((runner, i) => {
                        return (
                            <g key={`eb-${i}`}>
                                <g className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId, useGoldGlove: false })} cursor="pointer">
                                    <rect x={420 + i * 200} y="700" width="180" height="38" rx="6" fill="#e94560" stroke="#ff6b8a" strokeWidth="1.5"/>
                                    <text x={510 + i * 200} y="718" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">THROW: {runner.runnerName}</text>
                                    <text x={510 + i * 200} y="732" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Target:{(runner as any).targetWithBonuses || runner.runnerSpeed}</text>
                                </g>
                                <g className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId, useGoldGlove: true })} cursor="pointer">
                                    <rect x={420 + i * 200} y="742" width="180" height="20" rx="3" fill="#d4a018" stroke="#f0c840" strokeWidth="1"/>
                                    <text x={510 + i * 200} y="756" textAnchor="middle" fontSize="9" fill="#002" fontWeight="bold" fontFamily="Arial">THROW + G (+10 OF)</text>
                                </g>
                            </g>
                        );
                    })}
                    <g className="roll-button" onClick={() => onAction({ type: 'SKIP_EXTRA_BASE' })} cursor="pointer">
                        <rect x={420 + state.extraBaseEligible.length * 200} y="700" width="120" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                        <text x={480 + state.extraBaseEligible.length * 200} y="724" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO THROW</text>
                    </g>
                </g>
            )}

            {/* Waiting for opponent */}
            {!state.isOver && !isMyTurn && (
                <g>
                    <rect x="580" y="730" width="240" height="40" rx="6" fill="rgba(0,0,0,0.6)"/>
                    <text x="700" y="757" textAnchor="middle" fontSize="14" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for opponent...</text>
                </g>
            )}

            {/* Game over */}
            {state.isOver && (
                <g>
                    <rect x="520" y="700" width="360" height="60" rx="10" fill="rgba(0,0,0,0.85)"/>
                    <text x="700" y="740" textAnchor="middle" fontSize="28" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">
                        GAME OVER  {state.score.away}{'\u2013'}{state.score.home}
                    </text>
                </g>
            )}
        </g>
    );
}
