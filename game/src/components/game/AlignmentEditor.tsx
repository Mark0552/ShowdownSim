/**
 * AlignmentEditor — the shared defensive-setup editor used by:
 *   - DefenseSetupModal at half-inning boundaries (forced)
 *   - SubstitutionModal's DefensiveSub tab during pre_atbat / defense_sub (optional)
 *
 * Stage-then-confirm model: drag-drop mutates LOCAL alignment state only.
 * Accept emits DEFENSE_SETUP_COMMIT atomically. Cancel / Reset don't touch
 * the server.
 *
 * Validity rule: if a fully-native arrangement is possible given the full
 * roster (lineup + bench eligible this inning), every non-1B, non-DH slot
 * must be native before Accept enables. If no native arrangement is possible,
 * Accept enables regardless — user can align however they want.
 */

import { useMemo, useState } from 'react';
import type { GameState, GameAction, PlayerSlot, TeamState } from '../../engine/gameEngine';
import { penaltyForAssignment } from '../../lib/fielding';
import './AlignmentEditor.css';

const FIELD_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'CF', 'LF-RF-2', 'DH'] as const;
type SlotKey = (typeof FIELD_SLOTS)[number];

export interface AlignmentEditorProps {
    state: GameState;
    team: TeamState;
    isHomeDefense: boolean;
    /** Disable Accept while opponent is disconnected / not the caller's turn. */
    isMyTurn: boolean;
    /** If false, the editor suppresses the Cancel button (forced mode — user must Accept). */
    allowCancel: boolean;
    onCommit: (action: GameAction) => void;
    onCancel?: () => void;
}

export default function AlignmentEditor({
    state, team, isHomeDefense, isMyTurn, allowCancel, onCommit, onCancel,
}: AlignmentEditorProps) {
    const allCards = useMemo(() => [...team.lineup, ...team.bench], [team.lineup, team.bench]);
    const byId = useMemo(() => {
        const m = new Map<string, PlayerSlot>();
        for (const p of allCards) m.set(p.cardId, p);
        return m;
    }, [allCards]);
    const origBenchIds = useMemo(() => new Set(team.bench.map(p => p.cardId)), [team.bench]);

    const initialAlignment = useMemo(() => {
        const a: { [k: string]: string } = {};
        for (const p of team.lineup) {
            if (p.assignedPosition) a[p.assignedPosition] = p.cardId;
        }
        return a;
    }, [team.lineup]);

    const [alignment, setAlignment] = useState<{ [k: string]: string }>(initialAlignment);
    const [dragCardId, setDragCardId] = useState<string | null>(null);

    const inLineupIds = useMemo(() => new Set(Object.values(alignment)), [alignment]);
    const benchCards = useMemo(() => allCards.filter(p => !inLineupIds.has(p.cardId)), [allCards, inLineupIds]);

    const canBackupEnter = state.inning >= 7 || (isHomeDefense && state.inning === 6 && state.halfInning === 'bottom');

    // Pool used to decide the forced-OOP rule: what cards could theoretically
    // be used to play natively right now? Current lineup + bench cards eligible
    // to enter given the inning. A backup who can't enter yet is excluded
    // (their native coverage doesn't count toward "arrangement is possible").
    const nativePool = useMemo(() => {
        const pool: PlayerSlot[] = [...team.lineup];
        for (const p of team.bench) {
            if (!p.isBackup || canBackupEnter) pool.push(p);
        }
        return pool;
    }, [team.lineup, team.bench, canBackupEnter]);

    const nativePossible = useMemo(() => matchValidPossible(nativePool), [nativePool]);

    // Dragged card info for visual cues on the drop target.
    const draggedCard = dragCardId ? byId.get(dragCardId) : null;

    const handleDragStart = (e: React.DragEvent, cardId: string) => {
        setDragCardId(cardId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropOnSlot = (e: React.DragEvent, targetSlot: SlotKey) => {
        e.preventDefault();
        const cardId = dragCardId || e.dataTransfer.getData('text/plain');
        if (!cardId) return;
        const srcEntry = Object.entries(alignment).find(([, id]) => id === cardId);
        const next = { ...alignment };
        if (srcEntry) {
            const [srcSlot] = srcEntry;
            if (srcSlot === targetSlot) { setDragCardId(null); return; }
            next[targetSlot] = cardId;
            next[srcSlot] = alignment[targetSlot];
        } else {
            // Bench → lineup: the card takes the slot, displacing whoever was there to the bench.
            next[targetSlot] = cardId;
        }
        setAlignment(next);
        setDragCardId(null);
    };

    const handleDropOnBench = (e: React.DragEvent) => {
        e.preventDefault();
        // Dragging to the bench is a no-op — cards come to the bench by
        // being displaced from a slot, not by direct drag-and-drop here.
        setDragCardId(null);
    };

    // Per-slot OOP penalty based on current staged alignment.
    const oopSlots = useMemo(() => {
        const bad: string[] = [];
        for (const slot of FIELD_SLOTS) {
            const norm = (slot as string).replace(/-\d+$/, '');
            if (norm === 'DH' || norm === '1B') continue;
            const cardId = alignment[slot];
            const card = cardId ? byId.get(cardId) : undefined;
            if (!card) continue;
            if (penaltyForAssignment(card.positions, slot) < 0) bad.push(slot);
        }
        return bad;
    }, [alignment, byId]);

    // Can we Accept? If a native arrangement is possible, every non-1B,
    // non-DH slot must be native. Otherwise OOP is allowed (free-for-all).
    const canAccept = useMemo(() => {
        if (!nativePossible) return true;
        return oopSlots.length === 0;
    }, [nativePossible, oopSlots]);

    // Backup-can't-enter-early check.
    const backupIssues = useMemo(() => {
        const bad: { name: string; slot: string }[] = [];
        for (const [slot, cardId] of Object.entries(alignment)) {
            if (origBenchIds.has(cardId)) {
                const card = byId.get(cardId);
                if (card?.isBackup && !canBackupEnter) {
                    bad.push({ name: card.name, slot });
                }
            }
        }
        return bad;
    }, [alignment, origBenchIds, byId, canBackupEnter]);

    const totals = useMemo(() => {
        let inf = 0, outf = 0, arm = 0;
        for (const slot of FIELD_SLOTS) {
            if (slot === 'DH') continue;
            const cardId = alignment[slot];
            const card = cardId ? byId.get(cardId) : undefined;
            if (!card) continue;
            const norm = (slot as string).replace(/-\d+$/, '');
            const raw = (norm === 'C') ? (card.arm || 0) : (card.fielding || 0);
            const pen = penaltyForAssignment(card.positions, slot);
            if (norm === 'C') arm = raw + pen;
            else if (['1B', '2B', '3B', 'SS'].includes(norm)) inf += raw + pen;
            else if (['LF-RF', 'CF'].includes(norm)) outf += raw + pen;
        }
        return { inf, outf, arm };
    }, [alignment, byId]);

    const hasChanges = useMemo(() => {
        for (const slot of FIELD_SLOTS) {
            if (alignment[slot] !== initialAlignment[slot]) return true;
        }
        return false;
    }, [alignment, initialAlignment]);

    const reset = () => setAlignment(initialAlignment);

    const commit = () => {
        if (!canAccept || backupIssues.length > 0 || !isMyTurn || !hasChanges) return;
        onCommit({ type: 'DEFENSE_SETUP_COMMIT', alignment });
    };

    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

    return (
        <div className="ae-root">
            <div className="ae-totals-bar">
                <span className="ae-tot-label">IF</span>
                <span className="ae-tot-val">{fmt(totals.inf)}</span>
                <span className="ae-tot-label">OF</span>
                <span className="ae-tot-val">{fmt(totals.outf)}</span>
                <span className="ae-tot-label">Arm</span>
                <span className="ae-tot-val">{fmt(totals.arm)}</span>
                <button className="ae-reset" onClick={reset} disabled={!hasChanges}>Reset</button>
            </div>

            <div className="ae-section-label">LINEUP — drag to swap or replace</div>
            <div className="ae-field-grid">
                {FIELD_SLOTS.map(slot => {
                    const cardId = alignment[slot];
                    const card = cardId ? byId.get(cardId) : undefined;
                    return (
                        <SlotCell
                            key={slot}
                            slot={slot}
                            card={card}
                            onDragStart={handleDragStart}
                            onDrop={(e) => handleDropOnSlot(e, slot)}
                            onDragOver={handleDragOver}
                            dropHighlight={dragCardId !== null && (!card || dragCardId !== card.cardId)}
                            dragPenalty={draggedCard && dragCardId !== cardId
                                ? penaltyForAssignment(draggedCard.positions, slot)
                                : 0}
                        />
                    );
                })}
            </div>

            <div className="ae-section-label">BENCH</div>
            <div className="ae-bench-grid" onDragOver={handleDragOver} onDrop={handleDropOnBench}>
                {benchCards.length === 0 ? (
                    <div className="ae-empty">No bench players available.</div>
                ) : (
                    benchCards.map(card => {
                        const displaced = !origBenchIds.has(card.cardId);
                        const blocked = card.isBackup && !canBackupEnter;
                        return (
                            <SlotCell
                                key={card.cardId}
                                slot={null}
                                card={card}
                                displaced={displaced}
                                blocked={blocked}
                                onDragStart={handleDragStart}
                                onDrop={() => { }}
                                onDragOver={handleDragOver}
                            />
                        );
                    })
                )}
            </div>

            <div className="ae-status">
                {!nativePossible && (
                    <div className="ae-info">No fully-native arrangement is possible with the current roster — align however you like.</div>
                )}
                {nativePossible && oopSlots.length > 0 && (
                    <div className="ae-warn">A native arrangement IS possible — every position except 1B and DH must be filled by an eligible player before you can Accept.</div>
                )}
                {backupIssues.map((msg, i) => (
                    <div key={i} className="ae-warn">
                        {msg.name}: backups cannot enter until {isHomeDefense ? 'the bottom of the 6th inning' : 'the top of the 7th inning'}.
                    </div>
                ))}
                {!isMyTurn && (
                    <div className="ae-warn">Opponent disconnected — Accept disabled until they reconnect.</div>
                )}
            </div>

            <div className="ae-actions">
                {allowCancel && onCancel && (
                    <button className="ae-cancel" onClick={onCancel}>Cancel</button>
                )}
                <button
                    className="ae-accept"
                    onClick={commit}
                    disabled={!canAccept || backupIssues.length > 0 || !isMyTurn || !hasChanges}
                    title={!hasChanges ? 'No changes to accept' : undefined}
                >
                    {isMyTurn ? 'ACCEPT DEFENSE' : 'WAITING FOR OPPONENT…'}
                </button>
            </div>
        </div>
    );
}

function SlotCell({
    slot, card, displaced, blocked,
    dropHighlight, dragPenalty = 0,
    onDragStart, onDrop, onDragOver,
}: {
    slot: SlotKey | null;
    card?: PlayerSlot;
    displaced?: boolean;
    blocked?: boolean;
    dropHighlight?: boolean;
    dragPenalty?: number;
    onDragStart: (e: React.DragEvent, cardId: string) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
}) {
    // Penalty of the currently-assigned card at this slot (for display on
    // non-drag state).
    const penalty = card && slot ? penaltyForAssignment(card.positions, slot) : 0;
    const posLabel = slot ? (slot as string).replace(/-\d+$/, '') : 'BENCH';
    // Effective fielding at the current slot, including OOP penalty. For
    // catcher, use arm + penalty; everyone else is fielding + penalty.
    const effFld = card && slot
        ? ((slot as string).replace(/-\d+$/, '') === 'C'
            ? (card.arm || 0) + penalty
            : (card.fielding || 0) + penalty)
        : 0;
    const effFldLabel = card && slot ? (effFld >= 0 ? `+${effFld}` : `${effFld}`) : '';
    const nativePositions = (card?.positions || []).map(p => p.position).join(', ') || 'DH';

    const cls = [
        'ae-cell',
        slot ? 'ae-cell-slot' : 'ae-cell-bench',
        penalty < 0 ? 'ae-cell-oop' : '',
        displaced ? 'ae-cell-displaced' : '',
        blocked ? 'ae-cell-blocked' : '',
        dropHighlight ? 'ae-cell-droptarget' : '',
        dragPenalty < 0 ? 'ae-cell-dropbad' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={cls} onDrop={onDrop} onDragOver={onDragOver}>
            <div className="ae-cell-top">
                <span className="ae-cell-slot-label">{posLabel}</span>
                {effFldLabel && <span className="ae-cell-fld">{effFldLabel}</span>}
            </div>
            {card ? (
                <div
                    className="ae-cell-card"
                    draggable
                    onDragStart={(e) => onDragStart(e, card.cardId)}
                >
                    {card.imagePath && <img src={card.imagePath} alt="" className="ae-cell-img" draggable={false} />}
                </div>
            ) : (
                <div className="ae-cell-empty">empty</div>
            )}
            <div className="ae-cell-bottom">
                {card && <div className="ae-cell-name" title={card.name}>{card.name}</div>}
                {card && <div className="ae-cell-nat">eligible: {nativePositions}</div>}
                {slot && penalty < 0 && <div className="ae-cell-pen">OOP {penalty}</div>}
                {displaced && <div className="ae-cell-sub">SUB OUT</div>}
                {blocked && <div className="ae-cell-block">BACKUP — TOO EARLY</div>}
            </div>
        </div>
    );
}

// Client mirror of server/engine/defense.js::validPossible.
// Given an array of cards, returns true iff 7 of them can cover the 7
// native-required fielding slots (C, 2B, 3B, SS, LF-RF-1, LF-RF-2, CF).
function matchValidPossible(cards: PlayerSlot[]): boolean {
    const NATIVE_SLOTS = ['C', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF'];
    if (cards.length < NATIVE_SLOTS.length) return false;
    const match = new Array<number>(NATIVE_SLOTS.length).fill(-1);
    const canPlay = (card: PlayerSlot, slot: string) => {
        const norm = slot.replace(/-\d+$/, '');
        const positions = card.positions || [];
        if (norm === 'LF-RF') {
            return positions.some(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF');
        }
        return positions.some(p => p.position === norm);
    };
    const augment = (s: number, visited: boolean[]): boolean => {
        for (let c = 0; c < cards.length; c++) {
            if (visited[c]) continue;
            if (!canPlay(cards[c], NATIVE_SLOTS[s])) continue;
            visited[c] = true;
            const cur = match.indexOf(c);
            if (cur === -1 || augment(cur, visited)) { match[s] = c; return true; }
        }
        return false;
    };
    for (let s = 0; s < NATIVE_SLOTS.length; s++) {
        const visited = new Array<boolean>(cards.length).fill(false);
        if (!augment(s, visited)) return false;
    }
    return true;
}
