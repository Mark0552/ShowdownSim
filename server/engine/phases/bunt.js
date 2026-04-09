/**
 * Sacrifice bunt handler.
 * Rules: Can't bunt with 2 outs. Can't bunt with runner on 3rd.
 * Roll on pitcher's chart: PU = out + runners hold, anything else = out + runners advance 1.
 */

import { rollD20, resolveChart, getRollSequence } from '../dice.js';
import { addBatterStat, addPitcherStat } from '../stats.js';
import { advanceBatter, endHalfInning } from './baserunning.js';

export function handleSacBunt(state) {
    if (state.phase !== 'bunt_decision') return state;

    // Can't bunt with 2 outs or runner on 3rd
    if (state.outs >= 2) return state;
    if (state.bases.third) return state;

    // Must have at least one runner
    if (!state.bases.first && !state.bases.second) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const pitcher = state[fieldingSide].pitcher;
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    const roll = rollD20();
    const chartResult = resolveChart(pitcher.chart, roll, false);

    const bases = { ...state.bases };
    let outs = state.outs + 1; // batter always out
    let runs = 0;
    const logs = [`${batter.name} lays down a sacrifice bunt (roll: ${roll})`];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    if (chartResult === 'PU') {
        logs.push('Bunt popped up — runners hold.');
    } else {
        // Runners advance 1 base
        if (bases.second) { bases.third = bases.second; bases.second = null; }
        if (bases.first) { bases.second = bases.first; bases.first = null; }
        logs.push('Sacrifice successful — runners advance.');
    }

    const newScore = { ...state.score };
    newScore[side] += runs;

    let battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    // Sac bunts count as PA and SH but not AB
    battingTeam = addBatterStat(battingTeam, batter.cardId, 'pa');
    if (chartResult !== 'PU') {
        battingTeam = addBatterStat(battingTeam, batter.cardId, 'sh');
    }

    let fieldingTeamUpdated = { ...state[fieldingSide] };
    fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcher.cardId, 'bf');
    // Track out for IP credit (sac bunt is always 1 out)
    fieldingTeamUpdated.outsRecordedByCurrentPitcher = (fieldingTeamUpdated.outsRecordedByCurrentPitcher || 0) + 1;

    let newState = {
        ...state, bases, outs, score: newScore, lastOutcome: 'SAC',
        [battingSide]: battingTeam, [fieldingSide]: fieldingTeamUpdated,
        lastRoll: roll, lastRollType: 'fielding', rollSequence: getRollSequence(),
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }
    return advanceBatter(newState);
}
