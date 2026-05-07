/**
 * Defense Setup Modal — fires at every half-inning transition to defense
 * when the defending team has ≥1 player at a non-native, non-1B position.
 *
 * Thin wrapper around <AlignmentEditor>. The editor handles all of the
 * tap-to-select, validity, and commit logic. This component just owns the
 * overlay chrome and the "opponent arranging defense" banner for the
 * non-active side.
 *
 * The active-side variant uses the shared <ModalFrame> for visual
 * consistency with SubstitutionModal and BullpenPanel. closeOnBackdrop is
 * false because Accept is forced — the user must commit a valid alignment.
 *
 * The opponent-waiting variant keeps its own simpler card chrome since
 * it's a status overlay (no scrollable body, no actions) rather than a
 * modal proper.
 */

import type { GameState, GameAction } from '../../engine/gameEngine';
import AlignmentEditor from './AlignmentEditor';
import ModalFrame from './ModalFrame';
import './DefenseSetupModal.css';

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    /** Includes the opponent-disconnected guard so Accept is disabled while
     *  the server is rejecting actions. */
    isMyTurn: boolean;
    onAction: (a: GameAction) => void;
    /** Info-panel toggles so the user (either side) can open Box Score,
     *  Game Log, or Dice Rolls without leaving the modal. */
    onToggleBoxScore?: () => void;
    onToggleLog?: () => void;
    onToggleDiceRolls?: () => void;
    /** Exit to the lobby. Available to both sides. */
    onExit?: () => void;
}

function InfoToolbar({ onToggleBoxScore, onToggleLog, onToggleDiceRolls, onExit }: Pick<Props, 'onToggleBoxScore' | 'onToggleLog' | 'onToggleDiceRolls' | 'onExit'>) {
    return (
        <div className="dsm-toolbar">
            {onToggleBoxScore && (
                <button className="dsm-tool-btn" onClick={onToggleBoxScore}>BOX SCORE</button>
            )}
            {onToggleLog && (
                <button className="dsm-tool-btn" onClick={onToggleLog}>GAME LOG</button>
            )}
            {onToggleDiceRolls && (
                <button className="dsm-tool-btn" onClick={onToggleDiceRolls}>DICE ROLLS</button>
            )}
            {onExit && (
                <button className="dsm-tool-btn dsm-exit-btn" onClick={onExit}>EXIT GAME</button>
            )}
        </div>
    );
}

export default function DefenseSetupModal({
    state, myRole, isMyTurn, onAction,
    onToggleBoxScore, onToggleLog, onToggleDiceRolls, onExit,
}: Props) {
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const myDef: 'home' | 'away' = defSide === 'homeTeam' ? 'home' : 'away';
    const isMine = myRole === myDef;
    const isHomeDefense = state.halfInning === 'top';

    if (!isMine) {
        // Opponent overlay blocks game ACTIONS but not info. They can open
        // Box Score / Log / Dice, or exit the game entirely while waiting.
        // Keeps its own simpler chrome — it's not really a modal, just a
        // centered status card.
        return (
            <div className="dsm-overlay dsm-opp">
                <div className="dsm-opp-card">
                    <div className="dsm-wait-title">OPPONENT ARRANGING DEFENSE</div>
                    <div className="dsm-wait-sub">Waiting for the opposing manager to set the field.</div>
                    <InfoToolbar
                        onToggleBoxScore={onToggleBoxScore}
                        onToggleLog={onToggleLog}
                        onToggleDiceRolls={onToggleDiceRolls}
                        onExit={onExit}
                    />
                </div>
            </div>
        );
    }

    const headerExtra = (
        <InfoToolbar
            onToggleBoxScore={onToggleBoxScore}
            onToggleLog={onToggleLog}
            onToggleDiceRolls={onToggleDiceRolls}
            onExit={onExit}
        />
    );

    return (
        <ModalFrame
            title="ARRANGE DEFENSE"
            headerExtra={headerExtra}
            closeOnBackdrop={false}
            panelClassName="dsm-panel-wide"
        >
            <AlignmentEditor
                state={state}
                team={state[defSide]}
                isHomeDefense={isHomeDefense}
                isMyTurn={isMyTurn}
                allowCancel={false}
                onCommit={onAction}
            />
        </ModalFrame>
    );
}
