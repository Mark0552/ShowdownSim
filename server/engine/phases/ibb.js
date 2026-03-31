/**
 * Intentional walk (IBB) handler.
 * Defense can choose to intentionally walk the batter after substitutions.
 * Batter goes to first, runners forced forward. No pitch, no swing.
 * Tracked as IBB stat (separate from BB).
 */

import { addBatterStat, addPitcherStat } from '../stats.js';
import { advanceBatter, endHalfInning } from './baserunning.js';

export function handleIntentionalWalk(state) {
    if (state.phase !== 'ibb_decision') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let battingTeam = { ...state[battingSide] };
    let fieldingTeamUpdated = { ...state[fieldingSide] };
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];
    const pitcher = fieldingTeamUpdated.pitcher;

    const bases = { ...state.bases };
    let runs = 0;
    const logs = [`Intentional walk to ${batter.name}`];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    // Walk baserunning: force advancement
    let scoringRunnerId = null;
    if (bases.first) {
        if (bases.second) {
            if (bases.third) { runs++; scoringRunnerId = bases.third; logs.push('Runner scores on intentional walk (bases loaded)'); }
            bases.third = bases.second;
        }
        bases.second = bases.first;
    }
    bases.first = batter.cardId;

    // Update score
    const newScore = { ...state.score };
    newScore[side] += runs;

    // Update runs per inning
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    // Record stats: IBB (not a regular BB, not an AB, but is a PA)
    battingTeam = addBatterStat(battingTeam, batter.cardId, 'pa');
    battingTeam = addBatterStat(battingTeam, batter.cardId, 'ibb');
    battingTeam = addBatterStat(battingTeam, batter.cardId, 'bb'); // also counts as total BB
    if (runs > 0) battingTeam = addBatterStat(battingTeam, batter.cardId, 'rbi', runs);
    if (scoringRunnerId) battingTeam = addBatterStat(battingTeam, scoringRunnerId, 'r');
    fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcher.cardId, 'ibb');
    fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcher.cardId, 'bb');
    fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcher.cardId, 'bf');
    if (runs > 0) fieldingTeamUpdated = addPitcherStat(fieldingTeamUpdated, pitcher.cardId, 'r', runs);

    let newState = {
        ...state,
        bases, score: newScore,
        lastOutcome: 'IBB',
        halfInningClean: false,
        [battingSide]: battingTeam,
        [fieldingSide]: fieldingTeamUpdated,
        gameLog: [...state.gameLog, ...logs],
    };

    // Walk-off check
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, 'Walk-off intentional walk! Home team wins!'],
        };
    }

    return advanceBatter(newState);
}

export function handleSkipIBB(state) {
    if (state.phase !== 'ibb_decision') return state;

    // Check if bunt is available: runners on 1st/2nd, no runner on 3rd, <2 outs
    const bases = state.bases;
    const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;

    if (canBunt) {
        return { ...state, phase: 'bunt_decision' };
    }

    return { ...state, phase: 'pitch', controlModifier: state.controlModifier || 0 };
}

export function handleSkipBunt(state) {
    if (state.phase !== 'bunt_decision') return state;
    return { ...state, phase: 'pitch', controlModifier: state.controlModifier || 0 };
}
