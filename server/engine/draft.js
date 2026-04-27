/**
 * Server-authoritative draft state machine. Lives outside the play engine
 * (engine/index.js) — drafting is a different state machine from in-game
 * play, with its own actions and transitions.
 *
 * Status flow on the games row:
 *   waiting -> drafting -> setting_lineup -> in_progress (active) -> finished
 * (lineup-mode games skip drafting + setting_lineup.)
 *
 * This module exports:
 *   - initializeDraft(allCards): build empty DraftState for a new draft
 *   - applyPick(state, pick, allCards): validated pick application
 *   - isDraftComplete(state)
 *   - whoseDraftTurn(state)
 */

import {
    STARTER_HITTER_CAP, STARTER_PITCHER_CAP, FLEX_CAP, TOTAL_PICKS_PER_TEAM,
    checkEligibility, simulatePick, buildAvailablePool,
} from './draftConstraints.js';

const POINTS_CAP = 5000;

/**
 * Snake order with home picking 1st overall. Pattern: 1,2,2,1,1,2,2,1,1,...
 * For 40 picks (20/team) the order ends with home as well — see the client's
 * buildSnakeOrder and its tests for the verification.
 */
export function buildSnakeOrder(totalPicks = TOTAL_PICKS_PER_TEAM * 2) {
    const order = [];
    for (let i = 0; i < totalPicks; i++) {
        const pairIndex = Math.floor((i + 1) / 2);
        order.push(pairIndex % 2 === 0 ? 'home' : 'away');
    }
    return order;
}

function emptyTeam() {
    return {
        pointsRemaining: POINTS_CAP,
        starterHitters: [],
        benchHitters: [],
        starterPitchers: [],
        reliefPitchers: [],
    };
}

export function initializeDraft() {
    return {
        type: 'draft',
        pickOrder: buildSnakeOrder(),
        pickIndex: 0,
        home: emptyTeam(),
        away: emptyTeam(),
        picks: [],
    };
}

export function whoseDraftTurn(state) {
    if (isDraftComplete(state)) return null;
    return state.pickOrder[state.pickIndex];
}

export function isDraftComplete(state) {
    return state.pickIndex >= state.pickOrder.length;
}

/**
 * Validate + apply a DRAFT_PICK action. Returns the new state, or throws an
 * Error with a user-readable message.
 *
 * @param state    current draft state
 * @param action   { type: 'DRAFT_PICK', actor: 'home'|'away', cardId, bucket }
 *                 bucket is one of: 'starterHitter' | 'benchHitter'
 *                                 | 'starterPitcher' | 'reliefPitcher'
 *                 The client sends bucket explicitly because the
 *                 starter-vs-bench choice for hitters is a UI prompt — the
 *                 server doesn't infer it.
 * @param allCards full card pool (loaded once at server startup)
 */
export function applyDraftPick(state, action, allCards) {
    if (isDraftComplete(state)) {
        throw new Error('Draft is already complete');
    }
    const expectedActor = whoseDraftTurn(state);
    if (action.actor !== expectedActor) {
        throw new Error(`Not your pick — waiting for ${expectedActor}`);
    }

    const card = allCards.find(c => c.id === action.cardId);
    if (!card) throw new Error(`Unknown card: ${action.cardId}`);

    const team = state[action.actor];
    const drafted = collectDraftedIds(state);
    const pool = buildAvailablePool(allCards, drafted);
    const result = checkEligibility(card, team, allCards, drafted, pool);
    if (!result.eligible) {
        throw new Error(`Pick rejected: ${result.reason || 'ineligible'}`);
    }
    if (!result.buckets.includes(action.bucket)) {
        throw new Error(`Bucket '${action.bucket}' not available for this card`);
    }

    const newTeam = simulatePick(team, card, action.bucket);
    const next = {
        ...state,
        [action.actor]: newTeam,
        pickIndex: state.pickIndex + 1,
        picks: [
            ...state.picks,
            {
                pickNumber: state.pickIndex + 1,
                actor: action.actor,
                cardId: card.id,
                bucket: action.bucket,
            },
        ],
    };
    return next;
}

function collectDraftedIds(state) {
    const s = new Set();
    for (const id of state.home.starterHitters) s.add(id);
    for (const id of state.home.benchHitters) s.add(id);
    for (const id of state.home.starterPitchers) s.add(id);
    for (const id of state.home.reliefPitchers) s.add(id);
    for (const id of state.away.starterHitters) s.add(id);
    for (const id of state.away.benchHitters) s.add(id);
    for (const id of state.away.starterPitchers) s.add(id);
    for (const id of state.away.reliefPitchers) s.add(id);
    return s;
}

// ---------------------------------------------------------------------------
// Convert drafted rosters to Team-shaped lineup data for initializeGame.
// Position assignments are a default valid configuration; the post-draft
// set-lineup screen lets each player override before submitting.
// ---------------------------------------------------------------------------

const HITTER_SLOTS = ['C', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', '1B', 'DH'];
// Order matters: try the strict-fit slots first (C, 2B, 3B, SS, OF, CF), then
// fall back to 1B and DH which accept any hitter. This greedy assignment is
// guaranteed to succeed because the constraint engine never lets a draft
// reach completion in a state where bipartite matching would fail.

function canPlayPosition(positions, target) {
    if (!Array.isArray(positions)) return false;
    if (target === 'LF-RF') return positions.some(p => p.position === 'LF' || p.position === 'RF');
    return positions.some(p => p.position === target);
}
function hitterFitsSlot(card, slot) {
    if (slot === '1B' || slot === 'DH') return true;
    if (slot === 'LF-RF-1' || slot === 'LF-RF-2') return canPlayPosition(card.positions, 'LF-RF');
    return canPlayPosition(card.positions, slot);
}

/** Greedy bipartite assignment via augmenting paths — same shape as the
 *  matching check in draftConstraints. Returns null if no full assignment
 *  exists (shouldn't happen for completed drafts; defensive). */
function assignHittersToSlots(hitters) {
    const slotAssigned = HITTER_SLOTS.map(() => null); // holds hitter index
    function tryAssign(idx, visited) {
        for (let s = 0; s < HITTER_SLOTS.length; s++) {
            if (visited[s]) continue;
            if (!hitterFitsSlot(hitters[idx], HITTER_SLOTS[s])) continue;
            visited[s] = true;
            const occupant = slotAssigned[s];
            if (occupant === null || tryAssign(occupant, visited)) {
                slotAssigned[s] = idx;
                return true;
            }
        }
        return false;
    }
    for (let h = 0; h < hitters.length; h++) {
        if (!tryAssign(h, HITTER_SLOTS.map(() => false))) return null;
    }
    const result = {};
    for (let s = 0; s < HITTER_SLOTS.length; s++) {
        const hIdx = slotAssigned[s];
        if (hIdx !== null) result[HITTER_SLOTS[s]] = hitters[hIdx].id;
    }
    return result;
}

/**
 * Validate a player-submitted lineup for a drafted team. Returns the
 * normalised lineup on success, or throws an Error.
 *
 * Required:
 *   - lineup.slots is an array of exactly 20 entries
 *   - the set of card ids equals the set of drafted card ids for this team
 *   - each starter hitter has assignedPosition in the 9 starting slot keys
 *   - each starter pitcher has assignedPosition 'Starter-1'..'Starter-4'
 *     (each used exactly once)
 *   - each relief pitcher has assignedPosition 'Reliever' or 'Closer'
 *   - each bench hitter has assignedPosition 'bench'
 *   - 9 batters have batting order 1..9 (each used exactly once); the rest null
 *   - position eligibility: each starter hitter can play their assigned
 *     position (with the standard 1B/DH-accept-anything carve-out)
 */
const STARTING_HITTER_SLOT_KEYS = new Set([
    'C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH',
]);

export function validateSubmittedLineup(lineup, draftTeam, allCards) {
    if (!lineup || !Array.isArray(lineup.slots)) {
        throw new Error('Invalid lineup: missing slots');
    }
    if (lineup.slots.length !== 20) {
        throw new Error(`Invalid lineup: expected 20 slots, got ${lineup.slots.length}`);
    }

    const draftedIds = new Set([
        ...draftTeam.starterHitters,
        ...draftTeam.benchHitters,
        ...draftTeam.starterPitchers,
        ...draftTeam.reliefPitchers,
    ]);
    const lineupIds = new Set();
    for (const slot of lineup.slots) {
        if (!slot.card?.id) throw new Error('Slot missing card.id');
        if (lineupIds.has(slot.card.id)) {
            throw new Error(`Duplicate card in lineup: ${slot.card.id}`);
        }
        lineupIds.add(slot.card.id);
    }
    if (draftedIds.size !== lineupIds.size) {
        throw new Error('Lineup card set does not match drafted card set');
    }
    for (const id of draftedIds) {
        if (!lineupIds.has(id)) throw new Error(`Drafted card missing from lineup: ${id}`);
    }

    const byId = new Map(allCards.map(c => [c.id, c]));
    const usedHitterSlots = new Set();
    const usedSpSlots = new Set();
    const usedBattingOrders = new Set();
    let starterHitterCount = 0;
    let starterPitcherCount = 0;
    let reliefCount = 0;
    let benchCount = 0;

    for (const slot of lineup.slots) {
        const cardSrc = byId.get(slot.card.id);
        if (!cardSrc) throw new Error(`Unknown card: ${slot.card.id}`);
        const pos = slot.assignedPosition;

        if (cardSrc.type === 'hitter') {
            if (pos === 'bench') {
                benchCount++;
                if (slot.battingOrder != null) {
                    throw new Error('Bench hitters must have null battingOrder');
                }
                continue;
            }
            if (!STARTING_HITTER_SLOT_KEYS.has(pos)) {
                throw new Error(`Hitter ${cardSrc.name} has invalid slot '${pos}'`);
            }
            if (usedHitterSlots.has(pos)) {
                throw new Error(`Slot '${pos}' assigned twice`);
            }
            usedHitterSlots.add(pos);
            starterHitterCount++;

            // Position eligibility (1B and DH accept any hitter)
            if (pos !== '1B' && pos !== 'DH') {
                const target = pos.replace(/-\d$/, ''); // 'LF-RF-1' -> 'LF-RF'
                const eligible = (cardSrc.positions || []).some(p => {
                    if (target === 'LF-RF') return p.position === 'LF' || p.position === 'RF';
                    return p.position === target;
                });
                if (!eligible) {
                    throw new Error(`${cardSrc.name} cannot play ${target}`);
                }
            }

            if (typeof slot.battingOrder !== 'number' || slot.battingOrder < 1 || slot.battingOrder > 9) {
                throw new Error(`Starter hitter ${cardSrc.name} needs batting order 1-9`);
            }
            if (usedBattingOrders.has(slot.battingOrder)) {
                throw new Error(`Batting order ${slot.battingOrder} assigned twice`);
            }
            usedBattingOrders.add(slot.battingOrder);
        } else {
            // Pitcher
            if (cardSrc.role === 'Starter') {
                const m = pos && pos.match(/^Starter-([1-4])$/);
                if (!m) throw new Error(`SP ${cardSrc.name} needs slot Starter-1..4 (got '${pos}')`);
                if (usedSpSlots.has(pos)) throw new Error(`Slot '${pos}' assigned twice`);
                usedSpSlots.add(pos);
                starterPitcherCount++;
            } else {
                if (pos !== 'Reliever' && pos !== 'Closer') {
                    throw new Error(`Relief pitcher ${cardSrc.name} needs slot 'Reliever' or 'Closer' (got '${pos}')`);
                }
                reliefCount++;
            }
            if (slot.battingOrder != null) {
                throw new Error('Pitchers must have null battingOrder');
            }
        }
    }

    if (starterHitterCount !== 9) throw new Error(`Need 9 starting hitters, got ${starterHitterCount}`);
    if (starterPitcherCount !== 4) throw new Error(`Need 4 starting pitchers, got ${starterPitcherCount}`);
    if (reliefCount + benchCount !== 7) throw new Error(`Need 7 flex (relief + bench), got ${reliefCount + benchCount}`);

    return lineup;
}

/**
 * Build a Team-shaped lineup object (matches game/src/types/team.ts) from
 * a drafted team's card lists.
 *   { name, slots: [{ card, assignedPosition, battingOrder, isBackup }], rules }
 *
 * - assignedPosition: result of greedy bipartite matching for the 9 starting
 *   hitters, 'Starter-1..4' for SPs, 'Reliever' or 'Closer' by role for RPs,
 *   'bench' for bench hitters.
 * - battingOrder: 1..9 in pick order for starting hitters; null for everyone
 *   else. Players will reorder on the post-draft screen.
 * - isBackup: true only for bench hitters.
 *
 * The `name` defaults to "Drafted Team"; the player can rename later in
 * the set-lineup screen.
 */
export function buildLineupFromDraftedTeam(team, allCards, defaultName = 'Drafted Team') {
    const byId = new Map(allCards.map(c => [c.id, c]));

    const starterHitterCards = team.starterHitters.map(id => byId.get(id)).filter(Boolean);
    const benchHitterCards   = team.benchHitters.map(id => byId.get(id)).filter(Boolean);
    const sps                = team.starterPitchers.map(id => byId.get(id)).filter(Boolean);
    const rps                = team.reliefPitchers.map(id => byId.get(id)).filter(Boolean);

    const positionAssignment = assignHittersToSlots(starterHitterCards) || {};

    const slots = [];

    // Starting hitters — give each a batting order 1..9 in draft pick order
    starterHitterCards.forEach((card, idx) => {
        // Find the assigned slot for this card by matching ids
        let assigned = null;
        for (const [slot, cardId] of Object.entries(positionAssignment)) {
            if (cardId === card.id) { assigned = slot; break; }
        }
        // Fallback to 'DH' if matching failed (shouldn't happen)
        slots.push({
            card,
            assignedPosition: assigned || 'DH',
            battingOrder: idx + 1,
            isBackup: false,
        });
    });

    // Starting pitchers — Starter-1..4 in pick order
    sps.forEach((card, idx) => {
        slots.push({
            card,
            assignedPosition: `Starter-${idx + 1}`,
            battingOrder: null,
            isBackup: false,
        });
    });

    // Relief pitchers — by their role (Closer or Reliever)
    rps.forEach(card => {
        slots.push({
            card,
            assignedPosition: card.role === 'Closer' ? 'Closer' : 'Reliever',
            battingOrder: null,
            isBackup: false,
        });
    });

    // Bench hitters
    benchHitterCards.forEach(card => {
        slots.push({
            card,
            assignedPosition: 'bench',
            battingOrder: null,
            isBackup: true,
        });
    });

    return { name: defaultName, slots, rules: 'AL' };
}
