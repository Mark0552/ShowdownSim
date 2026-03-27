/**
 * Substitution phase handlers: pinch hit, pitching change, skip sub, enter pre-atbat.
 */

import { computeFieldingTotals } from '../fielding.js';
import { playerHasIcon, canUseIcon } from '../icons.js';

export function handlePinchHit(state, action) {
    if (state.phase !== 'pre_atbat') return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = { ...state[battingSide] };
    const lineup = [...team.lineup];
    const bench = [...team.bench];

    const benchIdx = bench.findIndex(p => p.cardId === action.benchCardId);
    if (benchIdx === -1) return state;

    const idx = action.lineupIndex ?? team.currentBatterIndex;
    const oldPlayer = lineup[idx];
    const newPlayer = { ...bench[benchIdx] };

    // Backup player restrictions
    if (newPlayer.isBackup) {
        if (state.inning < 5) {
            return { ...state, gameLog: [...state.gameLog, `Backup players cannot pinch hit until after the 4th inning`] };
        }
        const isHome = battingSide === 'homeTeam';
        const canFieldNext = isHome ? state.inning >= 6 : state.inning >= 7;
        if (!canFieldNext) {
            const msg = isHome
                ? `Backup players cannot take the field before the 7th inning (home team can PH from bottom of 6th)`
                : `Backup players cannot take the field before the 7th inning`;
            return { ...state, gameLog: [...state.gameLog, msg] };
        }
    }

    newPlayer.assignedPosition = oldPlayer.assignedPosition;
    newPlayer.fielding = oldPlayer.fielding;
    newPlayer.arm = oldPlayer.arm;

    lineup[idx] = newPlayer;
    bench.splice(benchIdx, 1);
    team.lineup = lineup;
    team.bench = bench;
    team.usedPlayers = [...team.usedPlayers, oldPlayer.cardId];

    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;
    team.catcherArm = catcherArm;

    const newState = { ...state, [battingSide]: team };
    newState.gameLog = [...state.gameLog, `${newPlayer.name} pinch-hits for ${oldPlayer.name}`];
    return { ...newState, phase: 'defense_sub', subPhaseStep: 'defense' };
}

export function handlePitchingChange(state, action) {
    if (state.phase !== 'defense_sub') return state;
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const team = { ...state[fieldingSide] };
    const bullpen = [...team.bullpen];

    const bpIdx = bullpen.findIndex(p => p.cardId === action.bullpenCardId);
    if (bpIdx === -1) return state;

    // Can only bring in relievers/closers, not starters
    const newPitcherCandidate = bullpen[bpIdx];
    if (newPitcherCandidate.role === 'Starter') {
        return { ...state, gameLog: [...state.gameLog, `Can only bring in relievers or closers (not starters)`] };
    }

    // Starter can't be removed before inning 5 unless 10+ runs scored
    const battingSide = state.halfInning === 'top' ? 'away' : 'home';
    const isStarter = team.pitcher.role === 'Starter' && team.pitcherEntryInning === 1;
    if (isStarter && state.inning < 5) {
        if (state.score[battingSide] < 10) {
            return { ...state, gameLog: [...state.gameLog, `Starter can't be removed before inning 5 (unless 10+ runs scored)`] };
        }
    }

    const oldPitcher = team.pitcher;
    const newPitcher = { ...bullpen[bpIdx] };
    bullpen.splice(bpIdx, 1);

    team.pitcher = newPitcher;
    team.bullpen = bullpen;
    team.usedPlayers = [...team.usedPlayers, oldPitcher.cardId];
    team.inningsPitched = 0;
    team.pitcherEntryInning = state.inning;

    let newState = { ...state, [fieldingSide]: team };
    newState.gameLog = [...state.gameLog, `${newPitcher.name} replaces ${oldPitcher.name} on the mound`];

    if (state.subPhaseStep === 'defense') {
        // Pitching change resets to pre_atbat — offense gets full options again
        // (pinch hit, steal, sac bunt) since the pitcher changed
        return { ...newState, phase: 'pre_atbat', subPhaseStep: 'offense_re', controlModifier: 0 };
    }
    return { ...newState, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
}

export function handleSkipSub(state) {
    if (state.phase === 'pre_atbat') {
        if (state.subPhaseStep === 'offense_first') {
            const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
            const fieldingTeam = state[fieldingSide];
            const hasRelievers = fieldingTeam.bullpen.some(p => p.role !== 'Starter');
            const has20 = !state.icon20UsedThisInning &&
                playerHasIcon(fieldingTeam.pitcher, '20') &&
                canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, '20');
            const hasRP = state.inning > 6 && !state.rpActiveInning &&
                playerHasIcon(fieldingTeam.pitcher, 'RP') &&
                canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, 'RP');
            if (hasRelievers || has20 || hasRP) {
                return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
            }
            return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
        }
        if (state.subPhaseStep === 'offense_re') {
            return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
        }
    }
    if (state.phase === 'defense_sub') {
        return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
    }
    return state;
}

export function enterPreAtBat(state) {
    const offSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const hasBench = state[offSide].bench.length > 0;
    const hasRelievers = state[defSide].bullpen.some(p => p.role !== 'Starter');
    const bases = state.bases;

    // Check steal eligibility (runner on 1st with 2nd open, or runner on 2nd with 3rd open)
    const canSteal = (bases.first && !bases.second) || (bases.second && !bases.third);

    // Check SB icon
    const battingTeam = state[offSide];
    const hasSBOption = (bases.first || bases.second) &&
        battingTeam.lineup.some(p => playerHasIcon(p, 'SB') && canUseIcon(battingTeam, p.cardId, 'SB'));

    // Check sac bunt eligibility
    const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;

    if (hasBench || hasSBOption || canSteal || canBunt) {
        return { ...state, phase: 'pre_atbat', subPhaseStep: 'offense_first' };
    }

    // Check defense options: bullpen (relievers only) or pitcher icons (20, RP)
    const fieldingTeam = state[defSide];
    const has20 = !state.icon20UsedThisInning &&
        playerHasIcon(fieldingTeam.pitcher, '20') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, '20');
    const hasRP = state.inning > 6 && !state.rpActiveInning &&
        playerHasIcon(fieldingTeam.pitcher, 'RP') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, 'RP');

    if (hasRelievers || has20 || hasRP) {
        return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
    }

    return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
}
