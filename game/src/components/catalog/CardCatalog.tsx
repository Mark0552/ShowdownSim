import { useState, useRef, useEffect } from 'react';
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

    // Mobile breakpoint — on mobile we suppress the hover-tooltip entirely
    // because (a) the catalog tile itself already shows full card info
    // (image, chart, stats) inline and (b) iOS fires hover-on-tap which
    // races the tap-to-add and surfaces a useless modal the user then has
    // to dismiss after every add. Killing the tooltip on mobile is the
    // single biggest UX win for builder browsing on a phone.
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches
    );
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 899px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const handleDragStart = (e: React.DragEvent, card: Card) => {
        e.dataTransfer.setData('application/card-id', card.id);
        e.dataTransfer.effectAllowed = 'copyMove';
        dragStore.startDrag(card);
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    const handleDragEnd = () => {
        dragStore.endDrag();
    };

    const handleMouseEnter = (card: Card) => {
        // Tooltip only on desktop — see isMobile comment above.
        if (isMobile) return;
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(card), 400);
    };

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    // Clear hover when the card list changes and no longer includes the
    // currently-hovered card (e.g. filter change drops it from the grid).
    useEffect(() => {
        if (hoverCard && !cards.some(c => c.id === hoverCard.id)) {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            setHoverCard(null);
        }
    }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

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
                            // Tap-to-add: when an empty slot is active in
                            // RosterPanel/LineupBar/BenchPanel, tapping a
                            // catalog card fires onAddCard which routes the
                            // card to that slot. Touch users rely on this
                            // entirely (HTML5 DnD is unreliable on iOS
                            // Safari); desktop users get tap-to-add as a
                            // bonus alongside drag-to-add. Clicking an
                            // already-on-roster card is a no-op.
                            onClick={() => { if (!onRoster) onAddCard(card); }}
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
                                    <span className="card-edition">{card.edition}</span>
                                    <span>{card.year}</span>
                                </div>
                                {card.type === 'hitter' ? (
                                    <div className="catalog-card-meta">
                                        <span>OB: {(card as HitterCard).onBase}</span>
                                        <span>Spd: {(card as HitterCard).speed}</span>
                                        <span>{card.hand}</span>
                                        <span>{(card as HitterCard).positions.map(p => `${p.position}+${p.fielding}`).join(', ') || 'DH'}</span>
                                        {card.icons.length > 0 && <span>{card.icons.join(' ')}</span>}
                                    </div>
                                ) : (
                                    <div className="catalog-card-meta">
                                        <span>Ctrl: {(card as PitcherCard).control}</span>
                                        <span>IP: {(card as PitcherCard).ip}</span>
                                        <span>{card.hand}</span>
                                        <span>{(card as PitcherCard).role}</span>
                                        {card.icons.length > 0 && <span>{card.icons.join(' ')}</span>}
                                    </div>
                                )}
                                {/* Chart table — sits inside the right info column, pushed
                                    to the bottom via margin-top: auto so it aligns with
                                    the bottom of the image and removes the dead space. */}
                                <div className="catalog-card-chart">
                                    {card.type === 'hitter' ? (
                                        <table>
                                            <thead>
                                                <tr>
                                                    {['SO','GB','FB','W','S','S+','DB','TR','HR'].map(l => <th key={l}>{l}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    {[(card as HitterCard).chart.SO, (card as HitterCard).chart.GB, (card as HitterCard).chart.FB, (card as HitterCard).chart.W, (card as HitterCard).chart.S, (card as HitterCard).chart.SPlus, (card as HitterCard).chart.DB, (card as HitterCard).chart.TR, (card as HitterCard).chart.HR].map((v, i) => <td key={i}>{v || '-'}</td>)}
                                                </tr>
                                            </tbody>
                                        </table>
                                    ) : (
                                        <table>
                                            <thead>
                                                <tr>
                                                    {['PU','SO','GB','FB','W','S','DB','HR'].map(l => <th key={l}>{l}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    {[(card as PitcherCard).chart.PU, (card as PitcherCard).chart.SO, (card as PitcherCard).chart.GB, (card as PitcherCard).chart.FB, (card as PitcherCard).chart.W, (card as PitcherCard).chart.S, (card as PitcherCard).chart.DB, (card as PitcherCard).chart.HR].map((v, i) => <td key={i}>{v || '-'}</td>)}
                                                </tr>
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                {onRoster && <div className="on-roster-badge">On Roster</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {hoverCard && !isMobile && <CardTooltip card={hoverCard} />}
        </div>
    );
}
