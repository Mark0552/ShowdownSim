/**
 * Ground ball decision phase handlers.
 */

import { rollD20 } from '../dice.js';
import { findAllGPlayers, recordIconUse, canUseIcon, playerHasIcon } from '../icons.js';
import { INFIELD_POSITIONS } from '../fielding.js';
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
        canHoldThird: !!(bases.first && bases.third),
        canHoldRunners: !!(!bases.first && (bases.second || bases.third)),
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
    let outs = state.outs; // already incremented by 1 for batter out
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

    switch (choice) {
        case 'dp': {
            // Standard DP: runner on 1st is always out, roll for batter
            bases.first = null; // runner on 1st out (no roll needed)
            outs++; // that's the second out (runner on 1st)

            // Runners on 2nd/3rd advance
            if (bases.third && outs < 3) { runs++; logs.push('Runner scores from 3rd'); }
            else if (bases.third) { logs.push('Runner on 3rd held — 3rd out'); }
            if (bases.second) { bases.third = bases.second; bases.second = null; }

            // Roll for batter (DP attempt)
            const dpRoll = rollD20();
            const defenseTotal = dpRoll + ifFielding;

            if (defenseTotal > batter.speed) {
                outs++;
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
            // Bases loaded: force out at home (runner on 3rd out, no run scores)
            bases.third = null;
            outs++; // runner at home is out
            logs.push('Force out at home! Run prevented.');
            // Shift runners: 2nd→3rd, 1st→2nd, batter→1st
            bases.third = bases.second;
            bases.second = bases.first;
            bases.first = batter.cardId;
            pendingDpResult = { roll: 0, defenseTotal: 0, offenseSpeed: 0, isDP: false, goldGloveUsed, choice: 'force_home' };
            break;
        }

        case 'hold': {
            // Hold runners at their bases, make fielding play at 1st
            const roll = rollD20();
            const defenseTotal = roll + ifFielding;

            if (defenseTotal > batter.speed) {
                // Batter out at 1st
                logs.push(`Batter out at 1st. d20(${roll}) + IF(${ifFielding}) = ${defenseTotal} > Speed ${batter.speed}. Runners held.`);
                pendingDpResult = { roll, defenseTotal, offenseSpeed: batter.speed, isDP: false, goldGloveUsed, choice: 'hold' };
                // If there was a runner on 1st (hold-third scenario), runner goes to 2nd
                if (state.gbOptions.canHoldThird && bases.first) {
                    bases.second = bases.first;
                    bases.first = null;
                }
            } else {
                // Batter safe at 1st — runners still held
                bases.first = batter.cardId;
                logs.push(`Batter safe at 1st! d20(${roll}) + IF(${ifFielding}) = ${defenseTotal} <= Speed ${batter.speed}. Runners held.`);
                pendingDpResult = { roll, defenseTotal, offenseSpeed: batter.speed, isDP: false, goldGloveUsed, choice: 'hold' };
                // If hold-third scenario, runner on 1st goes to 2nd
                if (state.gbOptions.canHoldThird && state.bases.first) {
                    bases.second = state.bases.first;
                    // batter already placed at first above
                }
            }
            break;
        }

        default:
            return state;
    }

    // Runs don't score on the play that makes the 3rd out (force outs)
    if (outs >= 3) runs = 0;

    const newScore = { ...state.score };
    newScore[side] += runs;

    const battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    let newState = {
        ...state,
        bases, outs, score: newScore, pendingDpResult, gbOptions: null,
        [fieldingSide]: fieldingTeam, [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);

    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }

    return advanceBatter(newState);
}
