import type { GameState, PitcherState, LineupPlayer } from '../../types/gameState';
import { getFatiguePenalty, getInningsPitchedDisplay } from '../../engine/fatigue';
import './AtBatPanel.css';

interface Props {
    state: GameState;
}

export default function AtBatPanel({ state }: Props) {
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];
    const pitcher = fieldingTeam.pitchers[fieldingTeam.currentPitcherIndex];

    if (!batter || !pitcher) return null;

    const fatigue = getFatiguePenalty(pitcher);
    const ip = getInningsPitchedDisplay(pitcher.outsRecorded);

    return (
        <div className="atbat-panel">
            {/* Pitcher */}
            <div className="atbat-card pitcher-side">
                <div className="atbat-label">Pitching</div>
                <img src={pitcher.card.imagePath} alt="" className="atbat-img" />
                <div className="atbat-name">{pitcher.card.name}</div>
                <div className="atbat-stats">
                    <span>Ctrl: {pitcher.card.control}</span>
                    <span>IP: {ip}/{pitcher.card.ip + pitcher.cyBonusIP}</span>
                    {fatigue !== 0 && <span className="fatigue">Fatigue: {fatigue}</span>}
                </div>
                {pitcher.card.icons.length > 0 && (
                    <div className="atbat-icons">
                        {pitcher.card.icons.map(icon => (
                            <span key={icon} className="icon-badge">{icon}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* VS */}
            <div className="atbat-vs">
                <span>VS</span>
                {state.pendingResult && (
                    <div className="atbat-rolls">
                        {state.pendingResult.pitchRoll > 0 && (
                            <div className="roll-display">
                                <span className="roll-label">Pitch</span>
                                <span className="roll-value">{state.pendingResult.pitchTotal}</span>
                                <span className="roll-detail">({state.pendingResult.pitchRoll} + {pitcher.card.control}{state.pendingResult.modifiers.length > 0 ? ` ${state.pendingResult.modifiers.join(', ')}` : ''})</span>
                            </div>
                        )}
                        {state.pendingResult.swingRoll > 0 && (
                            <div className="roll-display">
                                <span className="roll-label">Swing</span>
                                <span className="roll-value">{state.pendingResult.swingRoll}</span>
                            </div>
                        )}
                        {state.pendingResult.swingRoll > 0 && (
                            <div className={`outcome-display outcome-${state.pendingResult.outcome}`}>
                                {state.pendingResult.outcome === 'SPlus' ? '1B+' : state.pendingResult.outcome}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Batter */}
            <div className="atbat-card batter-side">
                <div className="atbat-label">Batting</div>
                <img src={batter.card.imagePath} alt="" className="atbat-img" />
                <div className="atbat-name">{batter.card.name}</div>
                <div className="atbat-stats">
                    <span>OB: {batter.card.onBase}</span>
                    <span>Spd: {batter.card.speed}</span>
                </div>
                {batter.card.icons.length > 0 && (
                    <div className="atbat-icons">
                        {batter.card.icons.map(icon => (
                            <span key={icon} className="icon-badge">{icon}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
