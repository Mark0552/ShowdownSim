/**
 * Sacrifice bunt handler.
 */

import { rollD20, resolveChart } from '../dice.js';
import { advanceBatter, endHalfInning } from './baserunning.js';

export function handleSacBunt(state) {
    if (state.phase !== 'pre_atbat') return state;
    if (!state.bases.first && !state.bases.second && !state.bases.third) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const pitcher = state[fieldingSide].pitcher;
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    const roll = rollD20();
    const chartResult = resolveChart(pitcher.chart, roll, false);

    const bases = { ...state.bases };
    let outs = state.outs + 1;
    let runs = 0;
    const logs = [`${batter.name} lays down a sacrifice bunt (roll: ${roll})`];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    if (chartResult === 'PU') {
        logs.push('Popup! Runners hold.');
    } else {
        if (bases.third) { runs++; logs.push('Runner scores from 3rd on sac bunt'); }
        bases.third = bases.second || null;
        bases.second = bases.first || null;
        bases.first = null;
    }

    const newScore = { ...state.score };
    newScore[side] += runs;

    const battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    let newState = { ...state, bases, outs, score: newScore, lastOutcome: 'PU', [battingSide]: battingTeam, gameLog: [...state.gameLog, ...logs] };

    if (outs >= 3) return endHalfInning(newState);
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId, gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }
    return advanceBatter(newState);
}
