import type { GameState, getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
import { getCurrentBatter as getBatter, getCurrentPitcher as getPitcher } from '../../engine/gameEngine';
import './AtBatPanel.css';

interface Props {
    state: GameState;
}

export default function AtBatPanel({ state }: Props) {
    const batter = getBatter(state);
    const pitcher = getPitcher(state);

    if (!batter || !pitcher) return null;

    const outcomeNames: Record<string, string> = {
        SO: 'Strikeout', GB: 'Ground Ball Out', FB: 'Fly Ball Out', PU: 'Popup Out',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double', TR: 'Triple', HR: 'HOME RUN',
    };

    return (
        <div className="atbat-panel">
            <div className="atbat-card pitcher-side">
                <div className="atbat-label">Pitching</div>
                <img src={pitcher.imagePath} alt="" className="atbat-img" />
                <div className="atbat-name">{pitcher.name}</div>
                <div className="atbat-stats">
                    <span>Ctrl: {pitcher.control || 0}</span>
                </div>
            </div>

            <div className="atbat-vs">
                <span>VS</span>
                {state.lastPitchRoll > 0 && (
                    <div className="atbat-rolls">
                        <div className="roll-display">
                            <span className="roll-label">Pitch</span>
                            <span className="roll-value">{state.lastPitchTotal}</span>
                            <span className="roll-detail">
                                ({state.lastPitchRoll} + {pitcher.control || 0})
                                {state.usedPitcherChart ? ' → Pitcher chart' : ' → Batter chart'}
                            </span>
                        </div>
                        {state.lastSwingRoll > 0 && (
                            <>
                                <div className="roll-display">
                                    <span className="roll-label">Swing</span>
                                    <span className="roll-value">{state.lastSwingRoll}</span>
                                </div>
                                {state.lastOutcome && (
                                    <div className={`outcome-display outcome-${state.lastOutcome}`}>
                                        {outcomeNames[state.lastOutcome] || state.lastOutcome}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="atbat-card batter-side">
                <div className="atbat-label">Batting</div>
                <img src={batter.imagePath} alt="" className="atbat-img" />
                <div className="atbat-name">{batter.name}</div>
                <div className="atbat-stats">
                    <span>OB: {batter.onBase}</span>
                    <span>Spd: {batter.speed}</span>
                </div>
            </div>
        </div>
    );
}
