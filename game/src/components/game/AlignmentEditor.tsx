/**
 * AlignmentEditor — the shared defensive-setup editor used by:
 *   - DefenseSetupModal at half-inning boundaries (forced)
 *   - SubstitutionModal's DefensiveSub tab during pre_atbat / defense_sub (optional)
 *
 * Stage-then-confirm model: tap-to-select mutates LOCAL alignment state only.
 * Accept emits DEFENSE_SETUP_COMMIT atomically. Cancel / Reset don't touch
 * the server.
 *
 * Interaction (tap-to-select, replaces the older HTML5 drag-and-drop):
 *   1. Tap any card to pick it. Picked card gets a gold ring.
 *   2. Tap a different card → swap. Tap a slot's card → swap. Tap a bench
 *      card → swap (slot card and bench card trade places).
 *   3. Tap the same card again to deselect.
 *   4. Tap outside any cell (totals bar, empty space) to deselect.
 *
 * HTML5 DnD was abandoned because it's flaky on iOS Safari (the long-press-
 * to-drag activation often fails or fires the OS text-selection menu
 * instead of the drag preview).
 *
 * Validity rule: if a fully-native arrangement is possible given the full
 * roster (lineup + bench eligible this inning), every non-1B, non-DH slot
 * must be native before Accept enables. If no native arrangement is possible,
 * Accept enables regardless — user can align however they want.
 */

import { useMemo, useRef, useState } from 'react';
import type { GameState, GameAction, PlayerSlot, TeamState } from '../../engine/gameEngine';
import { penaltyForAssignment, rawFieldingForAssignment } from '../../lib/fielding';
import { playerSlotToCard } from '../cards/cardAdapters';
import CardTooltip from '../cards/CardTooltip';
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
    /** Currently picked card. Tap a card to pick it (gold ring); tap a
     *  cell to place it; tap the same card again to deselect. */
    const [pickedCardId, setPickedCardId] = useState<string | null>(null);

    // Hover tooltip — delayed show, hidden while a card is picked. Same
    // pattern the team builder's catalog / lineup / roster / bench panels
    // use. Hover doesn't fire on touch devices (iOS Safari skips it for
    // taps), so this is desktop-only inspection — touch users see card
    // detail by tapping (which picks the card; the picked-card visual
    // serves as confirmation of which card they grabbed).
    const [hoverCardId, setHoverCardId] = useState<string | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelHover = () => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    };
    const queueHover = (cardId: string | null) => {
        cancelHover();
        if (!cardId) { setHoverCardId(null); return; }
        hoverTimerRef.current = setTimeout(() => setHoverCardId(cardId), 400);
    };
    const hoveredPlayer = hoverCardId ? byId.get(hoverCardId) : undefined;
    const hoveredCard = hoveredPlayer ? playerSlotToCard(hoveredPlayer) : null;

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

    const pickedCard = pickedCardId ? byId.get(pickedCardId) : null;

    // Click a cell. If nothing is picked, pick this cell's card. If
    // something IS picked, treat the click as a placement: swap the picked
    // card with the cell's card (or fill the empty slot, if any).
    const handleCellClick = (slot: SlotKey | null, cellCardId: string | undefined) => {
        // Tooltip suppression — any cell click cancels a pending hover.
        cancelHover();
        setHoverCardId(null);

        if (pickedCardId === null) {
            // Nothing picked yet. Pick the card in this cell, if any.
            if (cellCardId) setPickedCardId(cellCardId);
            return;
        }

        // Tap the same card to deselect.
        if (cellCardId === pickedCardId) {
            setPickedCardId(null);
            return;
        }

        // Place picked card in this cell.
        const next = { ...alignment };
        const srcEntry = Object.entries(alignment).find(([, id]) => id === pickedCardId);
        const srcSlot = srcEntry?.[0];
        const targetCardId = slot ? alignment[slot] : cellCardId;

        if (slot) {
            // Target is a lineup slot. Picked card lands here; whoever was
            // in this slot trades places with picked (going to picked's
            // src slot, or to the bench if picked came from the bench).
            next[slot] = pickedCardId;
            if (srcSlot) {
                if (targetCardId !== undefined) next[srcSlot] = targetCardId;
                else delete next[srcSlot]; // edge case: empty src would normally never happen
            }
            // (If srcSlot is undefined — picked came from bench — the
            // displaced card just falls off alignment and ends up on
            // bench via the `benchCards` derivation.)
        } else {
            // Target is a bench card. Only meaningful if picked is in a
            // slot — picked moves to bench (by losing its slot entry) and
            // the bench card moves into picked's old slot.
            if (!cellCardId) { setPickedCardId(null); return; }
            if (!srcSlot) {
                // Both picked and target are on bench — no swap to make.
                // Treat as "switch which card is picked" so a sequence of
                // bench taps still picks something useful.
                setPickedCardId(cellCardId);
                return;
            }
            next[srcSlot] = cellCardId;
            // pickedCardId is no longer in any slot, ends up on bench.
        }
        setAlignment(next);
        setPickedCardId(null);
    };

    /** Click outside any cell (root container, headline, totals bar) to
     *  cancel an active pick. Cells stop propagation so their clicks
     *  don't bubble up here. */
    const handleRootClick = () => {
        if (pickedCardId !== null) setPickedCardId(null);
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
            // Raw value at the staged slot (NOT the player's current live slot).
            // Using card.fielding/card.arm here would have shown 0 whenever a
            // player was newly moved into a position they could play natively.
            const raw = rawFieldingForAssignment(card.positions, slot);
            const pen = penaltyForAssignment(card.positions, slot);
            const norm = (slot as string).replace(/-\d+$/, '');
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

    const reset = () => {
        setAlignment(initialAlignment);
        setPickedCardId(null);
    };

    // When a native arrangement IS possible we gate on hasChanges so the
    // user can't Accept a no-op that leaves an OOP in place. When no native
    // arrangement is possible (the forced / free-for-all case), the current
    // alignment is already a legal "do nothing" — user should be able to
    // Accept immediately without having to drag anything.
    const requiresChange = nativePossible;
    const commit = () => {
        if (!canAccept || backupIssues.length > 0 || !isMyTurn) return;
        if (requiresChange && !hasChanges) return;
        onCommit({ type: 'DEFENSE_SETUP_COMMIT', alignment });
    };

    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

    // Headline status — biggest message at the top so the user knows
    // immediately whether they MUST fix something or have free rein.
    const headlineStatus = !nativePossible
        ? { kind: 'info' as const, text: 'No native arrangement possible — align however you want.' }
        : oopSlots.length > 0
            ? { kind: 'warn' as const, text: 'You must play a fully native arrangement. Fix the highlighted positions before accepting.' }
            : null;

    return (
        <div className="ae-root" onClick={handleRootClick}>
            {headlineStatus && (
                <div className={`ae-headline ae-headline-${headlineStatus.kind}`}>
                    {headlineStatus.text}
                </div>
            )}

            <div className="ae-totals-bar">
                <span className="ae-tot-label">IF</span>
                <span className="ae-tot-val">{fmt(totals.inf)}</span>
                <span className="ae-tot-label">OF</span>
                <span className="ae-tot-val">{fmt(totals.outf)}</span>
                <span className="ae-tot-label">Arm</span>
                <span className="ae-tot-val">{fmt(totals.arm)}</span>
                <button
                    className="ae-reset"
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    disabled={!hasChanges}
                >Reset</button>
            </div>

            <div className="ae-section-label">
                LINEUP — {pickedCardId ? 'tap a slot to place' : 'tap a card to pick'}
            </div>
            <div className="ae-field-grid">
                {FIELD_SLOTS.map(slot => {
                    const cardId = alignment[slot];
                    const card = cardId ? byId.get(cardId) : undefined;
                    return (
                        <SlotCell
                            key={slot}
                            slot={slot}
                            card={card}
                            isPicked={!!card && card.cardId === pickedCardId}
                            onClick={() => handleCellClick(slot, cardId)}
                            onMouseEnter={(id) => !pickedCardId && queueHover(id)}
                            onMouseLeave={() => queueHover(null)}
                            dropHighlight={pickedCardId !== null && pickedCardId !== cardId}
                            dragPenalty={pickedCard && pickedCardId !== cardId
                                ? penaltyForAssignment(pickedCard.positions, slot)
                                : 0}
                        />
                    );
                })}
            </div>

            <div className="ae-section-label">BENCH</div>
            <div className="ae-bench-grid">
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
                                isPicked={card.cardId === pickedCardId}
                                onClick={() => handleCellClick(null, card.cardId)}
                                onMouseEnter={(id) => !pickedCardId && queueHover(id)}
                                onMouseLeave={() => queueHover(null)}
                                dropHighlight={pickedCardId !== null && pickedCardId !== card.cardId}
                            />
                        );
                    })
                )}
            </div>

            {hoveredCard && !pickedCardId && <CardTooltip card={hoveredCard} />}

            <div className="ae-status">
                {backupIssues.map((msg, i) => (
                    <div key={i} className="ae-warn">
                        {msg.name}: backups cannot enter until {isHomeDefense ? 'the bottom of the 6th inning' : 'the top of the 7th inning'}.
                    </div>
                ))}
                {!isMyTurn && (
                    <div className="ae-warn">Opponent disconnected — Accept disabled until they reconnect.</div>
                )}
            </div>

            <div className="ae-actions" onClick={(e) => e.stopPropagation()}>
                {allowCancel && onCancel && (
                    <button className="ae-cancel" onClick={onCancel}>Cancel</button>
                )}
                <button
                    className="ae-accept"
                    onClick={commit}
                    disabled={!canAccept || backupIssues.length > 0 || !isMyTurn || (requiresChange && !hasChanges)}
                    title={requiresChange && !hasChanges ? 'Fix the OOP slots before accepting' : undefined}
                >
                    {isMyTurn ? 'ACCEPT DEFENSE' : 'WAITING FOR OPPONENT…'}
                </button>
            </div>
        </div>
    );
}

function SlotCell({
    slot, card, displaced, blocked, isPicked,
    dropHighlight, dragPenalty = 0,
    onClick, onMouseEnter, onMouseLeave,
}: {
    slot: SlotKey | null;
    card?: PlayerSlot;
    displaced?: boolean;
    blocked?: boolean;
    isPicked?: boolean;
    dropHighlight?: boolean;
    dragPenalty?: number;
    onClick: () => void;
    onMouseEnter?: (cardId: string) => void;
    onMouseLeave?: () => void;
}) {
    // Penalty + raw fielding at the staged slot (NOT card.fielding/card.arm,
    // which carry the player's live slot's effective values and would read 0
    // for any newly-moved player). Effective = raw + penalty.
    const penalty = card && slot ? penaltyForAssignment(card.positions, slot) : 0;
    const posLabel = slot ? (slot as string).replace(/-\d+$/, '') : 'BENCH';
    const rawFld = card && slot ? rawFieldingForAssignment(card.positions, slot) : 0;
    const effFld = card && slot ? rawFld + penalty : 0;
    const effFldLabel = card && slot ? (effFld >= 0 ? `+${effFld}` : `${effFld}`) : '';
    const nativePositions = (card?.positions || []).map(p => p.position).join(', ') || 'DH';

    const cls = [
        'ae-cell',
        slot ? 'ae-cell-slot' : 'ae-cell-bench',
        penalty < 0 ? 'ae-cell-oop' : '',
        displaced ? 'ae-cell-displaced' : '',
        blocked ? 'ae-cell-blocked' : '',
        isPicked ? 'ae-cell-picked' : '',
        dropHighlight && !isPicked ? 'ae-cell-droptarget' : '',
        dragPenalty < 0 && !isPicked ? 'ae-cell-dropbad' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cls}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onMouseEnter={() => card && onMouseEnter?.(card.cardId)}
            onMouseLeave={() => onMouseLeave?.()}
        >
            <div className="ae-cell-top">
                <span className="ae-cell-slot-label">{posLabel}</span>
                {effFldLabel && <span className="ae-cell-fld">{effFldLabel}</span>}
            </div>
            {card ? (
                <div className="ae-cell-card">
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
