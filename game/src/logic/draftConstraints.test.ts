/**
 * Standalone tests for the draft constraint engine. Run via:
 *   cd game && npx tsx src/logic/draftConstraints.test.ts
 *
 * Uses Node's built-in assert. No test runner dependency.
 */

import assert from 'node:assert/strict';
import type { HitterCard, PitcherCard, Card, ParsedPosition } from '../types/cards';
import {
    checkEligibility,
    hitterMatchingSize,
    hittersAreAssignable,
    hitterFitsSlot,
    effectiveCost,
    budgetLowerBound,
    buildAvailablePool,
    simulatePick,
} from './draftConstraints';
import { emptyDraftTeam, buildSnakeOrder } from '../types/draft';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (e: any) {
        failed++;
        console.log(`  FAIL: ${name}`);
        console.log(`        ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// Card factory helpers
// ---------------------------------------------------------------------------

let nextId = 0;
function hitter(positions: ParsedPosition[], points = 100): HitterCard {
    return {
        id: `H${nextId++}`,
        name: `H${nextId}`, team: 'TST', cardNum: 1, edition: 'Test', year: '2004',
        expansion: 'Base', points, onBase: 8, speed: 12, hand: 'R',
        positions, icons: [],
        chart: { SO: null, GB: null, FB: null, W: null, S: null, SPlus: null, DB: null, TR: null, HR: null },
        imagePath: '', type: 'hitter',
    };
}
function pitcher(role: 'Starter' | 'Reliever' | 'Closer', points = 100): PitcherCard {
    return {
        id: `P${nextId++}`,
        name: `P${nextId}`, team: 'TST', cardNum: 1, edition: 'Test', year: '2004',
        expansion: 'Base', points, control: 4, ip: 6, role, hand: 'R', icons: [],
        chart: { PU: null, SO: null, GB: null, FB: null, W: null, S: null, DB: null, HR: null },
        imagePath: '', type: 'pitcher',
    };
}
const C_ONLY = (pts = 100) => hitter([{ position: 'C', fielding: 9 }], pts);
const SS_ONLY = (pts = 100) => hitter([{ position: 'SS', fielding: 4 }], pts);
const OF_ALL = (pts = 100) => hitter([
    { position: 'LF', fielding: 0 }, { position: 'CF', fielding: 0 }, { position: 'RF', fielding: 0 },
], pts);
const CF_ONLY = (pts = 100) => hitter([{ position: 'CF', fielding: 0 }], pts);

// ---------------------------------------------------------------------------
// Snake order
// ---------------------------------------------------------------------------

console.log('\nbuildSnakeOrder:');

test('home picks 1st, away picks 2-3, home picks 4-5', () => {
    const order = buildSnakeOrder(6);
    assert.deepEqual(order, ['home', 'away', 'away', 'home', 'home', 'away']);
});

test('40 picks: 20 home and 20 away', () => {
    const order = buildSnakeOrder(40);
    assert.equal(order.filter(x => x === 'home').length, 20);
    assert.equal(order.filter(x => x === 'away').length, 20);
});

test('40-pick snake starts and ends with home', () => {
    const order = buildSnakeOrder(40);
    assert.equal(order[0], 'home');
    assert.equal(order[39], 'home');
});

// ---------------------------------------------------------------------------
// Position eligibility
// ---------------------------------------------------------------------------

console.log('\nhitterFitsSlot:');

test('any hitter fits 1B', () => {
    assert.equal(hitterFitsSlot(C_ONLY(), '1B'), true);
});
test('any hitter fits DH', () => {
    assert.equal(hitterFitsSlot(SS_ONLY(), 'DH'), true);
});
test('catcher fits C, not SS', () => {
    assert.equal(hitterFitsSlot(C_ONLY(), 'C'), true);
    assert.equal(hitterFitsSlot(C_ONLY(), 'SS'), false);
});
test('OF card fits LF-RF and CF', () => {
    assert.equal(hitterFitsSlot(OF_ALL(), 'LF-RF-1'), true);
    assert.equal(hitterFitsSlot(OF_ALL(), 'LF-RF-2'), true);
    assert.equal(hitterFitsSlot(OF_ALL(), 'CF'), true);
});
test('CF-only card does not fit LF-RF', () => {
    assert.equal(hitterFitsSlot(CF_ONLY(), 'LF-RF-1'), false);
});

// ---------------------------------------------------------------------------
// Bipartite matching
// ---------------------------------------------------------------------------

console.log('\nhitterMatchingSize:');

test('3 catchers all assignable (C, 1B, DH)', () => {
    const set = [C_ONLY(), C_ONLY(), C_ONLY()];
    assert.equal(hitterMatchingSize(set), 3);
    assert.equal(hittersAreAssignable(set), true);
});

test('4 catchers: only 3 assignable', () => {
    const set = [C_ONLY(), C_ONLY(), C_ONLY(), C_ONLY()];
    assert.equal(hitterMatchingSize(set), 3);
    assert.equal(hittersAreAssignable(set), false);
});

test('3 LF-RF + 1 CF + 5 catchers: not all 9 assignable (5 catchers cap at 3)', () => {
    const set = [
        OF_ALL(), OF_ALL(), OF_ALL(),
        CF_ONLY(),
        C_ONLY(), C_ONLY(), C_ONLY(), C_ONLY(), C_ONLY(),
    ];
    assert.ok(hitterMatchingSize(set) < 9);
});

test('1 of each natural position assigns all 9', () => {
    const set = [
        C_ONLY(),
        hitter([{ position: '1B', fielding: 1 }]),
        hitter([{ position: '2B', fielding: 1 }]),
        hitter([{ position: '3B', fielding: 1 }]),
        hitter([{ position: 'SS', fielding: 1 }]),
        hitter([{ position: 'LF', fielding: 0 }]),
        hitter([{ position: 'RF', fielding: 0 }]),
        CF_ONLY(),
        // 9th: any hitter — DH accepts anyone
        hitter([{ position: '2B', fielding: 1 }]),
    ];
    assert.equal(hitterMatchingSize(set), 9);
});

// ---------------------------------------------------------------------------
// Effective cost
// ---------------------------------------------------------------------------

console.log('\neffectiveCost:');

test('starter hitter pays full cost', () => {
    assert.equal(effectiveCost(C_ONLY(500), 'starterHitter'), 500);
});
test('bench hitter pays 1/5 cost (rounded up)', () => {
    assert.equal(effectiveCost(C_ONLY(503), 'benchHitter'), 101);
});
test('SP and RP pay full cost (never benched)', () => {
    assert.equal(effectiveCost(pitcher('Starter', 400), 'starterPitcher'), 400);
    assert.equal(effectiveCost(pitcher('Reliever', 250), 'reliefPitcher'), 250);
});

// ---------------------------------------------------------------------------
// Eligibility — full path
// ---------------------------------------------------------------------------

console.log('\ncheckEligibility:');

function makePool(): Card[] {
    nextId = 1000; // separate id space so reused tests don't collide
    const cards: Card[] = [];
    // Plenty of cheap cards in every category so budget LB never bites tests:
    for (let i = 0; i < 30; i++) cards.push(C_ONLY(80));
    for (let i = 0; i < 30; i++) cards.push(SS_ONLY(80));
    for (let i = 0; i < 30; i++) cards.push(OF_ALL(80));
    for (let i = 0; i < 30; i++) cards.push(hitter([{ position: '1B', fielding: 1 }], 80));
    for (let i = 0; i < 30; i++) cards.push(hitter([{ position: '2B', fielding: 1 }], 80));
    for (let i = 0; i < 30; i++) cards.push(hitter([{ position: '3B', fielding: 1 }], 80));
    for (let i = 0; i < 30; i++) cards.push(CF_ONLY(80));
    for (let i = 0; i < 30; i++) cards.push(pitcher('Starter', 80));
    for (let i = 0; i < 30; i++) cards.push(pitcher('Reliever', 80));
    for (let i = 0; i < 5; i++)  cards.push(pitcher('Closer', 80));
    return cards;
}

test('empty team picking a hitter: starter and bench both eligible', () => {
    const pool = makePool();
    const candidate = pool[0]; // a catcher
    const team = emptyDraftTeam(5000);
    const drafted = new Set<string>();
    const avail = buildAvailablePool(pool, drafted);
    const r = checkEligibility(candidate, team, pool, drafted, avail);
    assert.equal(r.eligible, true);
    assert.deepEqual(r.buckets.sort(), ['benchHitter', 'starterHitter'].sort());
});

test('drafted card cannot be re-picked', () => {
    const pool = makePool();
    const c = pool[0];
    const team = emptyDraftTeam(5000);
    const drafted = new Set([c.id]);
    const avail = buildAvailablePool(pool, drafted);
    const r = checkEligibility(c, team, pool, drafted, avail);
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'drafted');
});

test('cannot draft 4th catcher as starter (matching breaks)', () => {
    const pool = makePool();
    const cs = pool.filter(c => c.type === 'hitter' && (c as HitterCard).positions.some(p => p.position === 'C')).slice(0, 4) as HitterCard[];
    let team = emptyDraftTeam(5000);
    const drafted = new Set<string>();
    // Draft first 3 catchers as starters
    for (let i = 0; i < 3; i++) {
        team = simulatePick(team, cs[i], 'starterHitter');
        drafted.add(cs[i].id);
    }
    const avail = buildAvailablePool(pool, drafted);
    const r = checkEligibility(cs[3], team, pool, drafted, avail);
    // 4th catcher should still be eligible as bench, but NOT as starter:
    assert.equal(r.eligible, true);
    assert.deepEqual(r.buckets, ['benchHitter']);
});

test('cannot draft 5th SP', () => {
    const pool = makePool();
    const sps = pool.filter(c => c.type === 'pitcher' && (c as PitcherCard).role === 'Starter') as PitcherCard[];
    let team = emptyDraftTeam(5000);
    const drafted = new Set<string>();
    for (let i = 0; i < 4; i++) {
        team = simulatePick(team, sps[i], 'starterPitcher');
        drafted.add(sps[i].id);
    }
    const avail = buildAvailablePool(pool, drafted);
    const r = checkEligibility(sps[4], team, pool, drafted, avail);
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'no-bucket');
});

test('budget too tight: expensive card rejected near the cap', () => {
    const pool = makePool();
    // Custom pool: one expensive card, rest tight
    const expensive = hitter([{ position: 'C', fielding: 9 }], 4000);
    pool.push(expensive);
    const team: typeof emptyDraftTeam extends (...a: any) => infer R ? R : never =
        emptyDraftTeam(100); // only 100 points to spend
    const drafted = new Set<string>();
    const avail = buildAvailablePool(pool, drafted);
    const r = checkEligibility(expensive, team, pool, drafted, avail);
    assert.equal(r.eligible, false);
});

test('valid pick reduces remaining budget (simulatePick)', () => {
    const team = emptyDraftTeam(5000);
    const c = C_ONLY(400);
    const next = simulatePick(team, c, 'starterHitter');
    assert.equal(next.pointsRemaining, 4600);
    assert.deepEqual(next.starterHitters, [c.id]);
    // original is unmutated
    assert.equal(team.pointsRemaining, 5000);
    assert.equal(team.starterHitters.length, 0);
});

test('bench pick uses 1/5 cost', () => {
    const team = emptyDraftTeam(5000);
    const c = C_ONLY(500);
    const next = simulatePick(team, c, 'benchHitter');
    assert.equal(next.pointsRemaining, 4900);
    assert.deepEqual(next.benchHitters, [c.id]);
});

// ---------------------------------------------------------------------------
// Budget lower bound
// ---------------------------------------------------------------------------

console.log('\nbudgetLowerBound:');

test('empty team has positive lower bound', () => {
    const pool = makePool();
    const team = emptyDraftTeam(5000);
    const lb = budgetLowerBound(team, pool);
    // 9 hitters * 80 + 4 sps * 80 + 7 flex * 16 = 720 + 320 + 112 = 1152
    assert.equal(lb, 9 * 80 + 4 * 80 + 7 * Math.ceil(80 / 5));
});

test('full team has zero lower bound', () => {
    let team = emptyDraftTeam(5000);
    team = { ...team,
        starterHitters: Array(9).fill('x'),
        starterPitchers: Array(4).fill('x'),
        benchHitters: Array(3).fill('x'),
        reliefPitchers: Array(4).fill('x'),
    };
    assert.equal(budgetLowerBound(team, []), 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
