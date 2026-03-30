/**
 * Extra base attempt phase handlers.
 */

import { rollD20 } from '../dice.js';
import { playerHasIcon, canUseIcon, recordIconUse } from '../icons.js';
import { OUTFIELD_POSITIONS } from '../fielding.js';
import { advanceBatter, endHalfInning } from './baserunning.js';

export function checkExtraBaseEligible(state, outcome) {
    const bases = state.bases;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = state[battingSide];
    const batterId = battingTeam.lineup[battingTeam.currentBatterIndex]?.cardId;
    const eligible = [];
    const outsBeforeSwing = state.outsBeforeSwing || 0;

    if (outcome === 'S' || outcome === 'SPlus') {
        // Runner on 3rd (was on 2nd) can try for home
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                const target = runner.speed + 5 + (outsBeforeSwing >= 2 ? 5 : 0); // +5 home, +5 2-out
                eligible.push({ runnerId: runner.cardId, runnerName: runner.name, fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed, targetWithBonuses: target });
            }
        }
        // Runner on 2nd (was on 1st) can try for 3rd
        // But NOT the batter who auto-advanced to 2nd on S+ (that advance IS the S+ bonus)
        if (bases.second && !(outcome === 'SPlus' && bases.second === batterId)) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.second);
            if (runner) {
                const target = runner.speed + (outsBeforeSwing >= 2 ? 5 : 0); // no home bonus
                eligible.push({ runnerId: runner.cardId, runnerName: runner.name, fromBase: 'second', toBase: 'third', runnerSpeed: runner.speed, targetWithBonuses: target });
            }
        }
    }

    if (outcome === 'DB') {
        // Runner on 3rd (was on 1st) can try for home
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                const target = runner.speed + 5 + (outsBeforeSwing >= 2 ? 5 : 0);
                eligible.push({ runnerId: runner.cardId, runnerName: runner.name, fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed, targetWithBonuses: target });
            }
        }
    }

    if (outcome === 'FB' && state.outs < 3) {
        // Tag-up: runner on 3rd can try to score
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                const target = runner.speed + 5 + (outsBeforeSwing >= 2 ? 5 : 0);
                eligible.push({ runnerId: runner.cardId, runnerName: runner.name, fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed, targetWithBonuses: target });
            }
        }
        // Runner on 2nd can try for 3rd on FB tag-up
        if (bases.second) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.second);
            if (runner) {
                const target = runner.speed + (outsBeforeSwing >= 2 ? 5 : 0);
                eligible.push({ runnerId: runner.cardId, runnerName: runner.name, fromBase: 'second', toBase: 'third', runnerSpeed: runner.speed, targetWithBonuses: target });
            }
        }
    }

    return eligible.length > 0 ? eligible : null;
}

export function handleSendRunners(state, action) {
    if (state.phase !== 'extra_base_offer') return state;
    const eligible = state.extraBaseEligible || [];
    const sentIds = action.runnerIds || [];
    if (sentIds.length === 0) return handleHoldRunners(state);

    const sent = eligible.filter(e => sentIds.includes(e.runnerId));
    if (sent.length === 0) return handleHoldRunners(state);

    const logs = sent.map(r => `${r.runnerName} sent for ${r.toBase}`);
    return { ...state, phase: 'extra_base', extraBaseEligible: sent, gameLog: [...state.gameLog, ...logs] };
}

export function handleHoldRunners(state) {
    if (state.phase !== 'extra_base_offer') return state;
    return advanceBatter({ ...state, extraBaseEligible: null });
}

export function handleExtraBaseThrow(state, action) {
    if (state.phase !== 'extra_base') return state;
    const eligible = state.extraBaseEligible;
    if (!eligible || eligible.length === 0) return advanceBatter({ ...state, extraBaseEligible: null });

    const target = eligible.find(e => e.runnerId === action.runnerId);
    if (!target) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let fieldingTeam = state[fieldingSide];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    const roll = rollD20();
    let ofFielding = fieldingTeam.totalOutfieldFielding;
    let goldGloveUsed = false;

    // G icon — defense chooses which player's G to use (must be an outfielder for extra base throws)
    if (action.goldGloveCardId) {
        const gPlayer = fieldingTeam.lineup.find(p => p.cardId === action.goldGloveCardId);
        const gPos = gPlayer ? (gPlayer.assignedPosition || '').replace(/-\d+$/, '') : '';
        if (gPlayer && playerHasIcon(gPlayer, 'G') && canUseIcon(fieldingTeam, gPlayer.cardId, 'G') && OUTFIELD_POSITIONS.includes(gPos)) {
            ofFielding += 10;
            goldGloveUsed = true;
            fieldingTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
        }
    }

    const defenseTotal = roll + ofFielding;
    // Defense must BEAT the target. Ties go to runner.
    const safe = !(defenseTotal > target.targetWithBonuses);

    const bases = { ...state.bases };
    const newScore = { ...state.score };
    const logs = [];
    let outs = state.outs;

    if (safe) {
        if (target.toBase === 'home') {
            newScore[side]++;
            bases[target.fromBase] = null;
            logs.push(`${target.runnerName} scores! Spd ${target.targetWithBonuses} vs d20(${roll})+OF(${ofFielding})=${defenseTotal}`);
        } else {
            bases[target.toBase] = bases[target.fromBase];
            bases[target.fromBase] = null;
            logs.push(`${target.runnerName} advances to ${target.toBase}! Target ${target.targetWithBonuses} vs ${defenseTotal}`);
        }
    } else {
        outs++;
        // Rule 4: if thrown out going to 3rd, a runner going home still scores
        const otherHomeRunner = eligible.find(e => e.runnerId !== target.runnerId && e.toBase === 'home');
        if (target.toBase === 'third' && otherHomeRunner) {
            // The home runner scores even if this out is the 3rd out
            newScore[side]++;
            bases.third = null; // home runner scored
            logs.push(`${target.runnerName} thrown out at 3rd, but ${otherHomeRunner.runnerName}'s run still scores!`);
        } else {
            logs.push(`${target.runnerName} thrown out! Target ${target.targetWithBonuses} vs d20(${roll})+OF(${ofFielding})=${defenseTotal}`);
        }
        bases[target.fromBase] = null;
    }

    const pendingExtraBaseResult = {
        runnerId: target.runnerId, runnerName: target.runnerName,
        roll, defenseTotal, runnerSpeed: target.targetWithBonuses, safe, goldGloveUsed,
    };

    const battingTeam = { ...state[battingSide] };
    if (safe && target.toBase === 'home') {
        const rpi = [...battingTeam.runsPerInning];
        while (rpi.length < state.inning) rpi.push(0);
        rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + 1;
        battingTeam.runsPerInning = rpi;
    }

    let newState = {
        ...state, bases, outs, score: newScore, pendingExtraBaseResult,
        [fieldingSide]: fieldingTeam, [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
    };

    const remaining = eligible.filter(e => e.runnerId !== target.runnerId);

    if (outs >= 3) return endHalfInning(newState);
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }
    if (remaining.length > 0) {
        return { ...newState, extraBaseEligible: remaining, phase: 'extra_base' };
    }
    return advanceBatter({ ...newState, extraBaseEligible: null });
}

export function handleSkipExtraBase(state) {
    if (state.phase !== 'extra_base') return state;
    const eligible = state.extraBaseEligible || [];
    const bases = { ...state.bases };
    const newScore = { ...state.score };
    const side = state.halfInning === 'top' ? 'away' : 'home';
    const logs = [];
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = { ...state[battingSide] };
    let extraRuns = 0;

    for (const runner of eligible) {
        if (runner.toBase === 'home') {
            newScore[side]++; extraRuns++;
            bases[runner.fromBase] = null;
            logs.push(`${runner.runnerName} scores (no throw)`);
        } else {
            bases[runner.toBase] = bases[runner.fromBase];
            bases[runner.fromBase] = null;
            logs.push(`${runner.runnerName} advances to ${runner.toBase} (no throw)`);
        }
    }

    if (extraRuns > 0) {
        const rpi = [...battingTeam.runsPerInning];
        while (rpi.length < state.inning) rpi.push(0);
        rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + extraRuns;
        battingTeam.runsPerInning = rpi;
    }

    let newState = { ...state, bases, score: newScore, extraBaseEligible: null, [battingSide]: battingTeam, gameLog: [...state.gameLog, ...logs] };
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }
    return advanceBatter(newState);
}
