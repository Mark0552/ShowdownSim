/**
 * Core baserunning: applyResult, advanceBatter, endHalfInning.
 */

import { addBatterStat, addPitcherStat } from '../stats.js';
import { playerHasIcon, canUseIcon, recordIconUse } from '../icons.js';
import { enterPreAtBat } from './substitutions.js';
import { buildGbOptions } from './groundball.js';
import { checkExtraBaseEligible } from './extrabase.js';

export function applyResult(state, outcome, batterId) {
    const bases = { ...state.bases };
    let outs = state.outs;
    let runs = 0;
    const logs = [];
    const side = state.halfInning === 'top' ? 'away' : 'home';
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];
    let halfInningClean = state.halfInningClean;

    switch (outcome) {
        case 'SO':
        case 'PU':
            outs++;
            break;

        case 'GB': {
            // GB enters gb_decision phase for defense choices
            outs++; // batter is always at least out

            // With 3 outs (had 2 before), no decisions — inning over
            if (outs >= 3) break;

            const gbOptions = buildGbOptions(state, bases);

            if (!gbOptions.canDP && !gbOptions.canHoldRunners && !gbOptions.canHoldThird && !gbOptions.canForceHome) {
                // No runners or no special options — simple GB out
                // Runners on 2nd/3rd advance freely
                if (bases.third) { runs++; logs.push('Runner scores from 3rd on groundout'); }
                if (bases.second) { bases.third = bases.second; bases.second = null; }
                break;
            }

            // Enter gb_decision phase — defense gets to choose
            const battingTeam = { ...state[battingSide] };
            const rpi = [...battingTeam.runsPerInning];
            while (rpi.length < state.inning) rpi.push(0);
            battingTeam.runsPerInning = rpi;

            return {
                ...state,
                outs,
                lastOutcome: outcome,
                phase: 'gb_decision',
                gbOptions,
                gameLog: [...state.gameLog, `Ground Ball — defense decides...`],
                [battingSide]: battingTeam,
            };
        }

        case 'FB':
            outs++;
            // Tag-up handled by extra base check below
            break;

        case 'W':
            if (bases.first) {
                if (bases.second) {
                    if (bases.third) { runs++; logs.push('Runner scores on walk'); }
                    bases.third = bases.second;
                }
                bases.second = bases.first;
            }
            bases.first = batterId;
            halfInningClean = false;
            break;

        case 'S': {
            if (bases.third) { runs++; logs.push('Runner scores from third'); }
            bases.third = bases.second || null;
            bases.second = bases.first || null;
            bases.first = batterId;
            halfInningClean = false;
            break;
        }

        case 'SPlus': {
            // S+ = regular single, then batter auto-steals 2nd if open
            if (bases.third) { runs++; logs.push('Runner scores from third'); }
            bases.third = bases.second || null;
            bases.second = bases.first || null;
            bases.first = batterId;
            if (!bases.second) {
                bases.second = batterId;
                bases.first = null;
                logs.push(`${batter.name} steals 2nd on S+ (auto)`);
            }
            halfInningClean = false;
            break;
        }

        case 'DB': {
            if (bases.third) { runs++; }
            if (bases.second) { runs++; }
            if (bases.first) { bases.third = bases.first; }
            else { bases.third = null; }
            bases.second = batterId;
            bases.first = null;
            halfInningClean = false;
            break;
        }

        case 'TR': {
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            bases.third = batterId;
            bases.second = null;
            bases.first = null;
            halfInningClean = false;
            break;
        }

        case 'HR': {
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            runs++;
            if (runs > 1) logs.push(`${runs}-run homer!`);
            else logs.push('Solo home run!');
            bases.first = null; bases.second = null; bases.third = null;
            halfInningClean = false;
            break;
        }
    }

    const isHit = ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(outcome);
    const isOut = ['SO', 'GB', 'FB', 'PU'].includes(outcome);
    if (isHit) halfInningClean = false;

    const newScore = { ...state.score };
    newScore[side] += runs;

    let battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;
    if (isHit) battingTeam.hits = (battingTeam.hits || 0) + 1;

    // Record batter stats
    const isAB = outcome !== 'W'; // walks don't count as AB
    if (isAB) battingTeam = addBatterStat(battingTeam, batterId, 'ab');
    if (isHit) battingTeam = addBatterStat(battingTeam, batterId, 'h');
    if (outcome === 'W') battingTeam = addBatterStat(battingTeam, batterId, 'bb');
    if (outcome === 'SO') battingTeam = addBatterStat(battingTeam, batterId, 'so');
    if (outcome === 'HR') battingTeam = addBatterStat(battingTeam, batterId, 'hr');
    if (runs > 0) battingTeam = addBatterStat(battingTeam, batterId, 'rbi', runs);

    // Record pitcher stats
    let fieldingTeamUpdated = { ...state[fieldingSide] };
    const pitcherId = fieldingTeamUpdated.pitcher.cardId;
    fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'bf');
    if (isHit) fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'h');
    if (outcome === 'W') fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'bb');
    if (outcome === 'SO') fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'so');
    if (outcome === 'HR') fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'hr');
    if (runs > 0) fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcherId, 'r', runs);

    let newState = {
        ...state, bases, outs, score: newScore, pendingDpResult: null, halfInningClean,
        gameLog: [...state.gameLog, ...logs],
        [battingSide]: battingTeam,
        [fieldingSide]: fieldingTeamUpdated,
    };

    if (outs >= 3) return endHalfInning(newState);

    // Walk-off check
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }

    // Extra base eligibility
    const extraBaseEligible = checkExtraBaseEligible(newState, outcome);
    if (extraBaseEligible && extraBaseEligible.length > 0) {
        return { ...newState, phase: 'extra_base_offer', extraBaseEligible };
    }

    return advanceBatter(newState);
}

export function advanceBatter(state) {
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = { ...state[battingSide] };
    team.currentBatterIndex = (team.currentBatterIndex + 1) % 9;
    return enterPreAtBat({ ...state, [battingSide]: team });
}

export function endHalfInning(state) {
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = { ...state[battingSide] };
    battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % 9;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    let fieldingTeam = { ...state[fieldingSide] };
    fieldingTeam.inningsPitched = (fieldingTeam.inningsPitched || 0) + 1;

    // Record pitcher IP (stored in thirds: 3 = 1 full inning)
    const pitcherId = fieldingTeam.pitcher.cardId;
    fieldingTeam = addPitcherStat(fieldingTeam, pitcherId, 'ip', 3);

    // CY icon check
    if (state.halfInningClean && playerHasIcon(fieldingTeam.pitcher, 'CY')) {
        const pitcher = fieldingTeam.pitcher;
        if (canUseIcon(fieldingTeam, pitcher.cardId, 'CY')) {
            fieldingTeam = recordIconUse(fieldingTeam, pitcher.cardId, 'CY');
            fieldingTeam.inningsPitched = Math.max(0, fieldingTeam.inningsPitched - 1);
            state = { ...state, gameLog: [...state.gameLog, `CY icon: ${pitcher.name} threw a 1-2-3 inning! +1 effective IP`] };
        }
    }

    let s = { ...state, [battingSide]: battingTeam, [fieldingSide]: fieldingTeam };

    if (state.halfInning === 'top') {
        if (state.inning >= 9 && state.score.home > state.score.away) {
            return { ...s, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...s.gameLog, `Game Over! Home team wins ${state.score.home}-${state.score.away}`] };
        }
        return {
            ...s, halfInning: 'bottom', outs: 0, bases: { first: null, second: null, third: null },
            phase: 'pre_atbat', subPhaseStep: 'offense_first',
            lastOutcome: null, pendingDpResult: null, extraBaseEligible: null, pendingExtraBaseResult: null,
            iconPrompt: null, halfInningClean: true, icon20UsedThisInning: false, gbOptions: null,
            pendingSteal: null, pendingStealResult: null,
            controlModifier: (s.rpActiveInning === state.inning && s.rpActiveTeam === 'home') ? s.controlModifier : 0,
            gameLog: [...s.gameLog, `--- Bottom of ${state.inning} ---`],
        };
    }

    if (state.inning >= 9 && state.score.home !== state.score.away) {
        const winner = state.score.home > state.score.away ? state.homeTeam.userId : state.awayTeam.userId;
        return { ...s, phase: 'game_over', isOver: true, winnerId: winner, gameLog: [...s.gameLog, `Game Over! ${state.score.away}-${state.score.home}`] };
    }

    const away = { ...s.awayTeam, runsPerInning: [...s.awayTeam.runsPerInning] };
    const home = { ...s.homeTeam, runsPerInning: [...s.homeTeam.runsPerInning] };
    while (away.runsPerInning.length < state.inning + 1) away.runsPerInning.push(0);
    while (home.runsPerInning.length < state.inning + 1) home.runsPerInning.push(0);

    const newControlMod = (s.rpActiveInning === state.inning + 1 && s.rpActiveTeam === 'away') ? s.controlModifier : 0;

    return {
        ...s, awayTeam: away, homeTeam: home,
        inning: state.inning + 1, halfInning: 'top',
        outs: 0, bases: { first: null, second: null, third: null },
        phase: 'pre_atbat', subPhaseStep: 'offense_first',
        lastOutcome: null, pendingDpResult: null, extraBaseEligible: null, pendingExtraBaseResult: null,
        iconPrompt: null, halfInningClean: true, icon20UsedThisInning: false,
        controlModifier: newControlMod, gbOptions: null,
        pendingSteal: null, pendingStealResult: null,
        gameLog: [...s.gameLog, `--- Top of ${state.inning + 1} ---`],
    };
}
