import { useState, useRef } from 'react';
import type { TeamStore } from '../../store/teamStore';
import type { DragStore } from '../../store/dragStore';
import type { SlotSelection } from './RosterPanel';
import type { RosterSlot } from '../../types/team';
import { getEffectivePoints } from '../../logic/teamRules';
import CardTooltip from '../cards/CardTooltip';
import './BenchPanel.css';

interface Props {
    teamStore: TeamStore;
    dragStore: DragStore;
    activeSlot: SlotSelection | null;
    onSlotClick: (slot: SlotSelection | null) => void;
}

export default function BenchPanel({ teamStore, dragStore, activeSlot, onSlotClick }: Props) {
    const { benchSlots, bullpenSlots, removeCard, addToSlot } = teamStore;
    const { draggedCard, eligibleSlots, startDrag, endDrag } = dragStore;
    const [hoverCard, setHoverCard] = useState<RosterSlot | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remaining = 7 - bullpenSlots.length - benchSlots.length;

    const handleMouseEnter = (slot: RosterSlot) => {
        if (draggedCard) return;
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(slot), 400);
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    const handleBenchDragStart = (e: React.DragEvent, slot: RosterSlot) => {
        e.dataTransfer.setData('application/card-id', slot.card.id);
        e.dataTransfer.setData('application/source-slot', slot.assignedPosition);
        e.dataTransfer.effectAllowed = 'move';
        startDrag(slot.card);
        setHoverCard(null);
    };

    const handleBenchDragEnd = (e: React.DragEvent, slot: RosterSlot) => {
        endDrag();
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const isInsideRoster = dropTarget?.closest('.lineup-bar, .roster-panel, .bench-panel');
        if (!isInsideRoster) removeCard(slot.card.id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (draggedCard && eligibleSlots.has('bench')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const sourceSlot = e.dataTransfer.getData('application/source-slot');
        if (draggedCard && eligibleSlots.has('bench')) {
            if (sourceSlot) removeCard(draggedCard.id);
            addToSlot(draggedCard, 'bench');
            endDrag();
        }
    };

    const isDropTarget = draggedCard && eligibleSlots.has('bench');

    return (
        <div className="bench-panel">
            <h3>Bench ({benchSlots.length})</h3>
            <div className="bench-grid">
                {benchSlots.map(slot => (
                    <div
                        key={slot.card.id}
                        className="bench-card filled"
                        draggable
                        onDragStart={(e) => handleBenchDragStart(e, slot)}
                        onDragEnd={(e) => handleBenchDragEnd(e, slot)}
                        onMouseEnter={() => handleMouseEnter(slot)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <img src={slot.card.imagePath} alt="" className="bench-img" draggable={false} />
                        <span className="bench-name">{slot.card.name}</span>
                        <span className="bench-pts">{getEffectivePoints(slot)}pt (1/5)</span>
                    </div>
                ))}
                {remaining > 0 && (
                    <div
                        className={`bench-card empty ${activeSlot?.type === 'bench' ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                        onClick={() => onSlotClick({ type: 'bench' })}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <div className="bench-empty">{isDropTarget ? 'Drop here' : `+ ${remaining} slots`}</div>
                    </div>
                )}
            </div>

            {hoverCard && <CardTooltip card={hoverCard.card} />}
        </div>
    );
}
