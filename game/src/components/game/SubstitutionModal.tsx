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

const ALL_TABS: { key: SubTab; label: string; phases: GameState['phase'][] }[] = [
    { key: 'PH', label: 'Pinch Hit', phases: ['pre_atbat'] },
    { key: 'PR', label: 'Pinch Run', phases: ['pre_atbat'] },
    { key: 'PC', label: 'Pitching Change', phases: ['defense_sub'] },
    { key: 'DS', label: 'Defensive Sub', phases: ['pre_atbat', 'defense_sub'] },
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
    const availableTabs = ALL_TABS.filter(t => t.phases.includes(phase));
    const [tab, setTab] = useState<SubTab>(() => availableTabs[0]?.key || 'PH');

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
                {availableTabs.map(t => (
                    <button key={t.key} className={`sm-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
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
// DEFENSIVE SUB
// ============================================================================
const FIELD_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'CF', 'LF-RF-2'];
function DefensiveSubTab({ team, onAction, onClose, showCard, hideCard }: { team: TeamState; onAction: (a: GameAction) => void; onClose: () => void } & HoverProps) {
    const [benchCardId, setBenchCardId] = useState<string>('');
    const [position, setPosition] = useState<string>('');

    const slotsWithPlayer = useMemo(() =>
        FIELD_SLOTS.map(slot => ({
            slot,
            player: team.lineup.find(p => p.assignedPosition === slot),
        })).filter(s => s.player),
        [team.lineup]
    );
    const incoming = team.bench.find(p => p.cardId === benchCardId);
    const outgoing = position ? team.lineup.find(p => p.assignedPosition === position) : undefined;
    const penalty = incoming && position ? fieldingPenalty(asCard(incoming), position) : null;

    const submit = () => {
        if (!benchCardId || !position) return;
        onAction({ type: 'DEFENSIVE_SUB', position, benchCardId });
        onClose();
    };

    return (
        <div className="sm-grid">
            <Section title="1. Pick the position to swap">
                <div className="sm-pos-grid">
                    {slotsWithPlayer.map(({ slot, player }) => (
                        <button key={slot} className={`sm-pos-btn ${position === slot ? 'active' : ''}`} onClick={() => setPosition(slot)}>
                            <div className="sm-pos-slot">{slot}</div>
                            <div className="sm-pos-name">{player!.name}</div>
                        </button>
                    ))}
                </div>
            </Section>
            <Section title="2. Pick a bench player">
                <PlayerList players={team.bench} selected={benchCardId} onSelect={setBenchCardId} role="hitter" position={position || undefined} showCard={showCard} hideCard={hideCard} />
            </Section>
            <Section title="3. Confirm">
                <PreviewSwap incoming={incoming} outgoing={outgoing} />
                {penalty && (
                    <div className={`sm-penalty-box ${renderPenalty(penalty.penalty, penalty.valid).cls}`}>
                        Fielding penalty at {position}: <strong>{renderPenalty(penalty.penalty, penalty.valid).text}</strong> — {penalty.reason}
                    </div>
                )}
                <button className="sm-btn-primary" onClick={submit} disabled={!benchCardId || !position || (penalty?.valid === false)}>
                    Confirm Defensive Sub
                </button>
            </Section>
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
