import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Card, PitcherCard } from '../types/cards';
import type { Team } from '../types/team';
import type { TeamStore } from '../store/teamStore';
import type { DragStore } from '../store/dragStore';
import type { SlotSelection } from '../components/roster/RosterPanel';
import type { SavedLineup } from '../lib/lineups';
import { createLineup, updateLineup } from '../lib/lineups';
import { FilterState, DEFAULT_FILTERS, filterCards, getFilterOptions } from '../data/filters';
import FilterBar from '../components/catalog/FilterBar';
import CardCatalog from '../components/catalog/CardCatalog';
import RosterPanel from '../components/roster/RosterPanel';
import LineupBar from '../components/roster/LineupBar';
import BenchPanel from '../components/roster/BenchPanel';
import './TeamBuilder.css';

/** Transient feedback shown after an add (with Undo) or when the user
 *  taps a catalog card without an active slot (hint, no Undo). */
interface ToastState {
    message: string;
    /** Pre-add team snapshot. When present, the toast renders an "Undo"
     *  button that dispatches LOAD with this snapshot. Hint toasts pass
     *  null so the Undo button is hidden. */
    undoSnapshot: Team | null;
    /** Bumped each time a new toast is set, so the auto-dismiss timer
     *  in useEffect only clears its own toast (not a newer replacement). */
    seq: number;
}

interface Props {
    cards: Card[];
    teamStore: TeamStore;
    dragStore: DragStore;
    editingLineup?: SavedLineup | null;
    onBack?: () => void;
}

export default function TeamBuilder({ cards, teamStore, dragStore, editingLineup, onBack }: Props) {
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [activeSlot, setActiveSlot] = useState<SlotSelection | null>(null);

    const filterOptions = useMemo(() => getFilterOptions(cards), [cards]);

    const effectiveFilters = useMemo(() => {
        if (!activeSlot) return filters;
        const f = { ...filters };
        if (activeSlot.type === 'field') {
            f.type = 'hitter';
            f.position = activeSlot.filterPos;
        } else if (activeSlot.type === 'starter') {
            f.type = 'pitcher';
            f.position = 'Starter';
        } else if (activeSlot.type === 'bullpen') {
            f.type = 'pitcher';
            f.position = 'Bullpen';
        } else if (activeSlot.type === 'bench') {
            f.type = 'all';
        }
        return f;
    }, [filters, activeSlot]);

    const filteredCards = useMemo(() => filterCards(cards, effectiveFilters), [cards, effectiveFilters]);

    const updateFilter = (key: keyof FilterState, value: string | number) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => { setFilters(DEFAULT_FILTERS); setActiveSlot(null); };

    // Transient toast for add confirmations + the "tap a slot first" hint
    // for users who tap a catalog card without an active slot. Snapshots
    // the pre-add team state so the Undo button can restore it.
    const [toast, setToast] = useState<ToastState | null>(null);
    const toastSeqRef = useRef(0);

    // Auto-dismiss the toast 4s after it appears. The seq guards against
    // an earlier timer clearing a newer toast that replaced it before the
    // original 4s elapsed.
    useEffect(() => {
        if (!toast) return;
        const seqAtMount = toast.seq;
        const t = setTimeout(() => {
            setToast(prev => (prev && prev.seq === seqAtMount ? null : prev));
        }, 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const showToast = useCallback((message: string, undoSnapshot: Team | null) => {
        toastSeqRef.current += 1;
        setToast({ message, undoSnapshot, seq: toastSeqRef.current });
    }, []);

    const handleUndo = useCallback(() => {
        if (!toast?.undoSnapshot) return;
        teamStore.dispatch({ type: 'LOAD', team: toast.undoSnapshot });
        setToast(null);
    }, [toast, teamStore]);

    const handleAddCard = useCallback((card: Card) => {
        // No active slot → can't route the card anywhere. Show a hint
        // instead of silently no-op'ing (the silent no-op was the
        // single biggest "what's happening?" mobile gripe).
        if (!activeSlot) {
            showToast('Tap a slot first, then pick a card to fill it.', null);
            return;
        }
        // Snapshot pre-add team for Undo. JSON round-trip is safe — the
        // Team shape is plain JSON, and the reducer treats LOAD as a
        // full replacement.
        const snapshot: Team = JSON.parse(JSON.stringify(teamStore.team));

        // Build a human-readable slot label up front (activeSlot will be
        // cleared by the end of this function).
        const slotName =
            activeSlot.type === 'field' ? activeSlot.filterPos
            : activeSlot.type === 'starter' ? activeSlot.slotKey.replace('-', ' ')
            : activeSlot.type === 'bullpen' ? 'Bullpen'
            : 'Bench';

        if (activeSlot.type === 'field') {
            teamStore.addToSlot(card, activeSlot.slotKey);
        } else if (activeSlot.type === 'starter') {
            teamStore.addToSlot(card, activeSlot.slotKey);
        } else if (activeSlot.type === 'bullpen') {
            if (card.type === 'pitcher') {
                const role = (card as PitcherCard).role;
                teamStore.addToSlot(card, role === 'Starter' ? 'Reliever' : role);
            }
        } else if (activeSlot.type === 'bench') {
            teamStore.addToSlot(card, 'bench');
        }
        setActiveSlot(null);
        showToast(`Added ${card.name} to ${slotName}`, snapshot);
    }, [activeSlot, teamStore, showToast]);

    const handleSlotClick = useCallback((slot: SlotSelection | null) => {
        setActiveSlot(prev => {
            if (prev && slot && prev.type === slot.type) {
                if ('slotKey' in prev && 'slotKey' in slot && prev.slotKey === slot.slotKey) return null;
                if (!('slotKey' in prev) && !('slotKey' in slot)) return null;
            }
            return slot;
        });
    }, []);

    const slotLabel = activeSlot
        ? activeSlot.type === 'field' ? `Picking for: ${activeSlot.filterPos}`
        : activeSlot.type === 'starter' ? `Picking: ${activeSlot.slotKey.replace('-', ' ')}`
        : activeSlot.type === 'bullpen' ? 'Picking: Reliever / Closer'
        : 'Picking: Bench Player'
        : null;

    const addLabel = activeSlot
        ? activeSlot.type === 'field' ? `Add to ${activeSlot.filterPos}`
        : activeSlot.type === 'starter' ? `Add as ${activeSlot.slotKey.replace('-', ' ')}`
        : activeSlot.type === 'bullpen' ? 'Add to Bullpen'
        : 'Add to Bench'
        : '+ Add';

    const [saving, setSaving] = useState(false);
    const [lineupName, setLineupName] = useState(editingLineup?.name || '');

    const handleSave = async () => {
        const name = lineupName.trim() || prompt('Lineup name:');
        if (!name) return;
        setLineupName(name);
        setSaving(true);
        try {
            const teamData = JSON.parse(JSON.stringify(teamStore.team));
            if (editingLineup) {
                await updateLineup(editingLineup.id, name, teamData);
            } else {
                await createLineup(name, teamData);
            }
            if (onBack) onBack();
        } catch (err: any) {
            alert('Save failed: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="team-builder">
            <header className="tb-header">
                <div className="tb-header-left">
                    {onBack && <button className="header-btn back-btn" onClick={onBack}>&larr;</button>}
                    <input
                        className="lineup-name-input"
                        value={lineupName}
                        onChange={e => setLineupName(e.target.value)}
                        placeholder="Lineup name..."
                    />
                </div>
                <div className="tb-header-stats">
                    <span className={`header-stat ${teamStore.team.slots.length !== 20 ? 'over-cap' : ''}`}>
                        {teamStore.team.slots.length} / 20 players
                    </span>
                    <span className="divider">|</span>
                    <span className={`header-stat ${teamStore.totalPoints > 5000 ? 'over-cap' : ''}`}>
                        {teamStore.totalPoints.toLocaleString()} / 5,000 pts
                    </span>
                    <span className="divider">|</span>
                    <button className="header-btn save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="header-btn clear-btn" onClick={() => {
                        if (teamStore.team.slots.length === 0 || confirm('Clear entire roster?')) {
                            teamStore.clearTeam();
                        }
                    }}>Clear</button>
                </div>
            </header>

            <div className="tb-body">
                <div className="tb-catalog">
                    {slotLabel && (
                        <div className="tb-slot-banner">
                            {slotLabel}
                            <button onClick={() => setActiveSlot(null)}>Cancel</button>
                        </div>
                    )}
                    <FilterBar
                        filters={effectiveFilters}
                        options={filterOptions}
                        onChange={updateFilter}
                        onClear={clearFilters}
                        resultCount={filteredCards.length}
                        totalCount={cards.length}
                    />
                    <CardCatalog
                        cards={filteredCards}
                        rosterCardIds={teamStore.rosterCardIds}
                        onAddCard={handleAddCard}
                        addLabel={addLabel}
                        dragStore={dragStore}
                    />
                </div>

                <div className="tb-sidebar">
                    <RosterPanel
                        teamStore={teamStore}
                        dragStore={dragStore}
                        activeSlot={activeSlot}
                        onSlotClick={handleSlotClick}
                    />
                    <BenchPanel
                        teamStore={teamStore}
                        dragStore={dragStore}
                        activeSlot={activeSlot}
                        onSlotClick={handleSlotClick}
                    />
                </div>

                <div className="tb-lineup-bar">
                    <LineupBar
                        teamStore={teamStore}
                        dragStore={dragStore}
                        activeSlot={activeSlot}
                        onSlotClick={handleSlotClick}
                    />
                </div>
            </div>

            {/* Toast overlay — fixed-position so it floats above whatever
                region the user is interacting with. Renders the message
                and an Undo button when an add just happened (snapshot
                present) or just the message for hints (snapshot null).
                Auto-dismisses after 4s via the useEffect above. */}
            {toast && (
                <div className="tb-toast" role="status">
                    <span className="tb-toast-msg">{toast.message}</span>
                    {toast.undoSnapshot && (
                        <button className="tb-toast-undo" onClick={handleUndo}>Undo</button>
                    )}
                    <button
                        className="tb-toast-dismiss"
                        onClick={() => setToast(null)}
                        aria-label="Dismiss"
                    >&times;</button>
                </div>
            )}
        </div>
    );
}
