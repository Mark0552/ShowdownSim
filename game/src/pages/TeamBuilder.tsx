import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Card, PitcherCard } from '../types/cards';
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

    // Mobile-only two-pane tab toggle. The desktop 3-column grid (catalog +
    // sidebar + lineup) doesn't fit on a phone, so on narrow viewports we
    // collapse to two views and let the user swap between them. Picking a
    // slot in TEAM auto-switches to CATALOG (so the user sees the picker
    // banner + filtered grid); adding a card auto-switches back to TEAM.
    // Desktop ignores this state — both panes render side-by-side.
    const [mobileTab, setMobileTab] = useState<'team' | 'catalog'>('team');
    useEffect(() => {
        if (activeSlot) setMobileTab('catalog');
    }, [activeSlot]);

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

    const handleAddCard = useCallback((card: Card) => {
        if (!activeSlot) return;
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
        // After adding on mobile, swap back to the TEAM view so the user
        // sees the slot they just filled. Desktop ignores this state.
        setMobileTab('team');
    }, [activeSlot, teamStore]);

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
        <div className={`team-builder tb-mobile-${mobileTab}`}>
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

            {/* Mobile-only tab toggle — visible below 900px via CSS. */}
            <div className="tb-mobile-tabs" role="tablist">
                <button
                    role="tab"
                    aria-selected={mobileTab === 'team'}
                    className={`tb-mobile-tab ${mobileTab === 'team' ? 'active' : ''}`}
                    onClick={() => setMobileTab('team')}
                >TEAM</button>
                <button
                    role="tab"
                    aria-selected={mobileTab === 'catalog'}
                    className={`tb-mobile-tab ${mobileTab === 'catalog' ? 'active' : ''}`}
                    onClick={() => setMobileTab('catalog')}
                >CATALOG</button>
            </div>

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
        </div>
    );
}
