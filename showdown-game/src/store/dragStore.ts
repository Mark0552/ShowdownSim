import { useState, useCallback } from 'react';
import type { Card, HitterCard, PitcherCard } from '../types/cards';
import { LINEUP_SLOT_DEFS, STARTER_SLOT_DEFS } from '../types/team';
import { canPlayPosition } from '../data/parsePosition';
import type { FieldPosition } from '../types/cards';

export function useDragStore() {
    const [draggedCard, setDraggedCard] = useState<Card | null>(null);

    const startDrag = useCallback((card: Card) => setDraggedCard(card), []);
    const endDrag = useCallback(() => setDraggedCard(null), []);

    // Which slots can accept this card?
    const getEligibleSlots = useCallback((card: Card | null): Set<string> => {
        if (!card) return new Set();
        const eligible = new Set<string>();

        if (card.type === 'hitter') {
            const h = card as HitterCard;
            for (const def of LINEUP_SLOT_DEFS) {
                if (def.filterPos === 'DH') {
                    eligible.add(def.key); // any hitter can DH
                } else if (def.filterPos === 'LF-RF') {
                    if (canPlayPosition(h.positions, 'LF') || canPlayPosition(h.positions, 'RF') || canPlayPosition(h.positions, 'LF-RF' as FieldPosition)) {
                        eligible.add(def.key);
                    }
                } else {
                    if (canPlayPosition(h.positions, def.filterPos as FieldPosition)) {
                        eligible.add(def.key);
                    }
                }
            }
            eligible.add('bench');
        } else {
            const p = card as PitcherCard;
            if (p.role === 'Starter') {
                for (const def of STARTER_SLOT_DEFS) eligible.add(def.key);
            }
            if (p.role === 'Reliever' || p.role === 'Closer') {
                eligible.add('Reliever');
                eligible.add('Closer');
                eligible.add('bullpen'); // generic bullpen drop target
            }
            // Any pitcher can also go to bench
            eligible.add('bench');
        }

        return eligible;
    }, []);

    const eligibleSlots = getEligibleSlots(draggedCard);

    return { draggedCard, eligibleSlots, startDrag, endDrag };
}

export type DragStore = ReturnType<typeof useDragStore>;
