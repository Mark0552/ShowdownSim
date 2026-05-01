import type { PlayerSlot } from '../../engine/gameEngine';

interface CardSlotProps {
    x: number;
    y: number;
    label: string;
    card: PlayerSlot | null;
    labelBelow?: boolean;
    labelAbove?: boolean;
    labelText?: string;
    onHover?: (player: PlayerSlot, e: React.MouseEvent<SVGGElement>) => void;
    onLeave?: () => void;
}

/** Card slot with corner brackets and glow — shows card image if occupied */
export default function CardSlot({ x, y, label, card, labelBelow, labelAbove, labelText, onHover, onLeave }: CardSlotProps) {
    const w = 76, h = 106;
    return (
        <g
            cursor={card ? 'pointer' : undefined}
            onMouseEnter={card && onHover ? (e) => onHover(card, e as any) : undefined}
            onMouseLeave={card && onLeave ? onLeave : undefined}
        >
            {/* Single backdrop rect — was previously two rects with the
                bottom one offset by (3, 3) to fake a drop shadow, but the
                offset put the visible gray rectangle 3px past the main
                rect on the right + bottom while the corner brackets stayed
                anchored to the main rect. The brackets ended up sitting
                inside the visible card extent on those two sides, looking
                misaligned. The cardGlow filter still provides depth. */}
            <rect x={x} y={y} width={w} height={h} rx="6" fill="rgba(0,0,0,0.55)" stroke="#f0e8c0" strokeWidth="2.2" strokeDasharray="6,4" opacity="0.88" filter="url(#cardGlow)"/>
            <path d={`M ${x} ${y} l 10 0 M ${x} ${y} l 0 10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x+w} ${y} l -10 0 M ${x+w} ${y} l 0 10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x} ${y+h} l 10 0 M ${x} ${y+h} l 0 -10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x+w} ${y+h} l -10 0 M ${x+w} ${y+h} l 0 -10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            {!card && (
                <text x={x + w/2} y={y + h/2 + 5} textAnchor="middle" fontSize="14" fill="#f0e8c038" fontWeight="bold" fontFamily="Arial Black">{label}</text>
            )}
            {card && card.imagePath && (
                <image href={card.imagePath} x={x + 3} y={y + 3} width={w - 6} height={h - 6} preserveAspectRatio="xMidYMid slice"/>
            )}
            {labelText && labelBelow && (
                <text x={x + w/2} y={y + h + 18} textAnchor="middle" fontSize="11" fill="#ffffffaa" fontWeight="bold" fontFamily="Arial Black">{labelText}</text>
            )}
            {labelText && labelAbove && (
                <text x={x + w/2} y={y - 8} textAnchor="middle" fontSize="11" fill="#ffffffaa" fontWeight="bold" fontFamily="Arial Black">{labelText}</text>
            )}
        </g>
    );
}
