import type { GameState } from '../../types/gameState';
import type { GameAction } from '../../types/gameActions';
import type { PlayerRole } from '../../types/game';
import { whoseTurn, getPhaseDescription } from '../../engine/gameEngine';
import { getOffensiveIcons, getDefensiveIcons, getPrePitchOffenseIcons, getDefensePrePitchIcons } from '../../engine/icons';
import { getAvailablePinchHitters, getAvailableRelievers } from '../../engine/substitutions';
import { rollD20 } from '../../engine/dice';
import './ActionBar.css';

interface Props {
    state: GameState;
    myRole: PlayerRole;
    onAction: (action: GameAction) => void;
}

export default function ActionBar({ state, myRole, onAction }: Props) {
    const turn = whoseTurn(state);
    const isMyTurn = turn === myRole;
    const description = getPhaseDescription(state);

    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const isBatting = (state.halfInning === 'top' && myRole === 'away') || (state.halfInning === 'bottom' && myRole === 'home');

    if (state.isOver) {
        const won = state.winnerId === (myRole === 'home' ? state.homeTeam.userId : state.awayTeam.userId);
        return (
            <div className="action-bar">
                <div className={`game-over-msg ${won ? 'won' : 'lost'}`}>
                    {won ? 'You Win!' : 'You Lose'} — {state.score.away}-{state.score.home}
                </div>
            </div>
        );
    }

    if (!isMyTurn) {
        return (
            <div className="action-bar">
                <div className="waiting-msg">Waiting for opponent... ({description})</div>
            </div>
        );
    }

    return (
        <div className="action-bar">
            <div className="action-phase">{description}</div>
            <div className="action-buttons">
                {renderActions(state, myRole, isBatting, battingTeam, fieldingTeam, onAction)}
            </div>
        </div>
    );
}

function renderActions(
    state: GameState,
    myRole: PlayerRole,
    isBatting: boolean,
    battingTeam: typeof state.homeTeam,
    fieldingTeam: typeof state.homeTeam,
    onAction: (action: GameAction) => void,
) {
    switch (state.phase) {
        case 'pre_atbat': {
            // Offense: pinch hit or skip
            const pinchHitters = getAvailablePinchHitters(battingTeam);
            return (
                <>
                    {pinchHitters.length > 0 && (
                        <select className="action-select" onChange={e => {
                            if (e.target.value) {
                                onAction({ type: 'PINCH_HIT', benchIndex: parseInt(e.target.value), replacingIndex: battingTeam.currentBatterIndex });
                            }
                        }}>
                            <option value="">Pinch Hit...</option>
                            {pinchHitters.map((p, i) => (
                                <option key={i} value={i}>{p.card.name} ({p.card.points}pt)</option>
                            ))}
                        </select>
                    )}
                    <button className="action-btn" onClick={() => onAction({ type: 'SKIP_PRE_ATBAT' })}>
                        Continue
                    </button>
                </>
            );
        }

        case 'defense_sub': {
            const relievers = getAvailableRelievers(fieldingTeam, state.inning);
            const defIcons20 = getDefensePrePitchIcons(state);
            return (
                <>
                    {relievers.length > 0 && (
                        <select className="action-select" onChange={e => {
                            if (e.target.value) {
                                const idx = fieldingTeam.pitchers.findIndex(p => p.cardId === e.target.value);
                                onAction({ type: 'PITCHING_CHANGE', pitcherIndex: idx });
                            }
                        }}>
                            <option value="">Change Pitcher...</option>
                            {relievers.map(p => (
                                <option key={p.cardId} value={p.cardId}>{p.card.name} ({p.card.role}, IP:{p.card.ip})</option>
                            ))}
                        </select>
                    )}
                    <button className="action-btn warn" onClick={() => onAction({ type: 'INTENTIONAL_WALK' })}>
                        Intentional Walk
                    </button>
                    {defIcons20.map(ic => (
                        <button key={ic.icon} className="action-btn icon-btn" onClick={() => {
                            if (ic.icon === '20') onAction({ type: 'USE_ICON_20' });
                            else if (ic.icon === 'RP') onAction({ type: 'USE_ICON_RP' });
                        }}>
                            {ic.description}
                        </button>
                    ))}
                    <button className="action-btn primary" onClick={() => onAction({ type: 'SKIP_DEFENSE_SUB' })}>
                        Continue
                    </button>
                </>
            );
        }

        case 'offense_pre': {
            const sbIcons = getPrePitchOffenseIcons(state);
            const canBunt = state.bases.first || state.bases.second; // can bunt if runners on, not on 3rd
            return (
                <>
                    {canBunt && !state.bases.third && (
                        <button className="action-btn warn" onClick={() => onAction({ type: 'SACRIFICE_BUNT' })}>
                            Sac Bunt
                        </button>
                    )}
                    {sbIcons.map(sb => (
                        <button key={sb.cardId} className="action-btn icon-btn" onClick={() => onAction({ type: 'STEAL_BASE', runnerId: sb.cardId, icon: true })}>
                            {sb.description}
                        </button>
                    ))}
                    <button className="action-btn primary" onClick={() => onAction({ type: 'SKIP_OFFENSE_PRE' })}>
                        Pitch!
                    </button>
                </>
            );
        }

        case 'pitch':
            return (
                <button className="action-btn primary big" onClick={() => onAction({ type: 'ROLL_PITCH', roll: rollD20() })}>
                    Roll Pitch (d20)
                </button>
            );

        case 'swing': {
            const isSacBunt = state.pendingResult?.modifiers.includes('Sacrifice bunt');
            return (
                <button className="action-btn primary big" onClick={() => {
                    if (isSacBunt) {
                        onAction({ type: 'SAC_BUNT_ROLL', roll: rollD20() });
                    } else {
                        onAction({ type: 'ROLL_SWING', roll: rollD20() });
                    }
                }}>
                    {isSacBunt ? 'Roll Bunt (d20)' : 'Roll Swing (d20)'}
                </button>
            );
        }

        case 'result_pending': {
            // Check for icon opportunities
            const offIcons = isBatting ? getOffensiveIcons(state) : [];
            const defIcons = !isBatting ? getDefensiveIcons(state) : [];
            const icons = [...offIcons, ...defIcons];

            if (icons.length > 0) {
                return (
                    <>
                        {icons.map(ic => (
                            <button key={`${ic.icon}-${ic.cardId}`} className="action-btn icon-btn" onClick={() => {
                                switch (ic.icon) {
                                    case 'V': onAction({ type: 'USE_ICON_V', cardId: ic.cardId }); break;
                                    case 'S': onAction({ type: 'USE_ICON_S', cardId: ic.cardId }); break;
                                    case 'HR': onAction({ type: 'USE_ICON_HR', cardId: ic.cardId }); break;
                                    case 'K': onAction({ type: 'USE_ICON_K' }); break;
                                    case 'G': onAction({ type: 'USE_ICON_G', cardId: ic.cardId }); break;
                                }
                            }}>
                                {ic.description}
                            </button>
                        ))}
                        <button className="action-btn" onClick={() => onAction({ type: 'DECLINE_ICON' })}>
                            No Icon
                        </button>
                    </>
                );
            }

            // No icons available — apply result
            return (
                <button className="action-btn primary" onClick={() => onAction({ type: 'DECLINE_ICON' })}>
                    Apply Result
                </button>
            );
        }

        case 'fielding_check':
            return (
                <button className="action-btn primary big" onClick={() => onAction({ type: 'FIELDING_ROLL', roll: rollD20() })}>
                    Roll Fielding (d20)
                </button>
            );

        case 'extra_base_decision': {
            const attempt = state.pendingExtraBases[0];
            if (!attempt) return null;
            const runner = battingTeam.lineup.find(p => p.cardId === attempt.runnerId);
            return (
                <>
                    <div className="action-info">
                        {runner?.card.name}: Try for {attempt.toBase}?
                    </div>
                    <button className="action-btn primary" onClick={() => {
                        onAction({ type: 'EXTRA_BASE_YES', runnerId: attempt.runnerId });
                        // Need a fielding roll after
                        setTimeout(() => onAction({ type: 'FIELDING_ROLL', roll: rollD20() }), 100);
                    }}>
                        Send Runner
                    </button>
                    <button className="action-btn" onClick={() => onAction({ type: 'EXTRA_BASE_NO', runnerId: attempt.runnerId })}>
                        Hold
                    </button>
                </>
            );
        }

        default:
            return (
                <button className="action-btn" onClick={() => onAction({ type: 'ADVANCE_ATBAT' })}>
                    Continue
                </button>
            );
    }
}
