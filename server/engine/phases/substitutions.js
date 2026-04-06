/**
 * Substitution phase handlers: pinch hit, pitching change, skip sub, enter pre-atbat.
 */

import { computeFieldingTotals, getFieldingFromSlot } from '../fielding.js';
import { playerHasIcon, canUseIcon } from '../icons.js';
import { addPitcherStat } from '../stats.js';

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
    // Compute fielding from the NEW player's own card positions for the assigned position
    const newPos = (oldPlayer.assignedPosition || '').replace(/-\d+$/, '');
    const isCatcher = newPos === 'C';
    const rawFielding = getFieldingFromSlot(newPlayer.positions || [], oldPlayer.assignedPosition);
    newPlayer.fielding = isCatcher ? 0 : rawFielding;
    newPlayer.arm = isCatcher ? rawFielding : 0;

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
    let team = { ...state[fieldingSide] };
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

    // Credit departing pitcher with their outs recorded this half-inning
    const outsRecorded = team.outsRecordedByCurrentPitcher || 0;
    if (outsRecorded > 0) {
        team = addPitcherStat(team, oldPitcher.cardId, 'ip', outsRecorded);
    }

    team.pitcher = newPitcher;
    team.bullpen = bullpen;
    team.usedPlayers = [...team.usedPlayers, oldPitcher.cardId];
    team.inningsPitched = 0;
    team.pitcherEntryInning = state.inning;
    team.outsRecordedByCurrentPitcher = 0;
    team.cyBonusInnings = 0; // new pitcher doesn't inherit CY bonuses

    // Fix 3: If the departing pitcher had RP active, clear it
    const rpCleared = state.rpActivePitcherId && state.rpActivePitcherId === oldPitcher.cardId;

    let newState = { ...state, [fieldingSide]: team };
    newState.gameLog = [...state.gameLog, `${newPitcher.name} replaces ${oldPitcher.name} on the mound`];

    if (state.subPhaseStep === 'defense') {
        // Pitching change resets to pre_atbat — offense gets full options again
        // (pinch hit, steal, sac bunt) since the pitcher changed
        return { ...newState, phase: 'pre_atbat', subPhaseStep: 'offense_re', controlModifier: 0, rpActivePitcherId: rpCleared ? null : state.rpActivePitcherId };
    }
    return { ...newState, phase: 'ibb_decision', subPhaseStep: null, controlModifier: 0, rpActivePitcherId: rpCleared ? null : state.rpActivePitcherId };
}

export function handleSkipSub(state) {
    if (state.phase === 'pre_atbat') {
        if (state.subPhaseStep === 'offense_first' || state.subPhaseStep === 'offense_re') {
            return enterDefenseSub(state);
        }
    }
    if (state.phase === 'defense_sub') {
        return enterIBBPhase(state);
    }
    return state;
}

/** Enter defense_sub phase if defense has meaningful options, otherwise auto-skip */
function enterDefenseSub(state) {
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const fieldingTeam = state[defSide];

    // Check if pitcher change is available
    const hasRelieversInBullpen = fieldingTeam.bullpen.some(p => p.role !== 'Starter');
    const isStarter = fieldingTeam.pitcher.role === 'Starter' && fieldingTeam.pitcherEntryInning === 1;
    const battingSideKey = state.halfInning === 'top' ? 'away' : 'home';
    const canRemoveStarter = !isStarter || state.inning >= 5 || state.score[battingSideKey] >= 10;
    const canChangePitcher = hasRelieversInBullpen && canRemoveStarter;

    // Check for 20/RP icons
    const has20 = !state.icon20UsedThisInning &&
        playerHasIcon(fieldingTeam.pitcher, '20') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, '20');
    const currentFieldingTeamId = state.halfInning === 'top' ? 'home' : 'away';
    const rpAlreadyUsedByThisTeam = state.rpActiveInning === state.inning && state.rpActiveTeam === currentFieldingTeamId;
    const hasRP = state.inning > 6 && !rpAlreadyUsedByThisTeam &&
        playerHasIcon(fieldingTeam.pitcher, 'RP') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, 'RP');

    if (canChangePitcher || has20 || hasRP) {
        return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
    }

    // No defense options — auto-skip to IBB
    return enterIBBPhase(state);
}

/** Enter IBB phase (always shown — defense can always IBB) then bunt, then pitch */
function enterIBBPhase(state) {
    return { ...state, phase: 'ibb_decision', subPhaseStep: null };
}

export function enterPreAtBat(state) {
    const offSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';

    // Filter bench: backups can't PH before 7th (home bottom of 6th exception)
    // With DH, backups can never PH for pitcher, so they can't PH at all before 7th
    const isHomeBatting = offSide === 'homeTeam';
    const backupAllowed = isHomeBatting ? state.inning >= 6 : state.inning >= 7;
    const eligibleBench = state[offSide].bench.filter(p => !p.isBackup || backupAllowed);
    const hasBench = eligibleBench.length > 0;

    // Relievers only (not starters) — and only if starter can be removed
    const fieldingTeam = state[defSide];
    const hasRelieversInBullpen = fieldingTeam.bullpen.some(p => p.role !== 'Starter');
    const isStarter = fieldingTeam.pitcher.role === 'Starter' && fieldingTeam.pitcherEntryInning === 1;
    const battingSideKey = state.halfInning === 'top' ? 'away' : 'home';
    const canRemoveStarter = !isStarter || state.inning >= 5 || state.score[battingSideKey] >= 10;
    const hasRelievers = hasRelieversInBullpen && canRemoveStarter;
    const bases = state.bases;

    // Check steal eligibility (runner on 1st with 2nd open, or runner on 2nd with 3rd open)
    const canSteal = (bases.first && !bases.second) || (bases.second && !bases.third);

    // Check SB icon
    const battingTeam = state[offSide];
    const hasSBOption = (bases.first || bases.second) &&
        battingTeam.lineup.some(p => playerHasIcon(p, 'SB') && canUseIcon(battingTeam, p.cardId, 'SB'));

    // Bunt is now in bunt_decision phase (after IBB), not pre_atbat

    if (hasBench || hasSBOption || canSteal) {
        return { ...state, phase: 'pre_atbat', subPhaseStep: 'offense_first' };
    }

    // Check defense options: pitcher icons (20, RP)
    const has20b = !state.icon20UsedThisInning &&
        playerHasIcon(fieldingTeam.pitcher, '20') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, '20');
    const fieldTeamId = state.halfInning === 'top' ? 'home' : 'away';
    const rpUsedByThisTeam = state.rpActiveInning === state.inning && state.rpActiveTeam === fieldTeamId;
    const hasRP = state.inning > 6 && !rpUsedByThisTeam &&
        playerHasIcon(fieldingTeam.pitcher, 'RP') &&
        canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, 'RP');

    if (hasRelievers || has20b || hasRP) {
        return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
    }

    return { ...state, phase: 'ibb_decision', subPhaseStep: null };
}
