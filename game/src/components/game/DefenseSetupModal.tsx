/**
 * Defense Setup Modal — fires at every half-inning transition to defense
 * when the defending team has ≥1 player at a non-native, non-1B position.
 *
 * Thin wrapper around <AlignmentEditor>. The editor handles all of the
 * drag-drop, validity, and commit logic. This component just owns the
 * overlay chrome and the "opponent arranging defense" banner for the
 * non-active side.
 */

import type { GameState, GameAction } from '../../engine/gameEngine';
import AlignmentEditor from './AlignmentEditor';
import './DefenseSetupModal.css';

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    /** Includes the opponent-disconnected guard so Accept is disabled while
     *  the server is rejecting actions. */
    isMyTurn: boolean;
    onAction: (a: GameAction) => void;
}

export default function DefenseSetupModal({ state, myRole, isMyTurn, onAction }: Props) {
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const myDef: 'home' | 'away' = defSide === 'homeTeam' ? 'home' : 'away';
    const isMine = myRole === myDef;
    const isHomeDefense = state.halfInning === 'top';

    if (!isMine) {
        // Non-blocking banner — opponent can still browse Box Score, Log,
        // Dice Rolls, and Exit.
        return (
            <div className="dsm-opp-banner">
                <div className="dsm-wait-title">OPPONENT ARRANGING DEFENSE</div>
                <div className="dsm-wait-sub">Waiting for the opposing manager to set the field.</div>
            </div>
        );
    }

    return (
        <div className="dsm-overlay">
            <div className="dsm-panel">
                <div className="dsm-header">
                    <span className="dsm-title">ARRANGE DEFENSE</span>
                </div>
                <div className="dsm-body">
                    <AlignmentEditor
                        state={state}
                        team={state[defSide]}
                        isHomeDefense={isHomeDefense}
                        isMyTurn={isMyTurn}
                        allowCancel={false}
                        onCommit={onAction}
                    />
                </div>
            </div>
        </div>
    );
}
