/**
 * Substitution Modal — Phase 3 of substitution refactor.
 *
 * Single modal that handles all five substitution types: pinch hit, pinch run,
 * pitching change, defensive sub, double switch. Replaces the per-type SVG
 * action buttons with a unified panel. Shows live fielding-penalty preview
 * and validates eligibility before submission.
 *
 * Only opens during pre_atbat / defense_sub (rule: no subs after pitch roll).
 */

import { useState, useMemo, useEffect } from 'react';
import type { GameState, GameAction, PlayerSlot, TeamState } from '../../engine/gameEngine';
import type { Card } from '../../types/cards';
import { fieldingPenalty } from '../../lib/fielding';
import { loadCards } from '../../data/cardData';
import CardTooltip from '../cards/CardTooltip';
import './SubstitutionModal.css';

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    onAction: (action: GameAction) => void;
    onClose: () => void;
}

type SubTab = 'PH' | 'PR' | 'PC' | 'DS';

interface TabDef {
    key: SubTab;
    label: string;
    phases: GameState['phase'][];
    /** Tooltip shown when this tab is disabled (i.e., not allowed in current phase). */
    unavailableReason: string;
}
const ALL_TABS: TabDef[] = [
    { key: 'PH', label: 'Pinch Hit', phases: ['pre_atbat'],
        unavailableReason: 'Pinch hits are made by the offense before the pitcher rolls.' },
    { key: 'PR', label: 'Pinch Run', phases: ['pre_atbat'],
        unavailableReason: 'Pinch running is done by the offense before the pitcher rolls.' },
    { key: 'PC', label: 'Pitching Change', phases: ['defense_sub'],
        unavailableReason: 'Pitching changes are made by the defense before the pitcher rolls.' },
    { key: 'DS', label: 'Defensive Sub', phases: ['pre_atbat', 'defense_sub'],
        unavailableReason: 'Defensive substitutions are made before the pitcher rolls.' },
];

function renderPenalty(penalty: number, valid: boolean): { text: string; cls: string } {
    if (!valid) return { text: 'INVALID', cls: 'sm-pen-invalid' };
    if (penalty === 0) return { text: '0', cls: 'sm-pen-good' };
    return { text: `${penalty}`, cls: penalty <= -2 ? 'sm-pen-bad' : 'sm-pen-warn' };
}

function asCard(p: PlayerSlot) {
    // The fieldingPenalty function expects a Card-shape; PlayerSlot has the same
    // type/positions fields we need. Cast through unknown to satisfy the compiler.
    return p as unknown as Parameters<typeof fieldingPenalty>[0];
}

export default function SubstitutionModal({ state, myRole, onAction, onClose }: Props) {
    const myTeam: TeamState = myRole === 'home' ? state.homeTeam : state.awayTeam;
    const phase = state.phase;
    const isTabAvailable = (t: TabDef) => t.phases.includes(phase);
    const firstAvailable = ALL_TABS.find(isTabAvailable);
    const [tab, setTab] = useState<SubTab>(() => firstAvailable?.key || 'PH');

    // Card lookup for hover tooltip — cached load
    const [cardsList, setCardsList] = useState<Card[]>([]);
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
    useEffect(() => { loadCards().then(({ all }) => setCardsList(all)); }, []);
    const cardsMap = useMemo(() => {
        const m = new Map<string, Card>();
        for (const c of cardsList) m.set(c.id, c);
        return m;
    }, [cardsList]);
    const showCard = (cardId: string) => {
        const c = cardsMap.get(cardId);
        if (c) setHoveredCard(c);
    };
    const hideCard = () => setHoveredCard(null);

    if (phase !== 'pre_atbat' && phase !== 'defense_sub') {
        return (
            <Overlay onClose={onClose}>
                <div className="sm-empty">Substitutions are only allowed before the pitch roll.</div>
            </Overlay>
        );
    }

    const tabProps = { showCard, hideCard };
    return (
        <Overlay onClose={onClose}>
            <div className="sm-header">
                <span className="sm-title">SUBSTITUTIONS</span>
                <button className="sm-close" onClick={onClose}>CLOSE</button>
            </div>
            <div className="sm-tabs">
                {ALL_TABS.map(t => {
                    const available = isTabAvailable(t);
                    return (
                        <button
                            key={t.key}
                            className={`sm-tab ${tab === t.key ? 'active' : ''}`}
                            onClick={() => available && setTab(t.key)}
                            disabled={!available}
                            title={available ? undefined : t.unavailableReason}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>
            <div className="sm-body">
                {tab === 'PH' && <PinchHitTab team={myTeam} onAction={onAction} onClose={onClose} {...tabProps} />}
                {tab === 'PR' && <PinchRunTab state={state} team={myTeam} onAction={onAction} onClose={onClose} {...tabProps} />}
                {tab === 'PC' && <PitchingChangeTab team={myTeam} onAction={onAction} onClose={onClose} {...tabProps} />}
                {tab === 'DS' && <DefensiveSubTab team={myTeam} onAction={onAction} onClose={onClose} {...tabProps} />}
            </div>
            {hoveredCard && <CardTooltip card={hoveredCard} />}
        </Overlay>
    );
}

interface HoverProps { showCard: (cardId: string) => void; hideCard: () => void }

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="sm-overlay" onClick={onClose}>
            <div className="sm-panel" onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

// ============================================================================
// PINCH HIT
// ============================================================================
function PinchHitTab({ team, onAction, onClose, showCard, hideCard }: { team: TeamState; onAction: (a: GameAction) => void; onClose: () => void } & HoverProps) {
    const [benchCardId, setBenchCardId] = useState<string>('');
    const [lineupIndex, setLineupIndex] = useState<number>(team.currentBatterIndex);

    const submit = () => {
        if (!benchCardId) return;
        onAction({ type: 'PINCH_HIT', benchCardId, lineupIndex });
        onClose();
    };

    return (
        <div className="sm-grid">
            <Section title="1. Pick a bench player">
                <PlayerList players={team.bench} selected={benchCardId} onSelect={setBenchCardId} role="hitter" showCard={showCard} hideCard={hideCard} />
            </Section>
            <Section title="2. Pick a lineup slot">
                <LineupList lineup={team.lineup} selected={lineupIndex} onSelect={setLineupIndex} showCard={showCard} hideCard={hideCard} />
            </Section>
            <Section title="3. Confirm">
                <PreviewSwap
                    incoming={team.bench.find(p => p.cardId === benchCardId)}
                    outgoing={team.lineup[lineupIndex]}
                />
                <button className="sm-btn-primary" onClick={submit} disabled={!benchCardId}>
                    Confirm Pinch Hit
                </button>
            </Section>
        </div>
    );
}

// ============================================================================
// PINCH RUN
// ============================================================================
function PinchRunTab({ state, team, onAction, onClose, showCard, hideCard }: { state: GameState; team: TeamState; onAction: (a: GameAction) => void; onClose: () => void } & HoverProps) {
    const [benchCardId, setBenchCardId] = useState<string>('');
    const [base, setBase] = useState<'first' | 'second' | 'third'>('first');

    const occupiedBases: ('first' | 'second' | 'third')[] = (['first', 'second', 'third'] as const).filter(b => state.bases[b]);
    const runner = state.bases[base] ? team.lineup.find(p => p.cardId === state.bases[base]) : undefined;

    const submit = () => {
        if (!benchCardId || !state.bases[base]) return;
        onAction({ type: 'PINCH_RUN', base, benchCardId });
        onClose();
    };

    return (
        <div className="sm-grid">
            <Section title="1. Pick a base">
                {occupiedBases.length === 0 && <div className="sm-empty">No runners on base.</div>}
                <div className="sm-base-buttons">
                    {occupiedBases.map(b => (
                        <button key={b} className={`sm-base-btn ${base === b ? 'active' : ''}`} onClick={() => setBase(b)}>
                            {b.charAt(0).toUpperCase() + b.slice(1)}
                            {state.bases[b] && (
                                <div className="sm-base-runner">{team.lineup.find(p => p.cardId === state.bases[b])?.name || state.bases[b]}</div>
                            )}
                        </button>
                    ))}
                </div>
            </Section>
            <Section title="2. Pick a bench player">
                <PlayerList players={team.bench} selected={benchCardId} onSelect={setBenchCardId} role="hitter" showCard={showCard} hideCard={hideCard} />
            </Section>
            <Section title="3. Confirm">
                <PreviewSwap
                    incoming={team.bench.find(p => p.cardId === benchCardId)}
                    outgoing={runner}
                />
                <button className="sm-btn-primary" onClick={submit} disabled={!benchCardId || occupiedBases.length === 0}>
                    Confirm Pinch Run
                </button>
            </Section>
        </div>
    );
}

// ============================================================================
// PITCHING CHANGE
// ============================================================================
function PitchingChangeTab({ team, onAction, onClose, showCard, hideCard }: { team: TeamState; onAction: (a: GameAction) => void; onClose: () => void } & HoverProps) {
    const [bullpenCardId, setBullpenCardId] = useState<string>('');
    const reliefAvailable = team.bullpen.filter(p => p.role !== 'Starter');

    const submit = () => {
        if (!bullpenCardId) return;
        onAction({ type: 'PITCHING_CHANGE', bullpenCardId });
        onClose();
    };

    return (
        <div className="sm-grid">
            <Section title="1. Pick a reliever">
                {reliefAvailable.length === 0 && <div className="sm-empty">No relievers available.</div>}
                <PlayerList players={reliefAvailable} selected={bullpenCardId} onSelect={setBullpenCardId} role="pitcher" showCard={showCard} hideCard={hideCard} />
            </Section>
            <Section title="2. Confirm">
                <PreviewSwap
                    incoming={team.bullpen.find(p => p.cardId === bullpenCardId)}
                    outgoing={team.pitcher}
                />
                <button className="sm-btn-primary" onClick={submit} disabled={!bullpenCardId}>
                    Confirm Change
                </button>
            </Section>
        </div>
    );
}

// ============================================================================
// DEFENSIVE SUB (drag-drop)
// Drag a bench card onto a lineup slot = DEFENSIVE_SUB.
// Drag a lineup slot onto another lineup slot = POSITION_SWAP (no sub).
// ============================================================================
const FIELD_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'CF', 'LF-RF-2'];

type DragSrc =
    | { kind: 'bench'; cardId: string }
    | { kind: 'lineup'; slot: string };

function DefensiveSubTab({ team, onAction, onClose, showCard, hideCard }: { team: TeamState; onAction: (a: GameAction) => void; onClose: () => void } & HoverProps) {
    const [drag, setDrag] = useState<DragSrc | null>(null);
    const [hoverSlot, setHoverSlot] = useState<string | null>(null);

    const slotPlayers = useMemo(() => {
        const m: { [k: string]: PlayerSlot | undefined } = {};
        for (const slot of FIELD_SLOTS) m[slot] = team.lineup.find(p => p.assignedPosition === slot);
        return m;
    }, [team.lineup]);

    const dhPlayer = useMemo(() => team.lineup.find(p => p.assignedPosition === 'DH'), [team.lineup]);

    const onDragStart = (src: DragSrc) => (e: React.DragEvent) => {
        setDrag(src);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(src));
    };

    const onDragOverSlot = (slot: string) => (e: React.DragEvent) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (hoverSlot !== slot) setHoverSlot(slot);
    };

    const onDragLeave = () => setHoverSlot(null);

    const onDropOnSlot = (targetSlot: string) => (e: React.DragEvent) => {
        e.preventDefault();
        setHoverSlot(null);
        if (!drag) return;
        if (drag.kind === 'bench') {
            onAction({ type: 'DEFENSIVE_SUB', position: targetSlot, benchCardId: drag.cardId });
            onClose();
        } else if (drag.kind === 'lineup') {
            if (drag.slot === targetSlot) { setDrag(null); return; }
            onAction({ type: 'POSITION_SWAP', slotA: drag.slot, slotB: targetSlot });
            onClose();
        }
        setDrag(null);
    };

    const renderSlot = (slot: string) => {
        const p = slotPlayers[slot];
        const penalty = drag?.kind === 'bench' && team.bench.find(b => b.cardId === drag.cardId)
            ? fieldingPenalty(asCard(team.bench.find(b => b.cardId === drag.cardId)!), slot)
            : null;
        const isDropTarget = !!drag && hoverSlot === slot && (
            drag.kind === 'bench' || (drag.kind === 'lineup' && drag.slot !== slot)
        );
        const isSource = drag?.kind === 'lineup' && drag.slot === slot;
        return (
            <div
                key={slot}
                className={`sm-field-slot ${isDropTarget ? 'drop-target' : ''} ${isSource ? 'dragging' : ''}`}
                onDragOver={onDragOverSlot(slot)}
                onDragLeave={onDragLeave}
                onDrop={onDropOnSlot(slot)}
            >
                <div className="sm-field-slot-label">{slot.replace(/-\d+$/, '')}</div>
                {p ? (
                    <div
                        className="sm-field-card"
                        draggable
                        onDragStart={onDragStart({ kind: 'lineup', slot })}
                        onMouseEnter={() => showCard?.(p.cardId)}
                        onMouseLeave={() => hideCard?.()}
                    >
                        {p.imagePath && <img src={p.imagePath} alt="" draggable={false} />}
                        <div className="sm-field-name">{p.name}</div>
                        <div className="sm-field-meta">F{p.fielding} • {(p.positions || []).map(x => x.position).join('/') || 'DH'}</div>
                    </div>
                ) : (
                    <div className="sm-field-empty">empty</div>
                )}
                {penalty && isDropTarget && (
                    <div className={`sm-field-pen ${renderPenalty(penalty.penalty, penalty.valid).cls}`}>
                        {renderPenalty(penalty.penalty, penalty.valid).text}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="sm-ds-wrap">
            <div className="sm-ds-hint">
                Drag a <strong>bench card</strong> onto a position to sub in. Drag a <strong>lineup card</strong> onto another to swap positions.
            </div>
            <div className="sm-ds-field">
                {FIELD_SLOTS.map(renderSlot)}
            </div>
            {dhPlayer && (
                <div className="sm-ds-dh">
                    <div
                        className="sm-field-slot sm-dh-slot"
                        onDragOver={onDragOverSlot('DH')}
                        onDragLeave={onDragLeave}
                        onDrop={onDropOnSlot('DH')}
                    >
                        <div className="sm-field-slot-label">DH</div>
                        <div
                            className="sm-field-card"
                            draggable
                            onDragStart={onDragStart({ kind: 'lineup', slot: 'DH' })}
                            onMouseEnter={() => showCard?.(dhPlayer.cardId)}
                            onMouseLeave={() => hideCard?.()}
                        >
                            {dhPlayer.imagePath && <img src={dhPlayer.imagePath} alt="" draggable={false} />}
                            <div className="sm-field-name">{dhPlayer.name}</div>
                            <div className="sm-field-meta">DH</div>
                        </div>
                    </div>
                </div>
            )}
            <div className="sm-ds-bench-title">BENCH</div>
            <div className="sm-ds-bench">
                {team.bench.length === 0 && <div className="sm-empty">No bench players available.</div>}
                {team.bench.map(p => (
                    <div
                        key={p.cardId}
                        className="sm-bench-card"
                        draggable
                        onDragStart={onDragStart({ kind: 'bench', cardId: p.cardId })}
                        onMouseEnter={() => showCard?.(p.cardId)}
                        onMouseLeave={() => hideCard?.()}
                    >
                        {p.imagePath && <img src={p.imagePath} alt="" draggable={false} />}
                        <div className="sm-field-name">{p.name}</div>
                        <div className="sm-field-meta">{(p.positions || []).map(x => x.position).join('/') || 'DH'}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// SHARED SUB-COMPONENTS
// ============================================================================
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="sm-section">
            <div className="sm-section-title">{title}</div>
            <div className="sm-section-body">{children}</div>
        </div>
    );
}

function PlayerList({
    players, selected, onSelect, role, position, allowEmpty, showCard, hideCard,
}: {
    players: PlayerSlot[]; selected: string; onSelect: (id: string) => void;
    role?: 'hitter' | 'pitcher'; position?: string; allowEmpty?: boolean;
} & Partial<HoverProps>) {
    if (players.length === 0 && !allowEmpty) {
        return <div className="sm-empty">No players available.</div>;
    }
    const onEnter = (cardId: string) => () => showCard?.(cardId);
    const onLeave = () => hideCard?.();
    return (
        <div className="sm-player-list">
            {allowEmpty && (
                <button className={`sm-player-row ${selected === '' ? 'active' : ''}`} onClick={() => onSelect('')}>
                    <span className="sm-player-name">— None —</span>
                </button>
            )}
            {players.map(p => {
                const pen = position ? fieldingPenalty(asCard(p), position) : null;
                return (
                    <button
                        key={p.cardId}
                        className={`sm-player-row ${selected === p.cardId ? 'active' : ''}`}
                        onClick={() => onSelect(p.cardId)}
                        onMouseEnter={onEnter(p.cardId)}
                        onMouseLeave={onLeave}
                    >
                        <span className="sm-player-name">{p.name}</span>
                        <span className="sm-player-meta">
                            {role === 'hitter' && `OB ${p.onBase} | Spd ${p.speed}`}
                            {role === 'pitcher' && `Ctrl ${p.control} | IP ${p.ip}`}
                            {p.icons && p.icons.length > 0 && (
                                <span className="sm-player-icons"> {p.icons.join(' ')}</span>
                            )}
                            {pen && (
                                <span className={`sm-player-pen ${renderPenalty(pen.penalty, pen.valid).cls}`}>
                                    {' '}{renderPenalty(pen.penalty, pen.valid).text}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function LineupList({
    lineup, selected, onSelect, highlight, disabled, showCard, hideCard,
}: {
    lineup: PlayerSlot[]; selected: number; onSelect: (idx: number) => void;
    highlight?: number; disabled?: number;
} & Partial<HoverProps>) {
    return (
        <div className="sm-lineup-list">
            {lineup.map((p, i) => (
                <button
                    key={i}
                    className={`sm-lineup-row ${selected === i ? 'active' : ''} ${highlight === i ? 'highlight' : ''}`}
                    onClick={() => i !== disabled && onSelect(i)}
                    disabled={i === disabled}
                    onMouseEnter={() => showCard?.(p.cardId)}
                    onMouseLeave={() => hideCard?.()}
                >
                    <span className="sm-lineup-num">{i + 1}.</span>
                    <span className="sm-lineup-name">{p.name}</span>
                    <span className="sm-lineup-pos">{p.assignedPosition?.replace(/-\d+$/, '')}</span>
                </button>
            ))}
        </div>
    );
}

function PreviewSwap({ incoming, outgoing }: { incoming?: PlayerSlot; outgoing?: PlayerSlot }) {
    if (!incoming && !outgoing) return null;
    return (
        <div className="sm-preview">
            <div className="sm-preview-side">
                <div className="sm-preview-label">In</div>
                <div className="sm-preview-name">{incoming?.name || '—'}</div>
            </div>
            <div className="sm-preview-arrow">→</div>
            <div className="sm-preview-side">
                <div className="sm-preview-label">Out</div>
                <div className="sm-preview-name">{outgoing?.name || '—'}</div>
            </div>
        </div>
    );
}
