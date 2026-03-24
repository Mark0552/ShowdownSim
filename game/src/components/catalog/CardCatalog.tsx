import { useState, useRef } from 'react';
import type { Card, HitterCard, PitcherCard } from '../../types/cards';
import type { DragStore } from '../../store/dragStore';
import CardTooltip from '../cards/CardTooltip';
import './CardCatalog.css';

interface Props {
    cards: Card[];
    rosterCardIds: Set<string>;
    onAddCard: (card: Card) => void;
    addLabel?: string;
    dragStore: DragStore;
}

export default function CardCatalog({ cards, rosterCardIds, onAddCard, addLabel = '+ Add', dragStore }: Props) {
    const [hoverCard, setHoverCard] = useState<Card | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleDragStart = (e: React.DragEvent, card: Card) => {
        e.dataTransfer.setData('application/card-id', card.id);
        e.dataTransfer.effectAllowed = 'copyMove';
        dragStore.startDrag(card);
        setHoverCard(null);
    };

    const handleDragEnd = () => {
        dragStore.endDrag();
    };

    const handleMouseEnter = (card: Card) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(card), 400);
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    return (
        <div className="card-catalog">
            <div className="catalog-grid">
                {cards.map(card => {
                    const onRoster = rosterCardIds.has(card.id);
                    return (
                        <div
                            key={card.id}
                            className={`catalog-card ${onRoster ? 'on-roster' : ''}`}
                            draggable={!onRoster}
                            onDragStart={(e) => handleDragStart(e, card)}
                            onDragEnd={handleDragEnd}
                            onMouseEnter={() => handleMouseEnter(card)}
                            onMouseLeave={handleMouseLeave}
                        >
                            <img
                                src={card.imagePath}
                                alt={card.name}
                                loading="lazy"
                                className="catalog-card-img"
                                draggable={false}
                            />
                            <div className="catalog-card-info">
                                <div className="catalog-card-name">{card.name}</div>
                                <div className="catalog-card-meta">
                                    <span>{card.team}</span>
                                    <span className="card-points">{card.points} pt</span>
                                </div>
                                <div className="catalog-card-meta">
                                    <span className="card-edition">{card.edition}</span>
                                    <span>{card.year}</span>
                                    {card.type === 'hitter' ? (
                                        <span>OB: {(card as HitterCard).onBase}</span>
                                    ) : (
                                        <span>Ctrl: {(card as PitcherCard).control}</span>
                                    )}
                                </div>
                                {card.type === 'hitter' && (
                                    <div className="catalog-card-meta">
                                        <span>{(card as HitterCard).positions.map(p => p.position).join('/')}</span>
                                    </div>
                                )}
                                {card.type === 'pitcher' && (
                                    <div className="catalog-card-meta">
                                        <span>{(card as PitcherCard).role}</span>
                                        <span>IP: {(card as PitcherCard).ip}</span>
                                    </div>
                                )}
                                {onRoster && <div className="on-roster-badge">On Roster</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {hoverCard && <CardTooltip card={hoverCard} />}
        </div>
    );
}
