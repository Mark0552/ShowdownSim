import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Card, PitcherCard } from '../types/cards';
import type { TeamStore } from '../store/teamStore';
import type { DragStore } from '../store/dragStore';
import type { SlotSelection } from '../components/roster/RosterPanel';
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
}

export default function TeamBuilder({ cards, teamStore, dragStore }: Props) {
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [activeSlot, setActiveSlot] = useState<SlotSelection | null>(null);

    // Load saved roster on mount
    useEffect(() => {
        const saved = localStorage.getItem('showdown-roster');
        if (!saved) return;
        try {
            const team = JSON.parse(saved);
            // Re-hydrate: match saved card IDs to actual card objects
            const cardMap = new Map(cards.map(c => [c.id, c]));
            const hydratedSlots = team.slots
                ?.map((slot: any) => {
                    const card = cardMap.get(slot.card?.id);
                    if (!card) return null;
                    return { ...slot, card };
                })
                .filter(Boolean);
            if (hydratedSlots?.length > 0) {
                teamStore.dispatch({ type: 'LOAD' as any, team: { ...team, slots: hydratedSlots } });
            }
        } catch (e) { /* ignore bad save data */ }
    }, []); // eslint-disable-line
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

    return (
        <div className="team-builder">
            <header className="tb-header">
                <h1>MLB Showdown Team Builder</h1>
                <div className="tb-header-stats">
                    <span className={`header-stat ${teamStore.team.slots.length !== 20 ? 'over-cap' : ''}`}>
                        {teamStore.team.slots.length} / 20 players
                    </span>
                    <span className="divider">|</span>
                    <span className={`header-stat ${teamStore.totalPoints > 5000 ? 'over-cap' : ''}`}>
                        {teamStore.totalPoints.toLocaleString()} / 5,000 pts
                    </span>
                    <span className="divider">|</span>
                    <button className="header-btn save-btn" onClick={() => {
                        if (confirm('Save current lineup?')) {
                            // lineupOrder is attached to the team object by LineupBar
                            localStorage.setItem('showdown-roster', JSON.stringify(teamStore.team));
                        }
                    }}>Save Lineup</button>
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
        </div>
    );
}
