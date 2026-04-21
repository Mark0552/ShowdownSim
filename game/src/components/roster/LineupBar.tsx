import { useState, useRef, useEffect } from 'react';
import type { TeamStore } from '../../store/teamStore';
import type { DragStore } from '../../store/dragStore';
import type { SlotSelection } from './RosterPanel';
import type { RosterSlot } from '../../types/team';
import { LINEUP_SLOT_DEFS } from '../../types/team';
import CardTooltip from '../cards/CardTooltip';
import './LineupBar.css';

interface Props {
    teamStore: TeamStore;
    dragStore: DragStore;
    activeSlot: SlotSelection | null;
    onSlotClick: (slot: SlotSelection | null) => void;
}

// A unique marker so we know the drag originated from within the lineup
const LINEUP_DRAG_MARKER = 'application/lineup-internal';

export default function LineupBar({ teamStore, dragStore, activeSlot, onSlotClick }: Props) {
    const { team, slotMap, setLineupOrder, removeCard, addToSlot } = teamStore;
    const { draggedCard, eligibleSlots, startDrag, endDrag } = dragStore;
    const [hoverCard, setHoverCard] = useState<RosterSlot | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragRef = useRef<number | null>(null);
    const isInternalDrag = useRef(false);

    const isActive = (slotKey: string) =>
        activeSlot?.type === 'field' && activeSlot.slotKey === slotKey;

    // Card order persisted via team save — derive from team slots or default
    const [cardOrder, setCardOrder] = useState<string[]>(() => {
        // Check if team has a saved lineup order
        const saved = (team as any).lineupOrder;
        if (saved && Array.isArray(saved) && saved.length === LINEUP_SLOT_DEFS.length) {
            return saved;
        }
        return LINEUP_SLOT_DEFS.map(d => d.key);
    });

    // When team loads (e.g., from save), restore card order
    useEffect(() => {
        const saved = (team as any).lineupOrder;
        if (saved && Array.isArray(saved) && saved.length === LINEUP_SLOT_DEFS.length) {
            setCardOrder(saved);
        }
    }, [(team as any).lineupOrder]); // eslint-disable-line

    const defMap = new Map(LINEUP_SLOT_DEFS.map(d => [d.key, d]));
    const display = cardOrder.map(key => ({
        key,
        label: defMap.get(key)!.label,
        filterPos: defMap.get(key)!.filterPos,
        slot: slotMap.get(key) || null,
    }));

    // Sync batting order numbers to match visual order
    const filledIds = display.filter(d => d.slot).map(d => d.slot!.card.id);
    useEffect(() => {
        if (filledIds.length === 0) return;
        const currentOrder = team.slots
            .filter(s => s.battingOrder != null)
            .sort((a, b) => a.battingOrder! - b.battingOrder!)
            .map(s => s.card.id);
        if (JSON.stringify(currentOrder) !== JSON.stringify(filledIds)) {
            setLineupOrder(filledIds);
        }
    }, [cardOrder, team.slots.length]); // eslint-disable-line

    // Save cardOrder into team whenever it changes (for persistence)
    useEffect(() => {
        (team as any).lineupOrder = cardOrder;
    }, [cardOrder]); // eslint-disable-line

    // If the hovered slot's card was removed (drag-to-delete, etc.), the
    // onMouseLeave may not fire — clear hover when the slot map changes.
    useEffect(() => {
        if (hoverCard && !slotMap.has(hoverCard.assignedPosition)) {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            setHoverCard(null);
        }
    }, [slotMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- INTERNAL lineup reorder drag ----
    const handleInternalDragStart = (e: React.DragEvent, idx: number, slot: RosterSlot) => {
        dragRef.current = idx;
        isInternalDrag.current = true;
        // Set the internal marker
        e.dataTransfer.setData(LINEUP_DRAG_MARKER, String(idx));
        // Also set card-id + source so other panels CAN accept if dropped there
        e.dataTransfer.setData('application/card-id', slot.card.id);
        e.dataTransfer.setData('application/source-slot', slot.assignedPosition);
        e.dataTransfer.effectAllowed = 'move';
        startDrag(slot.card);
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
        (e.currentTarget as HTMLElement).classList.add('dragging');
    };

    const handleInternalDragEnd = (e: React.DragEvent) => {
        const idx = dragRef.current;
        dragRef.current = null;
        isInternalDrag.current = false;
        (e.currentTarget as HTMLElement).classList.remove('dragging');
        endDrag();

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const isInsideRoster = dropTarget?.closest('.lineup-bar, .roster-panel, .bench-panel');
        if (!isInsideRoster && idx !== null) {
            const slot = display[idx]?.slot;
            if (slot) removeCard(slot.card.id);
        }
    };

    const handleDragOver = (e: React.DragEvent, slotKey: string) => {
        // Always allow if it's an internal reorder
        if (isInternalDrag.current) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return;
        }
        // External drop — only if eligible
        if (draggedCard && eligibleSlots.has(slotKey)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDrop = (e: React.DragEvent, targetIdx: number, slotKey: string) => {
        e.preventDefault();

        // Check if this is an internal lineup reorder
        const internalFrom = e.dataTransfer.getData(LINEUP_DRAG_MARKER);
        if (internalFrom !== '') {
            // Internal reorder — just swap card positions in the visual order
            const fromIdx = parseInt(internalFrom);
            if (fromIdx === targetIdx) return;
            const newOrder = [...cardOrder];
            const [moved] = newOrder.splice(fromIdx, 1);
            newOrder.splice(targetIdx, 0, moved);
            setCardOrder(newOrder);
            const newFilledIds = newOrder.map(key => slotMap.get(key)?.card.id).filter(Boolean) as string[];
            setLineupOrder(newFilledIds);
            dragRef.current = targetIdx;
            return;
        }

        // External drop (from catalog or another panel)
        const sourceSlot = e.dataTransfer.getData('application/source-slot');
        if (draggedCard && eligibleSlots.has(slotKey)) {
            if (sourceSlot) removeCard(draggedCard.id);
            addToSlot(draggedCard, slotKey);
            endDrag();
        }
    };

    const handleMouseEnter = (slot: RosterSlot) => {
        if (draggedCard) return;
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(slot), 400);
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    return (
        <div className="lineup-bar">
            <div className="lineup-header">
                <h3>Starting Lineup — Batting Order</h3>
            </div>
            <div className="lineup-slots">
                {display.map(({ key, label, filterPos, slot }, idx) => {
                    const order = slot?.battingOrder;
                    const isDropTarget = !isInternalDrag.current && draggedCard && eligibleSlots.has(key);
                    return (
                        <div
                            key={key}
                            className={`lineup-card ${slot ? 'filled' : 'empty'} ${isActive(key) ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                            onClick={() => !slot && onSlotClick({ type: 'field', slotKey: key, filterPos })}
                            draggable={!!slot}
                            onDragStart={(e) => slot && handleInternalDragStart(e, idx, slot)}
                            onDragEnd={handleInternalDragEnd}
                            onDragOver={(e) => handleDragOver(e, key)}
                            onDrop={(e) => handleDrop(e, idx, key)}
                            onMouseEnter={() => slot && handleMouseEnter(slot)}
                            onMouseLeave={handleMouseLeave}
                        >
                            {order != null && <span className="lineup-order">{order}</span>}
                            <span className="lineup-pos">{label}</span>
                            {slot ? (
                                <>
                                    <img src={slot.card.imagePath} alt="" className="lineup-img" draggable={false} />
                                    <span className="lineup-name">{slot.card.name}</span>
                                    <span className="lineup-pts">{slot.card.points}pt</span>
                                </>
                            ) : (
                                <div className="lineup-empty">{isDropTarget ? 'Drop here' : 'Click\nto fill'}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {hoverCard && <CardTooltip card={hoverCard.card} />}
        </div>
    );
}
