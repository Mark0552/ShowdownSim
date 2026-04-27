/**
 * Pure constraint engine for draft mode. No React, no Supabase, no DOM.
 * Used by:
 *   - Client UI to grey out cards that can't legally be picked
 *   - Server to validate every draft_pick action authoritatively
 *
 * Two layers of legality per pick:
 *   1. Hard rules (cheap to check): not drafted, fits an open bucket, fits cost
 *   2. Forward-looking feasibility: bipartite matching for the starting 9
 *      hitter slate, lower-bound budget for completing the roster.
 *
 * The bipartite check is exact; the budget check is a valid lower bound that
 * may occasionally let through a card the server then rejects on tighter
 * inspection. That's intentional — UI greying must never block legal picks.
 */

import type { Card, HitterCard, PitcherCard, FieldPosition } from '../types/cards';
import type { DraftBucket, DraftTeamState } from '../types/draft';
import { STARTER_HITTER_CAP, STARTER_PITCHER_CAP, FLEX_CAP } from '../types/draft';
import { canPlayPosition } from '../data/parsePosition';

export interface EligibilityResult {
    eligible: boolean;
    /** Buckets the card may legally fill (starter/bench/SP/RP) for this team. */
    buckets: DraftBucket[];
    /** Why this card is not eligible (only set when eligible=false). */
    reason?: 'drafted' | 'no-bucket' | 'matching' | 'budget';
}

const BACKUP_COST_DIVISOR = 5;

/** Cost the card incurs against the points cap given the bucket it fills. */
export function effectiveCost(card: Card, bucket: DraftBucket): number {
    if (bucket === 'benchHitter') return Math.ceil(card.points / BACKUP_COST_DIVISOR);
    return card.points;
}

/** Number of flex slots already used (bench + relief). */
export function flexUsed(team: DraftTeamState): number {
    return team.benchHitters.length + team.reliefPitchers.length;
}

/** Buckets this card *could* fill given current team capacity. Ignores cost. */
function openBuckets(card: Card, team: DraftTeamState): DraftBucket[] {
    const out: DraftBucket[] = [];
    if (card.type === 'hitter') {
        if (team.starterHitters.length < STARTER_HITTER_CAP) out.push('starterHitter');
        if (flexUsed(team) < FLEX_CAP) out.push('benchHitter');
    } else {
        const pitcher = card as PitcherCard;
        if (pitcher.role === 'Starter') {
            if (team.starterPitchers.length < STARTER_PITCHER_CAP) out.push('starterPitcher');
        } else {
            // Reliever or Closer — both go in flex
            if (flexUsed(team) < FLEX_CAP) out.push('reliefPitcher');
        }
    }
    return out;
}

// ============================================================================
// Bipartite matching for the starting 9 hitter slate
// ============================================================================

/** The 9 starting hitter slot keys (order-independent for matching). */
const HITTER_SLOTS: readonly string[] = [
    'C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH',
];

/** Whether a hitter card can legally fill a starting hitter slot. */
export function hitterFitsSlot(card: HitterCard, slot: string): boolean {
    if (slot === '1B' || slot === 'DH') return true;          // accept any hitter
    if (slot === 'LF-RF-1' || slot === 'LF-RF-2') {
        return canPlayPosition(card.positions, 'LF-RF');
    }
    return canPlayPosition(card.positions, slot as FieldPosition);
}

/**
 * Max bipartite matching size between a hitter set and the 9 hitter slots.
 * Hopcroft-Karp would be overkill — we have at most 9 hitters and 9 slots.
 * Simple Hungarian-flavoured DFS augmenting paths runs in microseconds here.
 */
export function hitterMatchingSize(hitters: HitterCard[]): number {
    const slotAssignedTo: (number | null)[] = HITTER_SLOTS.map(() => null);
    let matched = 0;

    function tryAssign(hitterIdx: number, visited: boolean[]): boolean {
        const hitter = hitters[hitterIdx];
        for (let s = 0; s < HITTER_SLOTS.length; s++) {
            if (visited[s]) continue;
            if (!hitterFitsSlot(hitter, HITTER_SLOTS[s])) continue;
            visited[s] = true;
            const occupant = slotAssignedTo[s];
            if (occupant === null || tryAssign(occupant, visited)) {
                slotAssignedTo[s] = hitterIdx;
                return true;
            }
        }
        return false;
    }

    for (let h = 0; h < hitters.length; h++) {
        const visited = HITTER_SLOTS.map(() => false);
        if (tryAssign(h, visited)) matched++;
    }
    return matched;
}

/**
 * Whether the given hitter set has a valid full assignment to the 9 slots
 * (or to N slots, if the set has N < 9 hitters). I.e., every hitter can be
 * placed somewhere distinct it's eligible for.
 */
export function hittersAreAssignable(hitters: HitterCard[]): boolean {
    return hitterMatchingSize(hitters) === hitters.length;
}

// ============================================================================
// Budget lower bound
// ============================================================================

/**
 * Lower bound on the total points needed to fill the team's remaining slots,
 * given the available card pool (everything not yet drafted).
 *
 * - Each remaining starter-hitter slot must be filled by a hitter at full cost.
 * - Each remaining SP slot must be filled by an SP at full cost.
 * - Each remaining flex slot is the cheaper of: a hitter at 1/5 cost, or
 *   an RP/CL at full cost.
 *
 * We sum the cheapest distinct cards in each pool. A given hitter may appear
 * in both the starter-hitter pool and the flex pool — that double-counting
 * makes the bound LOOSER (smaller), which keeps it a valid lower bound on
 * actual cost. Looseness is fine: server validates the final pick.
 */
export function budgetLowerBound(
    team: DraftTeamState,
    availablePool: Card[],
): number {
    const hittersNeeded = STARTER_HITTER_CAP - team.starterHitters.length;
    const spsNeeded = STARTER_PITCHER_CAP - team.starterPitchers.length;
    const flexNeeded = FLEX_CAP - flexUsed(team);

    // Pre-bucket the pool. (Cheapest-first sorting per bucket.)
    const hitters: HitterCard[] = [];
    const sps: PitcherCard[] = [];
    const flexCosts: number[] = []; // each entry = a possible flex-slot cost
    for (const c of availablePool) {
        if (c.type === 'hitter') {
            hitters.push(c);
            flexCosts.push(Math.ceil(c.points / BACKUP_COST_DIVISOR));
        } else {
            const p = c as PitcherCard;
            if (p.role === 'Starter') {
                sps.push(p);
            } else {
                flexCosts.push(p.points);
            }
        }
    }

    // Sum cheapest N from a sorted-by-points slice.
    function sumCheapest<T extends { points: number }>(arr: T[], n: number): number {
        if (n <= 0) return 0;
        const sorted = [...arr].sort((a, b) => a.points - b.points);
        let sum = 0;
        for (let i = 0; i < Math.min(n, sorted.length); i++) sum += sorted[i].points;
        return sum;
    }

    function sumCheapestNumbers(arr: number[], n: number): number {
        if (n <= 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        let sum = 0;
        for (let i = 0; i < Math.min(n, sorted.length); i++) sum += sorted[i];
        return sum;
    }

    return (
        sumCheapest(hitters, hittersNeeded) +
        sumCheapest(sps, spsNeeded) +
        sumCheapestNumbers(flexCosts, flexNeeded)
    );
}

// ============================================================================
// Top-level eligibility
// ============================================================================

/** All currently-drafted starting hitters as concrete card objects. */
function getStartingHitterCards(team: DraftTeamState, allCards: Card[]): HitterCard[] {
    const byId = new Map(allCards.map(c => [c.id, c]));
    const out: HitterCard[] = [];
    for (const id of team.starterHitters) {
        const c = byId.get(id);
        if (c && c.type === 'hitter') out.push(c);
    }
    return out;
}

/**
 * Decide whether `card` is a legal next pick for `team`, and if so which
 * buckets it could fill. The caller will narrow the choice via UI prompt
 * (e.g. "starter or bench?") when more than one bucket is returned.
 *
 * @param drafted set of card ids already drafted by *either* team
 * @param availablePool full card pool minus the ids in `drafted`
 *                      (caller computes once per pick to avoid re-filtering)
 */
export function checkEligibility(
    card: Card,
    team: DraftTeamState,
    allCards: Card[],
    drafted: Set<string>,
    availablePool: Card[],
): EligibilityResult {
    if (drafted.has(card.id)) {
        return { eligible: false, buckets: [], reason: 'drafted' };
    }

    const candidateBuckets = openBuckets(card, team);
    if (candidateBuckets.length === 0) {
        return { eligible: false, buckets: [], reason: 'no-bucket' };
    }

    // Bipartite matching check: only relevant if the card might go to
    // starterHitter. Adding a hitter that breaks the existing assignment
    // (e.g. 4th catcher when 1B and DH are already filled by 3 catchers)
    // is illegal even if there's a starter-hitter slot left.
    const finalBuckets: DraftBucket[] = [];
    for (const bucket of candidateBuckets) {
        if (bucket === 'starterHitter') {
            const current = getStartingHitterCards(team, allCards);
            const proposed = [...current, card as HitterCard];
            if (!hittersAreAssignable(proposed)) continue;
        }
        // Budget feasibility: post-pick remaining must be >= lower bound on
        // completing the rest. The pool used for the lower bound excludes
        // the pick itself, since after drafting it can't be redrafted.
        const cost = effectiveCost(card, bucket);
        if (cost > team.pointsRemaining) continue;

        const postBudget = team.pointsRemaining - cost;
        const postPool = availablePool.filter(c => c.id !== card.id);
        const postTeam = simulatePick(team, card, bucket);
        const lb = budgetLowerBound(postTeam, postPool);
        if (lb > postBudget) continue;

        finalBuckets.push(bucket);
    }

    if (finalBuckets.length === 0) {
        // Distinguish matching vs budget for nicer UI messages. Re-derive
        // the dominant reason from the candidate buckets we rejected.
        const hadStarterReject = candidateBuckets.includes('starterHitter');
        // If only the starter-hitter bucket existed and it failed matching, say so.
        if (candidateBuckets.length === 1 && hadStarterReject) {
            const current = getStartingHitterCards(team, allCards);
            const proposed = [...current, card as HitterCard];
            if (!hittersAreAssignable(proposed)) {
                return { eligible: false, buckets: [], reason: 'matching' };
            }
        }
        return { eligible: false, buckets: [], reason: 'budget' };
    }

    return { eligible: true, buckets: finalBuckets };
}

/**
 * Return a hypothetical team state after picking `card` into `bucket`.
 * Pure — does not mutate `team`.
 */
export function simulatePick(
    team: DraftTeamState,
    card: Card,
    bucket: DraftBucket,
): DraftTeamState {
    const cost = effectiveCost(card, bucket);
    const next: DraftTeamState = {
        pointsRemaining: team.pointsRemaining - cost,
        starterHitters: [...team.starterHitters],
        benchHitters: [...team.benchHitters],
        starterPitchers: [...team.starterPitchers],
        reliefPitchers: [...team.reliefPitchers],
    };
    switch (bucket) {
        case 'starterHitter':  next.starterHitters.push(card.id); break;
        case 'benchHitter':    next.benchHitters.push(card.id); break;
        case 'starterPitcher': next.starterPitchers.push(card.id); break;
        case 'reliefPitcher':  next.reliefPitchers.push(card.id); break;
    }
    return next;
}

/** Convenience: build the available pool from full card list + drafted set. */
export function buildAvailablePool(allCards: Card[], drafted: Set<string>): Card[] {
    return allCards.filter(c => !drafted.has(c.id));
}
