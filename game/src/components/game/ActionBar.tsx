import type { GameState } from '../../engine/gameEngine';
import './ActionBar.css';

interface Props {
    state: GameState;
    onRoll: (action: { type: string }) => void;
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
                <button className="action-btn primary big" onClick={() => onRoll({ type: 'ROLL_PITCH' })}>
                    Roll Pitch
                </button>
            )}
            {state.phase === 'swing' && (
                <button className="action-btn primary big" onClick={() => onRoll({ type: 'ROLL_SWING' })}>
                    Roll Swing
                </button>
            )}
        </div>
    );
}
