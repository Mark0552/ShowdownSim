import { useMemo, useState } from 'react';
import type { RosterSlot } from '../../types/team';

interface Props {
    slots: RosterSlot[];
    lineupSlots: RosterSlot[];
    onReorder: (orderedCardIds: string[]) => void;
}

export default function BattingOrder({ slots, lineupSlots, onReorder }: Props) {
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    // Available hitters not yet in lineup (field position players)
    const availableForLineup = useMemo(() =>
        slots.filter(s =>
            s.card.type === 'hitter' &&
            s.assignedPosition !== 'bench' &&
            s.battingOrder === null
        ), [slots]);

    const lineupIds = lineupSlots.map(s => s.card.id);

    const addToLineup = (cardId: string) => {
        onReorder([...lineupIds, cardId]);
    };

    const removeFromLineup = (cardId: string) => {
        onReorder(lineupIds.filter(id => id !== cardId));
    };

    // Drag and drop reordering
    const handleDragStart = (idx: number) => {
        setDragIdx(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) return;
        const newOrder = [...lineupIds];
        const [moved] = newOrder.splice(dragIdx, 1);
        newOrder.splice(idx, 0, moved);
        onReorder(newOrder);
        setDragIdx(idx);
    };

    const handleDragEnd = () => {
        setDragIdx(null);
    };

    return (
        <div className="batting-order">
            {lineupSlots.length === 0 && (
                <div className="bo-empty">Fill field positions first, then add players to the batting order below.</div>
            )}

            {/* Current lineup — draggable */}
            {lineupSlots.map((slot, idx) => (
                <div
                    key={slot.card.id}
                    className={`bo-slot ${dragIdx === idx ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                >
                    <span className="bo-num">{idx + 1}</span>
                    <span className="bo-name">{slot.card.name}</span>
                    <span className="bo-pos">{slot.assignedPosition}</span>
                    <button className="rp-remove" onClick={() => removeFromLineup(slot.card.id)}>X</button>
                    <span className="bo-grip">&#x2630;</span>
                </div>
            ))}

            {/* Available players to add */}
            {availableForLineup.length > 0 && lineupSlots.length < 9 && (
                <div className="bo-available">
                    <div className="bo-available-label">Add to lineup ({9 - lineupSlots.length} remaining):</div>
                    {availableForLineup.map(slot => (
                        <button
                            key={slot.card.id}
                            className="bo-add-btn"
                            onClick={() => addToLineup(slot.card.id)}
                        >
                            {slot.card.name} ({slot.assignedPosition})
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
