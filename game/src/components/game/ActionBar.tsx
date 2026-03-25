import type { GameState } from '../../engine/gameEngine';
import './ActionBar.css';

interface Props {
    state: GameState;
    onRoll: (action: { type: 'ROLL_PITCH'; roll: number } | { type: 'ROLL_SWING'; roll: number }) => void;
}

function rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
}

export default function ActionBar({ state, onRoll }: Props) {
    if (state.isOver) {
        return (
            <div className="action-bar">
                <div className="game-over-msg">
                    Game Over! {state.score.away} - {state.score.home}
                </div>
            </div>
        );
    }

    return (
        <div className="action-bar">
            {state.phase === 'pitch' && (
                <button className="action-btn primary big" onClick={() => onRoll({ type: 'ROLL_PITCH', roll: rollD20() })}>
                    Roll Pitch (d20)
                </button>
            )}
            {state.phase === 'swing' && (
                <button className="action-btn primary big" onClick={() => onRoll({ type: 'ROLL_SWING', roll: rollD20() })}>
                    Roll Swing (d20)
                </button>
            )}
        </div>
    );
}
