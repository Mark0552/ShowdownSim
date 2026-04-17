/**
 * Fielding position helpers.
 */

export function getFieldingFromSlot(positions, assignedPos) {
    if (!positions || !assignedPos || assignedPos === 'bench' || assignedPos === 'DH') return 0;
    const normalized = assignedPos.replace(/-\d+$/, '');
    if (normalized === 'LF-RF') {
        const match = positions.find(p => p.position === 'LF' || p.position === 'RF');
        return match ? match.fielding : 0;
    }
    const match = positions.find(p => p.position === normalized);
    return match ? match.fielding : 0;
}

export const INFIELD_POSITIONS = ['1B', '2B', '3B', 'SS']; // C has 0 fielding for IF total
export const OUTFIELD_POSITIONS = ['LF', 'CF', 'RF', 'LF-RF'];

export function computeFieldingTotals(lineup) {
    let inf = 0, outf = 0, catcherArm = 0;
    for (const p of lineup) {
        const slot = p.assignedPosition || '';
        const pos = slot.replace(/-\d+$/, '');
        // Phase 6: out-of-position penalty added to the player's contribution.
        // p.fielding / p.arm were set at init via getFieldingFromSlot which
        // returns 0 for non-native positions; the penalty function adds the
        // -1/-2/-3 modifier for similar/cross/catcher swaps.
        const { penalty } = fieldingPenalty(p, slot);
        if (pos === 'C') {
            catcherArm = (p.arm || 0) + penalty;
        } else if (INFIELD_POSITIONS.includes(pos)) {
            inf += (p.fielding || 0) + penalty;
        } else if (OUTFIELD_POSITIONS.includes(pos)) {
            outf += (p.fielding || 0) + penalty;
        }
    }
    return { totalInfieldFielding: inf, totalOutfieldFielding: outf, catcherArm };
}

// ============================================================================
// POSITION ELIGIBILITY + PENALTIES
// Used for: substitutions out-of-position, lineup builder validation, G icon gating.
// ============================================================================

/** Strip slot suffix (e.g. "LF-RF-2" → "LF-RF"). */
export function normalizePosition(pos) {
    return (pos || '').replace(/-\d+$/, '');
}

const SIMILAR_GROUPS = [
    new Set(['2B', '3B', 'SS']),         // middle/corner infielders interchangeable
    new Set(['LF', 'CF', 'RF', 'LF-RF']),// outfielders interchangeable
];

/** Does the card list this exact position (or LF/RF for LF-RF slot)? */
function cardCanPlayNatively(card, position) {
    const positions = card.positions || [];
    if (position === 'LF-RF') {
        return positions.some(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF');
    }
    return positions.some(p => p.position === position);
}

/** Returns the same group as `position` if any. */
function similarGroup(position) {
    const norm = normalizePosition(position);
    return SIMILAR_GROUPS.find(g => g.has(norm)) || null;
}

/**
 * Compute fielding penalty for a card playing a given position.
 * Returns { penalty, valid, reason }.
 *   penalty:  0 / -1 / -2 / -3   (added to fielding for that play)
 *   valid:    true unless the assignment is forbidden
 *   reason:   short string for UI display
 *
 * Convention:
 *   0  = on-card (no penalty)
 *  -1  = similar position group  OR  position-player at 1B (rulebook)
 *  -2  = cross-group  OR  DH at 1B (rulebook)
 *  -3  = non-catcher at C  (catching needs gear and skills)
 *  Pitchers do not field except as P; placing a pitcher elsewhere returns invalid.
 *  P slot is reserved for the active pitcher (not handled by this function).
 *
 * G icon: callers should treat any penalty < 0 as disabling the G icon at that slot.
 */
export function fieldingPenalty(card, position) {
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

    // 1B special case (matches existing rulebook handling)
    if (pos === '1B') {
        const isPureDH = (card.positions || []).every(p => p.position === 'DH');
        const penalty = isPureDH ? -2 : -1;
        return { penalty, valid: true, reason: isPureDH ? 'DH at 1B' : 'position-player at 1B' };
    }

    // Catcher: any non-catcher takes -3
    if (pos === 'C') {
        return { penalty: -3, valid: true, reason: 'non-catcher at C' };
    }

    // Same similarity group (IF/OF) — small penalty
    const group = similarGroup(pos);
    if (group) {
        const cardInSameGroup = (card.positions || []).some(p => group.has(normalizePosition(p.position)));
        if (cardInSameGroup) {
            return { penalty: -1, valid: true, reason: 'similar position' };
        }
    }

    // Cross-group out of position
    return { penalty: -2, valid: true, reason: 'out of position' };
}

/** True if the card can use a G icon at this position (no penalty applies). */
export function gIconEligible(card, position) {
    const { penalty } = fieldingPenalty(card, position);
    return penalty === 0;
}

// ============================================================================
// FIELDING ALIGNMENT + ROSTER (Phase 1 of substitution refactor)
// fieldingAt: defensive alignment as a separate concept from the batting order.
// roster: cardId → player lookup across lineup + bench + pitcher + bullpen.
// Both are derived from the existing lineup/pitcher/bench/bullpen arrays today;
// they will become primary state once substitutions can manipulate fielding
// independently of the batting order (double switches, position swaps, etc.).
// ============================================================================

/** Build fieldingAt: { [slotKey]: cardId } from the active lineup + pitcher.
 *  Slot keys mirror what the team-builder uses: P, C, 1B, 2B, 3B, SS, LF-RF-1, LF-RF-2, CF, DH. */
export function buildFieldingAt(team) {
    const at = { P: team.pitcher?.cardId };
    for (const p of team.lineup || []) {
        const slot = p.assignedPosition || '';
        if (!slot || slot === 'bench') continue;
        // assignedPosition for lineup spots is the slot key already (e.g. "LF-RF-1")
        at[slot] = p.cardId;
    }
    return at;
}

/** Build roster: cardId → player object across all sources. */
export function buildRoster(team) {
    const roster = {};
    if (team.pitcher) roster[team.pitcher.cardId] = team.pitcher;
    for (const p of team.lineup || []) roster[p.cardId] = p;
    for (const p of team.bench || []) roster[p.cardId] = p;
    for (const p of team.bullpen || []) roster[p.cardId] = p;
    return roster;
}

/** Recompute the team's fieldingAt + roster fields. Call after any substitution. */
export function rebuildAlignment(team) {
    return {
        ...team,
        fieldingAt: buildFieldingAt(team),
        roster: buildRoster(team),
    };
}
