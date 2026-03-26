import type { GameState, PlayerSlot } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
import './Diamond.css';

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    isMyTurn: boolean;
    onRoll: (action: { type: string }) => void;
}

export default function Diamond({ state, myRole, isMyTurn, onRoll }: Props) {
    const batter = getCurrentBatter(state);
    const pitcher = getCurrentPitcher(state);
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;

    // Am I batting? If so, home plate is at bottom. If opponent bats, home plate at top.
    const iAmBatting = (state.halfInning === 'top' && myRole === 'away') ||
                       (state.halfInning === 'bottom' && myRole === 'home');

    const getRunner = (baseKey: 'first' | 'second' | 'third'): PlayerSlot | null => {
        const cardId = state.bases[baseKey];
        if (!cardId) return null;
        return battingTeam.lineup.find(p => p.cardId === cardId) || null;
    };

    const runner1st = getRunner('first');
    const runner2nd = getRunner('second');
    const runner3rd = getRunner('third');

    const outcomeNames: Record<string, string> = {
        SO: 'Strikeout', GB: 'Ground Out', FB: 'Fly Out', PU: 'Popup',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double', TR: 'Triple', HR: 'HOME RUN',
    };

    const outcomeClass = state.lastOutcome
        ? (['SO','GB','FB','PU'].includes(state.lastOutcome) ? 'out' : state.lastOutcome === 'HR' ? 'hr' : 'hit')
        : '';

    return (
        <div className={`diamond-board ${iAmBatting ? 'i-bat' : 'opp-bats'}`}>
            {/* Grass background */}
            <div className="diamond-grass">
                {/* Diamond shape */}
                <div className="diamond-infield">
                    {/* Second base */}
                    <div className="base base-2nd">
                        {runner2nd ? (
                            <img src={runner2nd.imagePath} alt={runner2nd.name} className="base-card" />
                        ) : (
                            <div className="base-empty" />
                        )}
                    </div>

                    {/* Third base */}
                    <div className="base base-3rd">
                        {runner3rd ? (
                            <img src={runner3rd.imagePath} alt={runner3rd.name} className="base-card" />
                        ) : (
                            <div className="base-empty" />
                        )}
                    </div>

                    {/* First base */}
                    <div className="base base-1st">
                        {runner1st ? (
                            <img src={runner1st.imagePath} alt={runner1st.name} className="base-card" />
                        ) : (
                            <div className="base-empty" />
                        )}
                    </div>

                    {/* Pitcher on mound */}
                    <div className="mound">
                        <img src={pitcher.imagePath} alt={pitcher.name} className="mound-card" />
                        <span className="mound-name">{pitcher.name}</span>
                    </div>

                    {/* Home plate with batter */}
                    <div className="base base-home">
                        <img src={batter.imagePath} alt={batter.name} className="home-card" />
                        <span className="home-name">{batter.name}</span>
                    </div>

                    {/* Base paths */}
                    <div className="base-path path-home-1st" />
                    <div className="base-path path-1st-2nd" />
                    <div className="base-path path-2nd-3rd" />
                    <div className="base-path path-3rd-home" />
                </div>
            </div>

            {/* Outs */}
            <div className="diamond-outs">
                {[0, 1, 2].map(i => (
                    <div key={i} className={`out-dot ${i < state.outs ? 'active' : ''}`} />
                ))}
                <span>{state.outs} out{state.outs !== 1 ? 's' : ''}</span>
            </div>

            {/* Roll result overlay */}
            {state.lastOutcome && (
                <div className={`roll-result ${outcomeClass}`}>
                    {outcomeNames[state.lastOutcome] || state.lastOutcome}
                </div>
            )}

            {/* Pitch info */}
            {state.lastPitchRoll > 0 && (
                <div className="pitch-info">
                    <span>Pitch: {state.lastPitchRoll}+{pitcher.control || 0}={state.lastPitchTotal}</span>
                    <span>vs OB {batter.onBase}</span>
                    <span>{state.usedPitcherChart ? '→ Pitcher chart' : '→ Batter chart'}</span>
                    {state.lastSwingRoll > 0 && <span>Swing: {state.lastSwingRoll}</span>}
                </div>
            )}

            {/* Action button */}
            {isMyTurn && !state.isOver && (
                <div className="diamond-action">
                    {state.phase === 'pitch' && (
                        <button className="roll-btn" onClick={() => onRoll({ type: 'ROLL_PITCH' })}>
                            Roll Pitch
                        </button>
                    )}
                    {state.phase === 'swing' && (
                        <button className="roll-btn" onClick={() => onRoll({ type: 'ROLL_SWING' })}>
                            Roll Swing
                        </button>
                    )}
                </div>
            )}

            {!isMyTurn && !state.isOver && (
                <div className="diamond-action">
                    <span className="waiting-text">Waiting for opponent...</span>
                </div>
            )}

            {state.isOver && (
                <div className="diamond-action">
                    <span className="game-over-text">Game Over! {state.score.away} - {state.score.home}</span>
                </div>
            )}
        </div>
    );
}
