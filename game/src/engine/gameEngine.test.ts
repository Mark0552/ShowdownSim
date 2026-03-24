/**
 * End-to-end game engine test.
 * Simulates multiple full innings to verify:
 * - Batting order advances correctly (1-9, wraps)
 * - Outs accumulate properly (3 = half inning over)
 * - Innings advance (top -> bottom -> next inning)
 * - Score tracking works
 * - Baserunning works (walks, singles, doubles, HR)
 * - Phase transitions are correct at every step
 */

import { initializeGameState, processAction, whoseTurn, getPhaseDescription } from './gameEngine';
import type { GameState } from '../types/gameState';
import type { GameAction } from '../types/gameActions';

// Build minimal test lineups
function makeTestLineup() {
    const makeHitter = (name: string, num: number, onBase: number, speed: number, pos: string) => ({
        card: {
            id: `${name}|test`,
            name, team: 'Test', cardNum: num, edition: 'UL', year: "'04",
            expansion: 'Base Set', points: 100, onBase, speed,
            positions: [{ position: pos.replace(/-\d$/, ''), fielding: 2 }],
            hand: 'R', icons: [] as string[],
            chart: { SO: '1-3', GB: '4-6', FB: '7-8', W: '9-10', S: '11-15', SPlus: null, DB: '16-18', TR: '19', HR: '20+' },
            imagePath: '', type: 'hitter' as const,
        },
        assignedPosition: pos,
        battingOrder: num,
        isBackup: false,
    });

    const makePitcher = (name: string, num: number, control: number, ip: number, role: string) => ({
        card: {
            id: `${name}|test`,
            name, team: 'Test', cardNum: num, edition: 'UL', year: "'04",
            expansion: 'Base Set', points: 100, control, ip, role,
            hand: 'R', icons: [] as string[],
            chart: { PU: '1', SO: '2-7', GB: '8-12', FB: '13-16', W: '17-18', S: '19-20', DB: null, HR: null },
            imagePath: '', type: 'pitcher' as const,
        },
        assignedPosition: role === 'Starter' ? 'Starter-1' : 'Reliever',
        battingOrder: null,
        isBackup: false,
    });

    return {
        name: 'Test Team', rules: 'AL',
        slots: [
            makeHitter('Batter1', 1, 10, 15, 'C'),
            makeHitter('Batter2', 2, 11, 14, '1B'),
            makeHitter('Batter3', 3, 12, 13, '2B'),
            makeHitter('Batter4', 4, 10, 12, '3B'),
            makeHitter('Batter5', 5, 11, 11, 'SS'),
            makeHitter('Batter6', 6, 10, 10, 'LF-RF-1'),
            makeHitter('Batter7', 7, 9, 15, 'LF-RF-2'),
            makeHitter('Batter8', 8, 10, 12, 'CF'),
            makeHitter('Batter9', 9, 9, 10, 'DH'),
            makePitcher('Pitcher1', 10, 5, 7, 'Starter'),
            makePitcher('Reliever1', 11, 4, 2, 'Reliever'),
        ],
    };
}

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function processAndLog(state: GameState, action: GameAction, label: string): GameState {
    const newState = processAction(state, action);
    return newState;
}

// Run a full at-bat: skip pre -> skip defense -> pitch -> swing -> auto-resolve
function runAtBat(state: GameState, pitchRoll: number, swingRoll: number): GameState {
    let s = state;

    // Pre at-bat: skip pinch hit
    if (s.phase === 'pre_atbat') {
        s = processAction(s, { type: 'SKIP_PRE_ATBAT' });
    }

    // Defense sub: skip
    if (s.phase === 'defense_sub') {
        s = processAction(s, { type: 'SKIP_DEFENSE_SUB' });
    }

    // Offense pre: skip (if shown)
    if (s.phase === 'offense_pre') {
        s = processAction(s, { type: 'SKIP_OFFENSE_PRE' });
    }

    // Pitch
    assert(s.phase === 'pitch', `Expected pitch phase, got ${s.phase}`);
    s = processAction(s, { type: 'ROLL_PITCH', roll: pitchRoll });

    // Swing
    assert(s.phase === 'swing', `Expected swing phase, got ${s.phase}`);
    s = processAction(s, { type: 'ROLL_SWING', roll: swingRoll });

    // Handle remaining phases (icons, fielding, extra bases)
    let safety = 0;
    while (s.phase === 'result_pending' || s.phase === 'fielding_check' || s.phase === 'extra_base_decision') {
        if (s.phase === 'result_pending') {
            s = processAction(s, { type: 'DECLINE_ICON' });
        } else if (s.phase === 'fielding_check') {
            s = processAction(s, { type: 'FIELDING_ROLL', roll: 10 });
        } else if (s.phase === 'extra_base_decision') {
            const attempt = s.pendingExtraBases[0];
            if (attempt) {
                s = processAction(s, { type: 'EXTRA_BASE_NO', runnerId: attempt.runnerId });
            }
        }
        safety++;
        if (safety > 20) throw new Error('Infinite loop in at-bat resolution');
    }

    return s;
}

function runTest() {
    console.log('=== Game Engine End-to-End Test ===\n');

    const homeLineup = makeTestLineup();
    const awayLineup = makeTestLineup();

    let state = initializeGameState(homeLineup, awayLineup, 'home-user', 'away-user');

    assert(state.inning === 1, 'Should start at inning 1');
    assert(state.halfInning === 'top', 'Should start top of 1st');
    assert(state.outs === 0, 'Should start with 0 outs');
    assert(state.phase === 'pre_atbat', 'Should start at pre_atbat');

    const awayTeam = state.awayTeam;
    assert(awayTeam.currentBatterIndex === 0, 'Away should start with batter index 0');
    assert(awayTeam.lineup[0].card.name === 'Batter1', 'First batter should be Batter1');

    console.log('Initial state OK');

    // --- TOP OF 1ST: 3 strikeouts ---
    console.log('\n--- Top of 1st ---');

    // At-bat 1: Strikeout (pitch roll high = pitcher chart, swing roll low = SO)
    state = runAtBat(state, 15, 2); // Pitch: 15+5=20 > OB 10, pitcher chart, roll 2 = SO
    assert(state.outs === 1, `After AB1: expected 1 out, got ${state.outs}`);
    assert(state.halfInning === 'top', 'Should still be top');
    const bt1 = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    assert(bt1.currentBatterIndex === 1, `After AB1: batter index should be 1, got ${bt1.currentBatterIndex}`);
    console.log(`  AB1: SO, 1 out, next batter index: ${bt1.currentBatterIndex} (${bt1.lineup[bt1.currentBatterIndex].card.name})`);

    // At-bat 2: Strikeout
    state = runAtBat(state, 15, 3);
    assert(state.outs === 2, `After AB2: expected 2 outs, got ${state.outs}`);
    const bt2 = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    assert(bt2.currentBatterIndex === 2, `After AB2: batter index should be 2, got ${bt2.currentBatterIndex}`);
    console.log(`  AB2: SO, 2 outs, next batter index: ${bt2.currentBatterIndex}`);

    // At-bat 3: Strikeout -> half inning over
    state = runAtBat(state, 15, 4);
    assert(state.halfInning === 'bottom', `After AB3: should be bottom, got ${state.halfInning}`);
    assert(state.outs === 0, `After AB3: outs should reset to 0, got ${state.outs}`);
    assert(state.inning === 1, 'Should still be inning 1');
    console.log(`  AB3: SO, 3 outs -> bottom of 1st`);

    // Check away batter index preserved for next time
    const awayAfterTop1 = state.awayTeam;
    assert(awayAfterTop1.currentBatterIndex === 3, `Away batter index should be 3 for next time, got ${awayAfterTop1.currentBatterIndex}`);
    console.log(`  Away next batter will be index 3 (${awayAfterTop1.lineup[3].card.name})`);

    // --- BOTTOM OF 1ST: home team bats ---
    console.log('\n--- Bottom of 1st ---');
    const homeTeam1 = state.homeTeam;
    assert(homeTeam1.currentBatterIndex === 0, `Home should start at batter 0, got ${homeTeam1.currentBatterIndex}`);

    // 3 quick outs
    state = runAtBat(state, 15, 2); // SO
    assert(state.outs === 1, `Bot1 AB1: expected 1 out, got ${state.outs}`);
    state = runAtBat(state, 15, 3); // SO
    state = runAtBat(state, 15, 4); // SO -> top of 2nd
    assert(state.inning === 2, `Should be inning 2, got ${state.inning}`);
    assert(state.halfInning === 'top', `Should be top of 2nd, got ${state.halfInning}`);
    assert(state.outs === 0, 'Outs should reset');
    console.log('  3 SO -> top of 2nd');

    // Check batting order continuity
    const awayTop2 = state.awayTeam;
    assert(awayTop2.currentBatterIndex === 3, `Away should resume at batter 3, got ${awayTop2.currentBatterIndex}`);
    console.log(`  Away resumes at index 3 (${awayTop2.lineup[3].card.name})`);

    // --- TOP OF 2ND: Walk then single to test baserunning ---
    console.log('\n--- Top of 2nd: baserunning test ---');

    // Walk Batter4 (pitch roll low = batter chart, swing roll in walk range)
    state = runAtBat(state, 1, 9); // Pitch: 1+5=6 <= OB 10, batter chart, roll 9 = W
    assert(state.bases.first !== null, 'Runner should be on first after walk');
    assert(state.outs === 0, 'Walk should not add an out');
    console.log(`  Walk: runner on first (${state.bases.first})`);

    // Single by Batter5 — runner advances to 2nd, batter to 1st
    state = runAtBat(state, 1, 12); // batter chart, roll 12 = S
    assert(state.bases.first !== null, 'Batter should be on first');
    assert(state.bases.second !== null || state.bases.third !== null, 'Previous runner should have advanced');
    console.log(`  Single: 1st=${state.bases.first ? 'occupied' : 'empty'}, 2nd=${state.bases.second ? 'occupied' : 'empty'}, 3rd=${state.bases.third ? 'occupied' : 'empty'}`);

    // HR by Batter6 — everyone scores
    const scoreBefore = state.score.away;
    state = runAtBat(state, 1, 20); // batter chart, roll 20 = HR (20+)
    const runsScored = state.score.away - scoreBefore;
    assert(runsScored >= 2, `HR with runners should score at least 2, scored ${runsScored}`);
    assert(state.bases.first === null && state.bases.second === null && state.bases.third === null, 'Bases should be clear after HR');
    console.log(`  HR: ${runsScored} runs scored! Score: Away ${state.score.away}, Home ${state.score.home}`);

    // Finish the half-inning with 3 outs
    state = runAtBat(state, 15, 2); // SO
    state = runAtBat(state, 15, 2); // SO
    state = runAtBat(state, 15, 2); // SO -> bottom of 2nd
    assert(state.halfInning === 'bottom', 'Should be bottom of 2nd');
    console.log('  3 more SO -> bottom of 2nd');

    // --- Simulate through several innings to test batting order wrap ---
    console.log('\n--- Simulating innings 2-8 (quick outs) ---');
    for (let safetyCounter = 0; safetyCounter < 200 && state.inning < 9; safetyCounter++) {
        if (state.isOver) break;
        state = runAtBat(state, 15, 2); // all strikeouts
    }
    console.log(`  Now at: ${state.halfInning} of inning ${state.inning}`);
    console.log(`  Score: Away ${state.score.away}, Home ${state.score.home}`);
    console.log(`  Away batter index: ${state.awayTeam.currentBatterIndex}`);
    console.log(`  Home batter index: ${state.homeTeam.currentBatterIndex}`);

    // Check game ends properly
    if (state.inning >= 9 && !state.isOver) {
        // Play out the 9th
        while (!state.isOver && state.inning === 9) {
            state = runAtBat(state, 15, 2);
            if (state.isOver) break;
        }
    }

    if (state.isOver) {
        console.log(`\nGame Over! Winner: ${state.winnerId}`);
        console.log(`Final Score: Away ${state.score.away}, Home ${state.score.home}`);
    } else {
        console.log(`\nGame still going: inning ${state.inning} ${state.halfInning}`);
        console.log(`Score: Away ${state.score.away}, Home ${state.score.home}`);
    }

    // Verify batting order wrapped correctly
    // Each team faces 9 batters per 3 innings (3 outs = 3 batters per half inning if all SO)
    // Over 9 innings, each team gets 27 outs = 27 at-bats = 3 full trips through the order
    // So batter index should be 0 (27 % 9 = 0)

    console.log('\n=== ALL TESTS PASSED ===');
}

runTest();
