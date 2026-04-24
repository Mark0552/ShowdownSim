/**
 * Client mirror of server/engine/fielding.js — position eligibility + penalties.
 *
 * Used by the lineup builder, substitution modal (Phase 3), and any UI that
 * needs to validate or display the fielding penalty for a card playing a
 * given position.
 *
 * Convention (matches server):
 *   0  = on-card (no penalty)
 *  -1  = position-player at 1B (only voluntary OOP slot in the builder)
 *  -2  = similar position group (IF: 2B/3B/SS, OF: LF/CF/RF) OR DH-only at 1B
 *  -3  = cross-group OOP OR non-catcher at C
 *  G icon disabled if penalty < 0.
 */

import type { Card, HitterCard, PitcherCard } from '../types/cards';

export interface PenaltyResult {
    penalty: number;
    valid: boolean;
    reason: string;
}

export function normalizePosition(pos: string): string {
    return (pos || '').replace(/-\d+$/, '');
}

const SIMILAR_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
    new Set(['2B', '3B', 'SS']),
    new Set(['LF', 'CF', 'RF', 'LF-RF']),
];

function cardPositions(card: Card): { position: string; fielding: number }[] {
    if (card.type === 'hitter') {
        return (card as HitterCard).positions || [];
    }
    return [];
}

function cardCanPlayNatively(card: Card, position: string): boolean {
    const positions = cardPositions(card);
    if (position === 'LF-RF') {
        return positions.some(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF');
    }
    return positions.some(p => p.position === position);
}

function similarGroup(position: string): ReadonlySet<string> | null {
    const norm = normalizePosition(position);
    return SIMILAR_GROUPS.find(g => g.has(norm)) || null;
}

export function fieldingPenalty(card: Card | null | undefined, position: string): PenaltyResult {
    if (!card) return { penalty: 0, valid: false, reason: 'no card' };
    const pos = normalizePosition(position);

    if (pos === 'DH' || pos === 'bench' || !pos) {
        return { penalty: 0, valid: true, reason: 'DH/bench (no fielding)' };
    }
    if (cardCanPlayNatively(card, pos)) {
        return { penalty: 0, valid: true, reason: 'on card' };
    }
    if (card.type === 'pitcher') {
        return { penalty: 0, valid: false, reason: 'pitchers cannot play the field' };
    }

    if (pos === '1B') {
        const positions = cardPositions(card);
        const isPureDH = positions.length > 0 && positions.every(p => p.position === 'DH');
        const penalty = isPureDH ? -2 : -1;
        return { penalty, valid: true, reason: isPureDH ? 'DH at 1B' : 'position-player at 1B' };
    }

    if (pos === 'C') {
        return { penalty: -3, valid: true, reason: 'non-catcher at C' };
    }

    const group = similarGroup(pos);
    if (group) {
        const inSameGroup = cardPositions(card).some(p => group.has(normalizePosition(p.position)));
        if (inSameGroup) {
            return { penalty: -2, valid: true, reason: 'similar position' };
        }
    }

    return { penalty: -3, valid: true, reason: 'out of position' };
}

export function gIconEligible(card: Card | null | undefined, position: string): boolean {
    return fieldingPenalty(card, position).penalty === 0;
}

/** Same penalty rules as fieldingPenalty, but takes a raw positions array
 *  so it's callable on a live PlayerSlot (which doesn't carry a full Card). */
export function penaltyForAssignment(
    positions: { position: string; fielding: number }[] | undefined,
    assignedPosition: string | undefined,
): number {
    const pos = normalizePosition(assignedPosition || '');
    if (!pos || pos === 'DH' || pos === 'bench') return 0;
    const ps = positions || [];
    // Native?
    if (pos === 'LF-RF') {
        if (ps.some(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF')) return 0;
    } else if (ps.some(p => p.position === pos)) {
        return 0;
    }
    // 1B legal-with-penalty
    if (pos === '1B') {
        const isPureDH = ps.length > 0 && ps.every(p => p.position === 'DH');
        return isPureDH ? -2 : -1;
    }
    // Non-catcher at C
    if (pos === 'C') return -3;
    // Similar group — forced case
    const grp = SIMILAR_GROUPS.find(g => g.has(pos));
    if (grp && ps.some(p => grp.has(normalizePosition(p.position)))) return -2;
    // Cross-group — forced case
    return -3;
}

/**
 * Raw fielding/arm value the card brings to a given slot, derived from its
 * native positions list. Returns 0 for OOP placements (the player has no
 * native fielding at that slot) and for DH / bench.
 *
 * Catcher arm and infield/outfield fielding are stored under the same
 * `fielding` key on each ParsedPosition entry — this helper returns that
 * raw number; callers decide whether to count it as arm or fielding based
 * on the slot's normalized position.
 */
export function rawFieldingForAssignment(
    positions: { position: string; fielding: number }[] | undefined,
    assignedPosition: string | undefined,
): number {
    const pos = normalizePosition(assignedPosition || '');
    if (!pos || pos === 'DH' || pos === 'bench') return 0;
    const ps = positions || [];
    if (pos === 'LF-RF') {
        const match = ps.find(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF');
        return match?.fielding ?? 0;
    }
    const match = ps.find(p => p.position === pos);
    return match?.fielding ?? 0;
}

// Re-export type aliases used by callers
export type { PitcherCard };
