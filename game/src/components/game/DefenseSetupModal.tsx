/**
 * Defense Setup Modal — fires at every half-inning transition to defense
 * when the defending team has ≥1 player at a non-native, non-1B position.
 * Drag-drop UI to rearrange positions and/or bring bench players in.
 *
 * Accept is gated on validPossible: if a fully-native arrangement exists
 * (bipartite matching), every non-1B, non-DH position must be native.
 * Otherwise, accept allows penalties.
 *
 * Opponent sees a "Opponent arranging defense..." notice and can still
 * browse box score / log / dice rolls / exit (those panels are outside
 * the modal overlay and the modal only blocks interactions when open
 * for the active side).
 */

import { useState, useMemo } from 'react';
import type { GameState, GameAction, PlayerSlot, TeamState } from '../../engine/gameEngine';
import { penaltyForAssignment } from '../../lib/fielding';
import './DefenseSetupModal.css';

const FIELD_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'CF', 'LF-RF-2', 'DH'] as const;
type SlotKey = (typeof FIELD_SLOTS)[number];

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    /** Matches GamePage's isMyTurn — includes the opponent-disconnected
     *  guard so we disable Accept while the server is rejecting actions. */
    isMyTurn: boolean;
    onAction: (a: GameAction) => void;
}

export default function DefenseSetupModal({ state, myRole, isMyTurn, onAction }: Props) {
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const myDef: 'home' | 'away' = defSide === 'homeTeam' ? 'home' : 'away';
    const team: TeamState = state[defSide];
    const isMine = myRole === myDef;

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

    const handleDragStart = (e: React.DragEvent, cardId: string) => {
        setDragCardId(cardId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropOnSlot = (e: React.DragEvent, targetSlot: string) => {
        e.preventDefault();
        const cardId = dragCardId || e.dataTransfer.getData('text/plain');
        if (!cardId) return;
        const srcEntry = Object.entries(alignment).find(([, id]) => id === cardId);
        const next = { ...alignment };
        if (srcEntry) {
            const [srcSlot] = srcEntry;
            if (srcSlot === targetSlot) { setDragCardId(null); return; }
            // Swap positions
            next[targetSlot] = cardId;
            next[srcSlot] = alignment[targetSlot];
        } else {
            // Source is bench → bench card takes slot, displace old lineup card to bench
            next[targetSlot] = cardId;
        }
        setAlignment(next);
        setDragCardId(null);
    };

    const handleDropOnBench = (e: React.DragEvent) => {
        e.preventDefault();
        // Lineup cards can't be moved directly to bench — they must be displaced
        // via a bench-to-lineup swap. No-op here.
        setDragCardId(null);
    };

    const totals = useMemo(() => {
        let inf = 0, outf = 0, arm = 0;
        for (const slot of FIELD_SLOTS) {
            if (slot === 'DH') continue;
            const cardId = alignment[slot];
            if (!cardId) continue;
            const card = byId.get(cardId);
            if (!card) continue;
            const norm = slot.replace(/-\d+$/, '');
            const raw = (norm === 'C') ? (card.arm || 0) : (card.fielding || 0);
            const pen = penaltyForAssignment(card.positions, slot);
            if (norm === 'C') arm = raw + pen;
            else if (['1B', '2B', '3B', 'SS'].includes(norm)) inf += raw + pen;
            else if (['LF-RF', 'CF'].includes(norm)) outf += raw + pen;
        }
        return { inf, outf, arm };
    }, [alignment, byId]);

    const nineCards = useMemo(
        () => FIELD_SLOTS.map(s => byId.get(alignment[s])!).filter(Boolean) as PlayerSlot[],
        [alignment, byId]
    );
    const validPossible = useMemo(() => matchValidPossible(nineCards), [nineCards]);

    const canAccept = useMemo(() => {
        if (!validPossible) return true;
        for (const slot of FIELD_SLOTS) {
            const norm = slot.replace(/-\d+$/, '');
            if (norm === 'DH' || norm === '1B') continue;
            const cardId = alignment[slot];
            const card = byId.get(cardId);
            if (!card) return false;
            const pen = penaltyForAssignment(card.positions, slot);
            if (pen < 0) return false;
        }
        return true;
    }, [validPossible, alignment, byId]);

    const isHomeDef = state.halfInning === 'top';
    const canBackup = state.inning >= 7 || (isHomeDef && state.inning === 6 && state.halfInning === 'bottom');
    const backupIssues = useMemo(() => {
        const bad: string[] = [];
        for (const cardId of Object.values(alignment)) {
            if (origBenchIds.has(cardId)) {
                const card = byId.get(cardId);
                if (card?.isBackup && !canBackup) {
                    bad.push(`${card.name}: backups cannot enter until ${isHomeDef ? 'bottom of the 6th' : 'top of the 7th'}`);
                }
            }
        }
        return bad;
    }, [alignment, origBenchIds, byId, canBackup, isHomeDef]);

    const submit = () => {
        if (!canAccept || backupIssues.length > 0 || !isMyTurn) return;
        onAction({ type: 'DEFENSE_SETUP_COMMIT', alignment });
    };

    const reset = () => setAlignment(initialAlignment);

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

    const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

    return (
        <div className="dsm-overlay">
            <div className="dsm-panel">
                <div className="dsm-header">
                    <span className="dsm-title">ARRANGE DEFENSE</span>
                    <span className="dsm-totals">
                        <span className="dsm-tot-label">IF</span> <span className="dsm-stat">{fmt(totals.inf)}</span>
                        <span className="dsm-tot-label">OF</span> <span className="dsm-stat">{fmt(totals.outf)}</span>
                        <span className="dsm-tot-label">Arm</span> <span className="dsm-stat">{fmt(totals.arm)}</span>
                    </span>
                    <button className="dsm-reset" onClick={reset}>Reset</button>
                </div>

                <div className="dsm-body">
                    <div className="dsm-section-title">LINEUP — drag to swap or replace</div>
                    <div className="dsm-field-grid">
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
                                />
                            );
                        })}
                    </div>

                    <div className="dsm-section-title">BENCH</div>
                    <div className="dsm-bench-grid" onDragOver={handleDragOver} onDrop={handleDropOnBench}>
                        {benchCards.length === 0 ? (
                            <div className="dsm-empty">No bench players available.</div>
                        ) : (
                            benchCards.map(card => (
                                <SlotCell
                                    key={card.cardId}
                                    slot={null}
                                    card={card}
                                    displaced={!origBenchIds.has(card.cardId)}
                                    onDragStart={handleDragStart}
                                    onDrop={() => {}}
                                    onDragOver={handleDragOver}
                                />
                            ))
                        )}
                    </div>

                    <div className="dsm-status">
                        {!validPossible && (
                            <div className="dsm-warn">No fully-native arrangement available — penalties allowed.</div>
                        )}
                        {validPossible && !canAccept && (
                            <div className="dsm-warn">A valid native arrangement exists — fix OOP positions to continue.</div>
                        )}
                        {backupIssues.map((msg, i) => <div key={i} className="dsm-warn">{msg}</div>)}
                        {!isMyTurn && (
                            <div className="dsm-warn">Opponent disconnected — Accept disabled until they reconnect.</div>
                        )}
                    </div>

                    <button
                        className="dsm-accept"
                        onClick={submit}
                        disabled={!canAccept || backupIssues.length > 0 || !isMyTurn}
                    >
                        {isMyTurn ? 'ACCEPT & CONTINUE' : 'WAITING FOR OPPONENT…'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SlotCell({
    slot, card, displaced, onDragStart, onDrop, onDragOver,
}: {
    slot: SlotKey | null;
    card?: PlayerSlot;
    displaced?: boolean;
    onDragStart: (e: React.DragEvent, cardId: string) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
}) {
    const penalty = card && slot ? penaltyForAssignment(card.positions, slot) : 0;
    const posLabel = slot ? slot.replace(/-\d+$/, '') : '';
    const nativePositions = (card?.positions || []).map(p => p.position).join('/') || 'DH';
    const cls = [
        'dsm-slot',
        penalty < 0 ? 'dsm-slot-bad' : '',
        displaced ? 'dsm-slot-displaced' : '',
    ].filter(Boolean).join(' ');
    return (
        <div className={cls} onDrop={onDrop} onDragOver={onDragOver}>
            {slot && <div className="dsm-slot-label">{posLabel}</div>}
            {card ? (
                <div
                    className="dsm-card"
                    draggable
                    onDragStart={(e) => onDragStart(e, card.cardId)}
                >
                    {card.imagePath && <img src={card.imagePath} alt="" className="dsm-card-img" draggable={false} />}
                    <div className="dsm-card-name" title={card.name}>{card.name}</div>
                    <div className="dsm-card-nat">{nativePositions}</div>
                    {slot && penalty < 0 && <div className="dsm-card-pen">OOP {penalty}</div>}
                    {displaced && <div className="dsm-card-sub">SUB OUT</div>}
                </div>
            ) : (
                <div className="dsm-empty-slot">empty</div>
            )}
        </div>
    );
}

// Client mirror of server/engine/defense.js::validPossible
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
