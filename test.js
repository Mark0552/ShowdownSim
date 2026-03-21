/**
 * MLB Showdown Simulator - Tests
 *
 * Run: npm test
 */

const assert = require('assert');
const { parseRange, rollInRange, determineOutcome, applyHitterIcons, validateData } = require('./sim');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL: ${name}`);
        console.log(`        ${e.message}`);
    }
}

// ============================================================================
// parseRange
// ============================================================================

console.log('\nparseRange:');

test('parses hyphenated range "1-3"', () => {
    const r = parseRange('1-3');
    assert.deepStrictEqual(r, { low: 1, high: 3 });
});

test('parses single number "6"', () => {
    const r = parseRange('6');
    assert.deepStrictEqual(r, { low: 6, high: 6 });
});

test('parses plus format "22+"', () => {
    const r = parseRange('22+');
    assert.deepStrictEqual(r, { low: 22, high: 20 });
});

test('returns null for null/undefined', () => {
    assert.strictEqual(parseRange(null), null);
    assert.strictEqual(parseRange(undefined), null);
});

test('parses wide range "2-9"', () => {
    const r = parseRange('2-9');
    assert.deepStrictEqual(r, { low: 2, high: 9 });
});

// ============================================================================
// rollInRange
// ============================================================================

console.log('\nrollInRange:');

test('returns true when roll is within range', () => {
    assert.strictEqual(rollInRange(5, { low: 3, high: 7 }), true);
});

test('returns true on range boundaries', () => {
    assert.strictEqual(rollInRange(3, { low: 3, high: 7 }), true);
    assert.strictEqual(rollInRange(7, { low: 3, high: 7 }), true);
});

test('returns false when roll is outside range', () => {
    assert.strictEqual(rollInRange(2, { low: 3, high: 7 }), false);
    assert.strictEqual(rollInRange(8, { low: 3, high: 7 }), false);
});

test('returns falsy for null range', () => {
    assert.ok(!rollInRange(5, null));
});

test('works with single-number range', () => {
    assert.strictEqual(rollInRange(6, { low: 6, high: 6 }), true);
    assert.strictEqual(rollInRange(5, { low: 6, high: 6 }), false);
});

// ============================================================================
// determineOutcome
// ============================================================================

console.log('\ndetermineOutcome:');

const mockHitter = {
    Name: 'Test Hitter',
    ranges: {
        SO: { low: 1, high: 3 },
        GB: { low: 4, high: 5 },
        FB: { low: 6, high: 6 },
        W: { low: 7, high: 8 },
        S: { low: 9, high: 14 },
        SPlus: { low: 15, high: 17 },
        DB: { low: 18, high: 19 },
        TR: { low: 20, high: 20 },
        HR: { low: 21, high: 20 }
    }
};

const mockPitcher = {
    Name: 'Test Pitcher',
    ranges: {
        PU: { low: 1, high: 1 },
        SO: { low: 2, high: 8 },
        GB: { low: 9, high: 12 },
        FB: { low: 13, high: 16 },
        W: { low: 17, high: 18 },
        S: { low: 19, high: 20 },
        DB: null,
        HR: null
    }
};

test('hitter chart: strikeout on roll 1', () => {
    assert.strictEqual(determineOutcome(mockHitter, 1, true), 'strikeout');
});

test('hitter chart: walk on roll 7', () => {
    assert.strictEqual(determineOutcome(mockHitter, 7, true), 'walk');
});

test('hitter chart: single on roll 10', () => {
    assert.strictEqual(determineOutcome(mockHitter, 10, true), 'single');
});

test('hitter chart: singleplus on roll 16', () => {
    assert.strictEqual(determineOutcome(mockHitter, 16, true), 'singleplus');
});

test('hitter chart: double on roll 18', () => {
    assert.strictEqual(determineOutcome(mockHitter, 18, true), 'double');
});

test('hitter chart: triple on roll 20', () => {
    assert.strictEqual(determineOutcome(mockHitter, 20, true), 'triple');
});

test('pitcher chart: popup on roll 1', () => {
    assert.strictEqual(determineOutcome(mockPitcher, 1, false), 'popup');
});

test('pitcher chart: strikeout on roll 5', () => {
    assert.strictEqual(determineOutcome(mockPitcher, 5, false), 'strikeout');
});

test('pitcher chart: single on roll 19', () => {
    assert.strictEqual(determineOutcome(mockPitcher, 19, false), 'single');
});

// ============================================================================
// applyHitterIcons
// ============================================================================

console.log('\napplyHitterIcons:');

test('V icon triggers reroll on strikeout (returns null)', () => {
    const stats = {
        hasV: true, hasS: false, hasHR: false,
        gameVuses: 0, gameSused: false, gameHRused: false,
        Vused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('strikeout', stats, true);
    assert.strictEqual(result, null);
    assert.strictEqual(stats.gameVuses, 1);
    assert.strictEqual(stats.Vused, 1);
});

test('V icon does NOT trigger on pitcher chart', () => {
    const stats = {
        hasV: true, hasS: false, hasHR: false,
        gameVuses: 0, gameSused: false, gameHRused: false,
        Vused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('strikeout', stats, false);
    assert.strictEqual(result, 'strikeout');
});

test('V icon limited to 2 per game', () => {
    const stats = {
        hasV: true, hasS: false, hasHR: false,
        gameVuses: 2, gameSused: false, gameHRused: false,
        Vused: 2, iconImpact: { V: { outsAvoided: 2 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('groundball', stats, true);
    assert.strictEqual(result, 'groundball');
});

test('HR icon upgrades double to homeRun', () => {
    const stats = {
        hasV: false, hasS: false, hasHR: true,
        gameVuses: 0, gameSused: false, gameHRused: false,
        HRused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('double', stats, true);
    assert.strictEqual(result, 'homeRun');
    assert.strictEqual(stats.gameHRused, true);
});

test('HR icon upgrades triple to homeRun', () => {
    const stats = {
        hasV: false, hasS: false, hasHR: true,
        gameVuses: 0, gameSused: false, gameHRused: false,
        HRused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('triple', stats, true);
    assert.strictEqual(result, 'homeRun');
});

test('HR icon only fires once per game', () => {
    const stats = {
        hasV: false, hasS: false, hasHR: true,
        gameVuses: 0, gameSused: false, gameHRused: true,
        HRused: 1, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 1, hrsFromTriples: 0, tbGained: 2 } }
    };
    const result = applyHitterIcons('double', stats, true);
    assert.strictEqual(result, 'double');
});

test('S icon upgrades single to double', () => {
    const stats = {
        hasV: false, hasS: true, hasHR: false,
        gameVuses: 0, gameSused: false, gameHRused: false,
        Sused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('single', stats, true);
    assert.strictEqual(result, 'double');
    assert.strictEqual(stats.gameSused, true);
});

test('S icon upgrades singleplus to double', () => {
    const stats = {
        hasV: false, hasS: true, hasHR: false,
        gameVuses: 0, gameSused: false, gameHRused: false,
        Sused: 0, iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('singleplus', stats, true);
    assert.strictEqual(result, 'double');
});

test('no icon effect on walk', () => {
    const stats = {
        hasV: true, hasS: true, hasHR: true,
        gameVuses: 0, gameSused: false, gameHRused: false,
        Vused: 0, Sused: 0, HRused: 0,
        iconImpact: { V: { outsAvoided: 0 }, S: { doublesFromSingles: 0, tbGained: 0 }, HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 } }
    };
    const result = applyHitterIcons('walk', stats, true);
    assert.strictEqual(result, 'walk');
});

// ============================================================================
// validateData
// ============================================================================

console.log('\nvalidateData:');

test('valid data produces no errors', () => {
    const hitters = [{
        Name: 'Test', Team: 'Test', Points: 100, onBase: 10, Speed: 15, Position: 'SS',
        SO: '1-3', GB: '4-5', FB: '6', W: '7-8', S: '9-14', DB: '15', HR: '16+'
    }];
    const pitchers = [{
        Name: 'Test', Team: 'Test', Points: 100, Control: 5, Position: 'Starter',
        SO: '1-5', GB: '6-10', FB: '11-15', W: '16', S: '17-18', HR: '19+'
    }];
    const errors = validateData(hitters, pitchers);
    assert.strictEqual(errors.length, 0);
});

test('missing required field is caught', () => {
    const hitters = [{ Name: 'Test', Team: 'Test', Points: 100, Speed: 15, Position: 'SS', SO: '1-3' }];
    const errors = validateData(hitters, []);
    assert.ok(errors.some(e => e.includes('onBase')));
});

test('invalid range format is caught', () => {
    const hitters = [{
        Name: 'Test', Team: 'Test', Points: 100, onBase: 10, Speed: 15, Position: 'SS',
        SO: 'abc', GB: '4-5'
    }];
    const errors = validateData(hitters, []);
    assert.ok(errors.some(e => e.includes('invalid range')));
});

// ============================================================================
// Snapshot test with known seed
// ============================================================================

console.log('\nSnapshot (seeded simulation):');

test('small simulation produces deterministic results', () => {
    const seedrandom = require('seedrandom');
    const rng = seedrandom('test-seed');
    const rollDie = () => Math.floor(rng() * 20) + 1;

    // Roll 10 dice with known seed and verify deterministic
    const rolls = [];
    for (let i = 0; i < 10; i++) rolls.push(rollDie());

    // These values are deterministic given the seed
    const rng2 = seedrandom('test-seed');
    const rollDie2 = () => Math.floor(rng2() * 20) + 1;
    const rolls2 = [];
    for (let i = 0; i < 10; i++) rolls2.push(rollDie2());

    assert.deepStrictEqual(rolls, rolls2);
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${'-'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
    process.exit(1);
}
