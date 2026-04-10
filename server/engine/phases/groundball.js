/**
 * Ground ball decision phase handlers.
 */

import { rollD20, getRollSequence } from '../dice.js';
import { findAllGPlayers, recordIconUse, canUseIcon, playerHasIcon } from '../icons.js';
import { INFIELD_POSITIONS } from '../fielding.js';
import { addBatterStat, addPitcherStat, updateWLTracker } from '../stats.js';
import { advanceBatter, endHalfInning } from './baserunning.js';

export function buildGbOptions(state, bases) {
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const fieldingTeam = state[fieldingSide];
    const gPlayers = findAllGPlayers(fieldingTeam, INFIELD_POSITIONS);

    return {
        hasRunnerFirst: !!bases.first,
        hasRunnerSecond: !!bases.second,
        hasRunnerThird: !!bases.third,
        canDP: !!bases.first,
        canForceHome: !!(bases.first && bases.second && bases.third),
        canHoldThird: !!(bases.first && bases.third && !bases.second),
        canHoldRunners: !!(!bases.first && (bases.second || bases.third)),
        canAdvanceRunners: !!(!bases.first && (bases.second || bases.third)),
        gPlayers,
    };
}

export function handleGbDecision(state, action) {
    if (state.phase !== 'gb_decision' || !state.gbOptions) return state;

    const { choice, goldGloveCardId } = action;
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let fieldingTeam = { ...state[fieldingSide] };
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];
    const bases = { ...state.bases };
    // state.outs is unchanged from before the at-bat (no premature +1)
    // Each choice adds its own outs
    let outs = state.outs;
    let runs = 0;
    const logs = [];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    let ifFielding = fieldingTeam.totalInfieldFielding;
    let goldGloveUsed = false;

    if (goldGloveCardId) {
        // Verify the specific player can use G
        const gPlayer = fieldingTeam.lineup.find(p => p.cardId === goldGloveCardId);
        if (gPlayer && playerHasIcon(gPlayer, 'G') && canUseIcon(fieldingTeam, gPlayer.cardId, 'G')) {
            ifFielding += 10;
            goldGloveUsed = true;
            fieldingTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
            logs.push(`G (Gold Glove) from ${gPlayer.name}: +10 to infield fielding!`);
        }
    }

    let pendingDpResult = null;
    const runnersScored = [];
    let dpSucceeded = false;

    switch (choice) {
        case 'dp': {
            // Standard DP: runner on 1st is always out, roll for batter
            bases.first = null; // runner on 1st out (no roll needed)
            outs++; // that's the second out (runner on 1st)

            // Runners on 2nd/3rd advance
            if (bases.third && outs < 3) { runs++; runnersScored.push(bases.third); logs.push('Runner scores from 3rd'); }
            else if (bases.third) { logs.push('Runner on 3rd held — 3rd out'); }
            if (bases.second) { bases.third = bases.second; bases.second = null; }

            // Roll for batter (DP attempt)
            const dpRoll = rollD20();
            const defenseTotal = dpRoll + ifFielding;

            if (defenseTotal > batter.speed) {
                outs++;
                dpSucceeded = true;
                logs.push(`Double Play! d20(${dpRoll}) + IF(${ifFielding}) = ${defenseTotal} > Speed ${batter.speed}`);
                pendingDpResult = { roll: dpRoll, defenseTotal, offenseSpeed: batter.speed, isDP: true, goldGloveUsed, choice: 'dp' };
            } else {
                // Batter safe at 1st
                bases.first = batter.cardId;
                logs.push(`DP avoided — batter safe. d20(${dpRoll}) + IF(${ifFielding}) = ${defenseTotal} <= Speed ${batter.speed}`);
                pendingDpResult = { roll: dpRoll, defenseTotal, offenseSpeed: batter.speed, isDP: false, goldGloveUsed, choice: 'dp' };
            }
            break;
        }

        case 'force_home': {
            // Bases loaded: throw home to get lead runner, batter reaches 1st (FC)
            // The batter out from applyResult was premature — undo it, replace with runner out at home
            // Net effect: same number of outs (1), but it's the runner not the batter
            bases.third = null;
            outs++; // runner at home is out (batter reaches 1st on FC)
            logs.push('Force out at home! Run prevented. Batter reaches 1st (FC).');
            bases.third = bases.second;
            bases.second = bases.first;
            bases.first = batter.cardId;
            pendingDpResult = { roll: 0, defenseTotal: 0, offenseSpeed: 0, isDP: false, goldGloveUsed, choice: 'force_home' };
            break;
        }

        case 'hold': {
            // Hold runners at their bases, throw to 1st for the batter
            // Target = average of batter speed + lead runner speed
            // The lead runner (furthest along) is who the infielder watches most
            const battingTeamObj = state[battingSide];
            let leadRunner = null;
            if (bases.third) leadRunner = battingTeamObj.lineup.find(p => p.cardId === bases.third);
            else if (bases.second) leadRunner = battingTeamObj.lineup.find(p => p.cardId === bases.second);
            else if (bases.first) leadRunner = battingTeamObj.lineup.find(p => p.cardId === bases.first);
            const avgSpeed = leadRunner
                ? Math.round((batter.speed + leadRunner.speed) / 2)
                : batter.speed;

            const roll = rollD20();
            const defenseTotal = roll + ifFielding;

            if (defenseTotal > avgSpeed) {
                // Batter out at 1st — runners held
                outs++;
                logs.push(`Batter out at 1st. d20(${roll}) + IF(${ifFielding}) = ${defenseTotal} > Avg Spd ${avgSpeed}. Runners held.`);
                pendingDpResult = { roll, defenseTotal, offenseSpeed: avgSpeed, isDP: false, goldGloveUsed, choice: 'hold' };
                // If hold-third scenario with runner on 1st, that runner advances to 2nd (force)
                if (state.gbOptions.canHoldThird && bases.first) {
                    bases.second = bases.first;
                    bases.first = null;
                }
            } else {
                // Batter beats throw — safe at 1st, runners held
                // Force runner on 1st to 2nd to make room for batter
                if (bases.first) { bases.second = bases.first; }
                bases.first = batter.cardId;
                logs.push(`Batter safe at 1st! d20(${roll}) + IF(${ifFielding}) = ${defenseTotal} <= Avg Spd ${avgSpeed}. Runners held.`);
                pendingDpResult = { roll, defenseTotal, offenseSpeed: avgSpeed, isDP: false, goldGloveUsed, choice: 'hold' };
            }
            break;
        }

        case 'advance': {
            // Batter out at 1st, runners advance freely
            outs++;
            if (bases.third) { runs++; runnersScored.push(bases.third); logs.push('Runner scores from 3rd on groundout'); }
            if (bases.second) { bases.third = bases.second; bases.second = null; logs.push('Runner on 2nd advances to 3rd'); }
            pendingDpResult = { roll: 0, defenseTotal: 0, offenseSpeed: 0, isDP: false, goldGloveUsed: false, choice: 'advance' };
            break;
        }

        default:
            return state;
    }

    // Runs don't score on the play that makes the 3rd out (force outs)
    if (outs >= 3) runs = 0;

    const newScore = { ...state.score };
    newScore[side] += runs;

    let battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    // Record R stat for runners who scored (only if runs actually counted)
    if (runs > 0) {
        for (const runnerId of runnersScored) {
            battingTeam = addBatterStat(battingTeam, runnerId, 'r');
        }
    }
    // GIDP stat for batter when double play succeeds
    if (dpSucceeded) {
        battingTeam = addBatterStat(battingTeam, batter.cardId, 'gidp');
    }

    // Credit pitcher with runs allowed during GB decision
    if (runs > 0) {
        const pitcherId = fieldingTeam.pitcher.cardId;
        fieldingTeam = addPitcherStat(fieldingTeam, pitcherId, 'r', runs);
    }

    // Track outs recorded by current pitcher for IP credit
    const outsThisPlay = outs - state.outs;
    if (outsThisPlay > 0) {
        fieldingTeam.outsRecordedByCurrentPitcher = (fieldingTeam.outsRecordedByCurrentPitcher || 0) + outsThisPlay;
    }

    // Track the roll for dice animation (dp and hold have actual d20 rolls)
    const hadRoll = pendingDpResult && pendingDpResult.roll > 0;
    let newState = {
        ...state,
        bases, outs, score: newScore, pendingDpResult, gbOptions: null,
        [fieldingSide]: fieldingTeam, [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
        ...(hadRoll ? { lastRoll: pendingDpResult.roll, lastRollType: 'fielding', rollSequence: getRollSequence() } : {}),
    };

    if (runs > 0) newState = updateWLTracker(newState, state.score.home, state.score.away);

    if (outs >= 3) return endHalfInning(newState);

    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }

    return advanceBatter(newState);
}
