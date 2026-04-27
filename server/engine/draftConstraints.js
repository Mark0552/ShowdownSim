/**
 * Server-side port of game/src/logic/draftConstraints.ts. Keep these two
 * files structurally identical so fixes can be ported back and forth.
 *
 * The server is the authority — every draft_pick action is re-validated
 * here against the same logic the client uses to grey out cards. The
 * client's filter is a UX hint; this is the gate.
 */

export const STARTER_HITTER_CAP = 9;
export const STARTER_PITCHER_CAP = 4;
export const FLEX_CAP = 7;
export const TOTAL_PICKS_PER_TEAM = STARTER_HITTER_CAP + STARTER_PITCHER_CAP + FLEX_CAP; // 20

const BACKUP_COST_DIVISOR = 5;
const HITTER_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH'];

// ---------------------------------------------------------------------------
// Position parsing — server has its own parsed cards (see init.js). The
// `card.positions` shape on the server is the same as the client's
// ParsedPosition[]: an array of { position, fielding } entries.
// ---------------------------------------------------------------------------

function canPlayPosition(positions, target) {
    if (!Array.isArray(positions)) return false;
    if (target === 'LF-RF') {
        return positions.some(p => p.position === 'LF' || p.position === 'RF');
    }
    return positions.some(p => p.position === target);
}

export function hitterFitsSlot(card, slot) {
    if (slot === '1B' || slot === 'DH') return true;
    if (slot === 'LF-RF-1' || slot === 'LF-RF-2') {
        return canPlayPosition(card.positions, 'LF-RF');
    }
    return canPlayPosition(card.positions, slot);
}

// ---------------------------------------------------------------------------
// Bipartite matching for the starting 9 hitter slate
// ---------------------------------------------------------------------------

export function hitterMatchingSize(hitters) {
    const slotAssignedTo = HITTER_SLOTS.map(() => null);
    let matched = 0;

    function tryAssign(hitterIdx, visited) {
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

export function hittersAreAssignable(hitters) {
    return hitterMatchingSize(hitters) === hitters.length;
}

// ---------------------------------------------------------------------------
// Cost / capacity
// ---------------------------------------------------------------------------

export function effectiveCost(card, bucket) {
    if (bucket === 'benchHitter') return Math.ceil(card.points / BACKUP_COST_DIVISOR);
    return card.points;
}

export function flexUsed(team) {
    return team.benchHitters.length + team.reliefPitchers.length;
}

function openBuckets(card, team) {
    const out = [];
    if (card.type === 'hitter') {
        if (team.starterHitters.length < STARTER_HITTER_CAP) out.push('starterHitter');
        if (flexUsed(team) < FLEX_CAP) out.push('benchHitter');
    } else {
        if (card.role === 'Starter') {
            if (team.starterPitchers.length < STARTER_PITCHER_CAP) out.push('starterPitcher');
        } else {
            if (flexUsed(team) < FLEX_CAP) out.push('reliefPitcher');
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Budget lower bound — same logic as the client port.
// ---------------------------------------------------------------------------

export function budgetLowerBound(team, availablePool) {
    const hittersNeeded = STARTER_HITTER_CAP - team.starterHitters.length;
    const spsNeeded = STARTER_PITCHER_CAP - team.starterPitchers.length;
    const flexNeeded = FLEX_CAP - flexUsed(team);

    const hitters = [];
    const sps = [];
    const flexCosts = [];
    for (const c of availablePool) {
        if (c.type === 'hitter') {
            hitters.push(c);
            flexCosts.push(Math.ceil(c.points / BACKUP_COST_DIVISOR));
        } else {
            if (c.role === 'Starter') sps.push(c);
            else flexCosts.push(c.points);
        }
    }

    function sumCheapestPoints(arr, n) {
        if (n <= 0) return 0;
        const sorted = [...arr].sort((a, b) => a.points - b.points);
        let sum = 0;
        for (let i = 0; i < Math.min(n, sorted.length); i++) sum += sorted[i].points;
        return sum;
    }
    function sumCheapestNumbers(arr, n) {
        if (n <= 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        let sum = 0;
        for (let i = 0; i < Math.min(n, sorted.length); i++) sum += sorted[i];
        return sum;
    }

    return (
        sumCheapestPoints(hitters, hittersNeeded) +
        sumCheapestPoints(sps, spsNeeded) +
        sumCheapestNumbers(flexCosts, flexNeeded)
    );
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

function getStartingHitterCards(team, allCards) {
    const byId = new Map(allCards.map(c => [c.id, c]));
    const out = [];
    for (const id of team.starterHitters) {
        const c = byId.get(id);
        if (c && c.type === 'hitter') out.push(c);
    }
    return out;
}

export function simulatePick(team, card, bucket) {
    const cost = effectiveCost(card, bucket);
    const next = {
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

export function buildAvailablePool(allCards, drafted) {
    return allCards.filter(c => !drafted.has(c.id));
}

export function checkEligibility(card, team, allCards, drafted, availablePool) {
    if (drafted.has(card.id)) {
        return { eligible: false, buckets: [], reason: 'drafted' };
    }
    const candidateBuckets = openBuckets(card, team);
    if (candidateBuckets.length === 0) {
        return { eligible: false, buckets: [], reason: 'no-bucket' };
    }
    const finalBuckets = [];
    for (const bucket of candidateBuckets) {
        if (bucket === 'starterHitter') {
            const current = getStartingHitterCards(team, allCards);
            const proposed = [...current, card];
            if (!hittersAreAssignable(proposed)) continue;
        }
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
        const hadStarterReject = candidateBuckets.includes('starterHitter');
        if (candidateBuckets.length === 1 && hadStarterReject) {
            const current = getStartingHitterCards(team, allCards);
            const proposed = [...current, card];
            if (!hittersAreAssignable(proposed)) {
                return { eligible: false, buckets: [], reason: 'matching' };
            }
        }
        return { eligible: false, buckets: [], reason: 'budget' };
    }
    return { eligible: true, buckets: finalBuckets };
}
