import { useState, useRef } from 'react';
import type { PitcherCard } from '../../types/cards';
import type { TeamStore } from '../../store/teamStore';
import type { DragStore } from '../../store/dragStore';
import type { RosterSlot } from '../../types/team';
import { STARTER_SLOT_DEFS } from '../../types/team';
import CardTooltip from '../cards/CardTooltip';
import './RosterPanel.css';

export type SlotSelection =
    | { type: 'field'; slotKey: string; filterPos: string }
    | { type: 'starter'; slotKey: string }
    | { type: 'bullpen' }
    | { type: 'bench' };

interface Props {
    teamStore: TeamStore;
    dragStore: DragStore;
    activeSlot: SlotSelection | null;
    onSlotClick: (slot: SlotSelection | null) => void;
}

export default function RosterPanel({ teamStore, dragStore, activeSlot, onSlotClick }: Props) {
    const { slotMap, starterSlots, bullpenSlots, benchSlots,
            removeCard, setStarterOrder, addToSlot } = teamStore;
    const { draggedCard, eligibleSlots, startDrag, endDrag } = dragStore;
    const [hoverCard, setHoverCard] = useState<RosterSlot | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const isActive = (slot: SlotSelection) => {
        if (!activeSlot) return false;
        if (activeSlot.type !== slot.type) return false;
        if ('slotKey' in activeSlot && 'slotKey' in slot) return activeSlot.slotKey === slot.slotKey;
        return true;
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

    // Starter drag — set card data so other panels can accept
    const handleStarterDragStart = (e: React.DragEvent, idx: number, slot: RosterSlot) => {
        setDragIdx(idx);
        e.dataTransfer.setData('application/card-id', slot.card.id);
        e.dataTransfer.setData('application/source-slot', slot.assignedPosition);
        e.dataTransfer.effectAllowed = 'move';
        startDrag(slot.card);
        setHoverCard(null);
    };

    const handleStarterDragOver = (e: React.DragEvent, idx: number, slotKey: string) => {
        if (draggedCard && eligibleSlots.has(slotKey)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        } else if (dragIdx !== null) {
            // Internal starter reorder
            e.preventDefault();
            if (dragIdx !== idx) {
                const ids = starterSlots.map(s => s.card.id);
                const [moved] = ids.splice(dragIdx, 1);
                ids.splice(idx, 0, moved);
                setStarterOrder(ids);
                setDragIdx(idx);
            }
        }
    };

    const handleStarterDragEnd = (e: React.DragEvent, slot: RosterSlot) => {
        setDragIdx(null);
        endDrag();
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const isInsideRoster = dropTarget?.closest('.lineup-bar, .roster-panel, .bench-panel');
        if (!isInsideRoster) removeCard(slot.card.id);
    };

    const handleStarterDrop = (e: React.DragEvent, slotKey: string) => {
        e.preventDefault();
        const sourceSlot = e.dataTransfer.getData('application/source-slot');
        if (draggedCard && eligibleSlots.has(slotKey)) {
            if (sourceSlot) removeCard(draggedCard.id);
            addToSlot(draggedCard, slotKey);
            endDrag();
            setDragIdx(null);
        }
    };

    // Bullpen drag
    const handleBullpenDragStart = (e: React.DragEvent, slot: RosterSlot) => {
        e.dataTransfer.setData('application/card-id', slot.card.id);
        e.dataTransfer.setData('application/source-slot', slot.assignedPosition);
        e.dataTransfer.effectAllowed = 'move';
        startDrag(slot.card);
        setHoverCard(null);
    };

    const handleBullpenDragEnd = (e: React.DragEvent, slot: RosterSlot) => {
        endDrag();
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const isInsideRoster = dropTarget?.closest('.lineup-bar, .roster-panel, .bench-panel');
        if (!isInsideRoster) removeCard(slot.card.id);
    };

    const handleBullpenDragOver = (e: React.DragEvent) => {
        if (draggedCard && (eligibleSlots.has('Reliever') || eligibleSlots.has('Closer') || eligibleSlots.has('bullpen'))) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleBullpenDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const sourceSlot = e.dataTransfer.getData('application/source-slot');
        if (draggedCard && draggedCard.type === 'pitcher' && (eligibleSlots.has('Reliever') || eligibleSlots.has('Closer'))) {
            if (sourceSlot) removeCard(draggedCard.id);
            const role = (draggedCard as PitcherCard).role;
            addToSlot(draggedCard, role === 'Starter' ? 'Reliever' : role);
            endDrag();
        }
    };

    return (
        <div className="roster-panel">
            {/* Starting Rotation */}
            <div className="rp-section">
                <h3>Starting Rotation</h3>
                <div className="rp-card-grid">
                    {STARTER_SLOT_DEFS.map((def, idx) => {
                        const slot = slotMap.get(def.key);
                        const isDropTarget = draggedCard && eligibleSlots.has(def.key);
                        return (
                            <div
                                key={def.key}
                                className={`rp-card ${slot ? 'filled' : 'empty'} ${isActive({ type: 'starter', slotKey: def.key }) ? 'active' : ''} ${dragIdx === idx ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                                onClick={() => !slot && onSlotClick({ type: 'starter', slotKey: def.key })}
                                draggable={!!slot}
                                onDragStart={(e) => slot && handleStarterDragStart(e, idx, slot)}
                                onDragOver={(e) => handleStarterDragOver(e, idx, def.key)}
                                onDragEnd={(e) => slot && handleStarterDragEnd(e, slot)}
                                onDrop={(e) => handleStarterDrop(e, def.key)}
                                onMouseEnter={() => slot && handleMouseEnter(slot)}
                                onMouseLeave={handleMouseLeave}
                            >
                                <span className="rp-card-label">{def.label}</span>
                                {slot ? (
                                    <>
                                        <img src={slot.card.imagePath} alt="" className="rp-card-img" draggable={false} />
                                        <span className="rp-card-name">{slot.card.name}</span>
                                        <span className="rp-card-sub">{slot.card.points}pt</span>
                                    </>
                                ) : (
                                    <div className="rp-card-empty">{isDropTarget ? 'Drop here' : 'Click\nto fill'}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bullpen */}
            <div className="rp-section">
                <h3>Bullpen ({bullpenSlots.length})</h3>
                <div className="rp-card-grid">
                    {bullpenSlots.map(slot => (
                        <div
                            key={slot.card.id}
                            className="rp-card filled"
                            draggable
                            onDragStart={(e) => handleBullpenDragStart(e, slot)}
                            onDragEnd={(e) => handleBullpenDragEnd(e, slot)}
                            onMouseEnter={() => handleMouseEnter(slot)}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className="rp-card-label">{slot.assignedPosition === 'Closer' ? 'CL' : 'RP'}</span>
                            <img src={slot.card.imagePath} alt="" className="rp-card-img" draggable={false} />
                            <span className="rp-card-name">{slot.card.name}</span>
                            <span className="rp-card-sub">{slot.card.points}pt</span>
                        </div>
                    ))}
                    {bullpenSlots.length + benchSlots.length < 7 && (
                        <div
                            className={`rp-card empty ${isActive({ type: 'bullpen' }) ? 'active' : ''} ${draggedCard && (eligibleSlots.has('Reliever') || eligibleSlots.has('Closer')) ? 'drop-target' : ''}`}
                            onClick={() => onSlotClick({ type: 'bullpen' })}
                            onDragOver={handleBullpenDragOver}
                            onDrop={handleBullpenDrop}
                        >
                            <div className="rp-card-empty">{draggedCard && (eligibleSlots.has('Reliever') || eligibleSlots.has('Closer')) ? 'Drop here' : '+ RP/CL'}</div>
                        </div>
                    )}
                </div>
            </div>

            {hoverCard && <CardTooltip card={hoverCard.card} />}
        </div>
    );
}
