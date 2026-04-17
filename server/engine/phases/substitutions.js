/**
 * Substitution phase handlers: pinch hit, pitching change, skip sub, enter pre-atbat.
 */

import { computeFieldingTotals, getFieldingFromSlot, buildFieldingAt, buildRoster } from '../fielding.js';
import { playerHasIcon, canUseIcon } from '../icons.js';
import { addPitcherStat } from '../stats.js';

/** Phase 1: keep fieldingAt + roster in sync after any substitution. Mutates `team` in place. */
function syncAlignment(team) {
    team.fieldingAt = buildFieldingAt(team);
    team.roster = buildRoster(team);
}

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
    syncAlignment(team);

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
    syncAlignment(team);

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

// ============================================================================
// PHASE 2: New atomic substitution operations
// PINCH_RUN, DEFENSIVE_SUB, DOUBLE_SWITCH
// All only allowed during pre_atbat / defense_sub (before pitch roll).
// ============================================================================

/** Pinch run: replace the runner on `base` with a player from the bench.
 *  The new runner takes that base AND replaces the original in battingOrder
 *  (since the original was the previous batter who reached base).
 *  action: { type:'PINCH_RUN', base:'first'|'second'|'third', benchCardId:string } */
export function handlePinchRun(state, action) {
    if (state.phase !== 'pre_atbat') return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = { ...state[battingSide] };
    const bench = [...team.bench];

    const benchIdx = bench.findIndex(p => p.cardId === action.benchCardId);
    if (benchIdx === -1) {
        return { ...state, gameLog: [...state.gameLog, 'Pinch runner not on bench'] };
    }
    const base = action.base;
    if (!['first', 'second', 'third'].includes(base)) return state;
    const runnerCardId = state.bases[base];
    if (!runnerCardId) {
        return { ...state, gameLog: [...state.gameLog, `No runner on ${base} to replace`] };
    }
    const newRunner = { ...bench[benchIdx] };

    // Backup restrictions (same as PH)
    if (newRunner.isBackup) {
        if (state.inning < 5) {
            return { ...state, gameLog: [...state.gameLog, 'Backup players cannot enter the game until after the 4th inning'] };
        }
        const isHome = battingSide === 'homeTeam';
        const canFieldNext = isHome ? state.inning >= 6 : state.inning >= 7;
        if (!canFieldNext) {
            return { ...state, gameLog: [...state.gameLog, 'Backup players cannot take the field before the 7th inning'] };
        }
    }

    // Find the runner in the lineup and swap them out
    const lineup = [...team.lineup];
    const lineupIdx = lineup.findIndex(p => p.cardId === runnerCardId);
    let oldPlayerName = runnerCardId;
    if (lineupIdx >= 0) {
        const oldPlayer = lineup[lineupIdx];
        oldPlayerName = oldPlayer.name;
        // New runner inherits the lineup spot AND the original's defensive position.
        newRunner.assignedPosition = oldPlayer.assignedPosition;
        const slot = oldPlayer.assignedPosition || '';
        const normalized = slot.replace(/-\d+$/, '');
        const isCatcher = normalized === 'C';
        const rawFielding = getFieldingFromSlot(newRunner.positions || [], slot);
        newRunner.fielding = isCatcher ? 0 : rawFielding;
        newRunner.arm = isCatcher ? rawFielding : 0;
        lineup[lineupIdx] = newRunner;
    }

    bench.splice(benchIdx, 1);
    team.lineup = lineup;
    team.bench = bench;
    team.usedPlayers = [...team.usedPlayers, runnerCardId];

    const newBases = { ...state.bases, [base]: newRunner.cardId };

    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;
    team.catcherArm = catcherArm;
    syncAlignment(team);

    return {
        ...state,
        [battingSide]: team,
        bases: newBases,
        gameLog: [...state.gameLog, `${newRunner.name} pinch-runs for ${oldPlayerName} at ${base}`],
    };
}

/** Defensive substitution: bring in a player from the bench to take a defensive
 *  position. The replaced player is removed from the lineup; the new player
 *  takes their lineup slot (or `lineupSlot` if specified for a swap).
 *  action: { type:'DEFENSIVE_SUB', position:string (slot key), benchCardId:string, lineupSlot?:number } */
export function handleDefensiveSub(state, action) {
    if (state.phase !== 'pre_atbat' && state.phase !== 'defense_sub') return state;
    // The fielding team is the one that does defensive subs.
    // pre_atbat: offense's phase, but defensive subs happen on the OTHER team.
    // defense_sub: defense's own phase.
    // For simplicity we route DS to the team this action's caller represents,
    // matched by which team's player is being substituted.
    const homeTeam = state.homeTeam;
    const awayTeam = state.awayTeam;
    const onHome = homeTeam.bench.some(p => p.cardId === action.benchCardId);
    const onAway = awayTeam.bench.some(p => p.cardId === action.benchCardId);
    if (!onHome && !onAway) {
        return { ...state, gameLog: [...state.gameLog, 'Bench player not found'] };
    }
    const teamSide = onHome ? 'homeTeam' : 'awayTeam';
    const team = { ...state[teamSide] };
    const bench = [...team.bench];
    const lineup = [...team.lineup];

    const benchIdx = bench.findIndex(p => p.cardId === action.benchCardId);
    const slot = action.position;
    const replacedIdx = lineup.findIndex(p => p.assignedPosition === slot);
    if (replacedIdx === -1) {
        return { ...state, gameLog: [...state.gameLog, `No fielder at ${slot} to replace`] };
    }
    const oldPlayer = lineup[replacedIdx];
    const newPlayer = { ...bench[benchIdx] };

    // Backup restrictions
    if (newPlayer.isBackup) {
        if (state.inning < 5) {
            return { ...state, gameLog: [...state.gameLog, 'Backup players cannot enter until after the 4th inning'] };
        }
        const isHome = teamSide === 'homeTeam';
        const canFieldNext = isHome ? state.inning >= 6 : state.inning >= 7;
        if (!canFieldNext) {
            return { ...state, gameLog: [...state.gameLog, 'Backup players cannot take the field before the 7th inning'] };
        }
    }

    // Determine target lineup slot (allows position swap with another lineup spot)
    const targetLineupIdx = (action.lineupSlot != null) ? action.lineupSlot : replacedIdx;
    if (targetLineupIdx !== replacedIdx) {
        // Swap the fielding position of the player at targetLineupIdx with `slot`
        const swappedPlayer = lineup[targetLineupIdx];
        if (!swappedPlayer) return state;
        const oldSlot = swappedPlayer.assignedPosition;
        // Move swappedPlayer to the OLD position the new player would have taken
        swappedPlayer.assignedPosition = slot;
        const sNorm = (slot || '').replace(/-\d+$/, '');
        const sIsCatcher = sNorm === 'C';
        const sRaw = getFieldingFromSlot(swappedPlayer.positions || [], slot);
        swappedPlayer.fielding = sIsCatcher ? 0 : sRaw;
        swappedPlayer.arm = sIsCatcher ? sRaw : 0;
        // The new player takes the swapped player's old slot AND the replaced lineup index
        newPlayer.assignedPosition = oldSlot;
        const oNorm = (oldSlot || '').replace(/-\d+$/, '');
        const oIsCatcher = oNorm === 'C';
        const oRaw = getFieldingFromSlot(newPlayer.positions || [], oldSlot);
        newPlayer.fielding = oIsCatcher ? 0 : oRaw;
        newPlayer.arm = oIsCatcher ? oRaw : 0;
        // The replaced player's lineup spot now goes to swappedPlayer (no — the replaced player is GONE)
        // Actually: replaced player removed; targetLineupIdx player keeps batting order
        // newPlayer takes the replaced player's lineup spot
        lineup[replacedIdx] = newPlayer;
        // ...but we already changed the swappedPlayer in place
    } else {
        newPlayer.assignedPosition = oldPlayer.assignedPosition;
        const norm = (slot || '').replace(/-\d+$/, '');
        const isCatcher = norm === 'C';
        const rawFielding = getFieldingFromSlot(newPlayer.positions || [], slot);
        newPlayer.fielding = isCatcher ? 0 : rawFielding;
        newPlayer.arm = isCatcher ? rawFielding : 0;
        lineup[replacedIdx] = newPlayer;
    }

    bench.splice(benchIdx, 1);
    team.lineup = lineup;
    team.bench = bench;
    team.usedPlayers = [...team.usedPlayers, oldPlayer.cardId];

    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;
    team.catcherArm = catcherArm;
    syncAlignment(team);

    return {
        ...state,
        [teamSide]: team,
        gameLog: [...state.gameLog, `Defensive sub: ${newPlayer.name} replaces ${oldPlayer.name} at ${slot}`],
    };
}

/** Double switch: change pitcher AND move/swap a position-player simultaneously.
 *  Typical use: bring in a new pitcher AND put them lower in the batting order
 *  by swapping their lineup spot with another position-player.
 *  action: {
 *    type:'DOUBLE_SWITCH',
 *    bullpenCardId: string,         // new pitcher
 *    benchCardId?: string,          // optional new position player from bench
 *    pitcherLineupSlot: number,     // batting-order slot for the new pitcher
 *    swappedPlayerLineupSlot: number // batting-order slot for the position player
 *  }
 *  Validates: same constraints as pitching change (5+ inning rule), plus
 *  the two slots must be different. */
export function handleDoubleSwitch(state, action) {
    if (state.phase !== 'defense_sub') return state;
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    let team = { ...state[fieldingSide] };
    const bullpen = [...team.bullpen];
    const bench = [...team.bench];
    const lineup = [...team.lineup];

    const bpIdx = bullpen.findIndex(p => p.cardId === action.bullpenCardId);
    if (bpIdx === -1) return { ...state, gameLog: [...state.gameLog, 'Reliever not in bullpen'] };
    const newPitcherCandidate = bullpen[bpIdx];
    if (newPitcherCandidate.role === 'Starter') {
        return { ...state, gameLog: [...state.gameLog, 'Can only bring in relievers or closers'] };
    }
    const battingSide = state.halfInning === 'top' ? 'away' : 'home';
    const isStarter = team.pitcher.role === 'Starter' && team.pitcherEntryInning === 1;
    if (isStarter && state.inning < 5 && state.score[battingSide] < 10) {
        return { ...state, gameLog: [...state.gameLog, "Starter can't be removed before inning 5"] };
    }

    const pitcherSlot = action.pitcherLineupSlot;
    const swappedSlot = action.swappedPlayerLineupSlot;
    if (pitcherSlot === swappedSlot) {
        return { ...state, gameLog: [...state.gameLog, 'Double switch slots must differ'] };
    }
    const swappedExisting = lineup[swappedSlot];
    if (!swappedExisting) return state;

    const oldPitcher = team.pitcher;
    const newPitcher = { ...bullpen[bpIdx] };
    bullpen.splice(bpIdx, 1);

    // Credit departing pitcher with outs this half-inning
    const outsRecorded = team.outsRecordedByCurrentPitcher || 0;
    if (outsRecorded > 0) team = addPitcherStat(team, oldPitcher.cardId, 'ip', outsRecorded);

    // The pitcher always bats DH-or-pitcher slot; here we put them in pitcherSlot
    // with assignedPosition='P' (pitchers don't field a position other than P)
    newPitcher.assignedPosition = 'P';
    newPitcher.fielding = 0;
    newPitcher.arm = 0;

    // The swapped position player: if a benchCardId given, use them; else swap existing
    let removedFromLineup;
    if (action.benchCardId) {
        const benchIdx = bench.findIndex(p => p.cardId === action.benchCardId);
        if (benchIdx === -1) return { ...state, gameLog: [...state.gameLog, 'Bench player not found'] };
        const newPosPlayer = { ...bench[benchIdx] };
        bench.splice(benchIdx, 1);
        if (newPosPlayer.isBackup && state.inning < 5) {
            return { ...state, gameLog: [...state.gameLog, 'Backups cannot enter until after the 4th inning'] };
        }
        // Take the swappedExisting's defensive position
        const targetPos = swappedExisting.assignedPosition;
        newPosPlayer.assignedPosition = targetPos;
        const norm = (targetPos || '').replace(/-\d+$/, '');
        const isCatcher = norm === 'C';
        const rawFielding = getFieldingFromSlot(newPosPlayer.positions || [], targetPos);
        newPosPlayer.fielding = isCatcher ? 0 : rawFielding;
        newPosPlayer.arm = isCatcher ? rawFielding : 0;
        removedFromLineup = swappedExisting.cardId;
        lineup[swappedSlot] = newPosPlayer;
    }
    // Place new pitcher (replaces whoever is at pitcherSlot)
    const removedAtPitcherSlot = lineup[pitcherSlot]?.cardId;
    lineup[pitcherSlot] = newPitcher;

    team.pitcher = newPitcher;
    team.bullpen = bullpen;
    team.bench = bench;
    team.lineup = lineup;
    const used = [...team.usedPlayers, oldPitcher.cardId];
    if (removedFromLineup) used.push(removedFromLineup);
    if (removedAtPitcherSlot && removedAtPitcherSlot !== oldPitcher.cardId) used.push(removedAtPitcherSlot);
    team.usedPlayers = used;
    team.inningsPitched = 0;
    team.pitcherEntryInning = state.inning;
    team.outsRecordedByCurrentPitcher = 0;
    team.cyBonusInnings = 0;

    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;
    team.catcherArm = catcherArm;
    syncAlignment(team);

    const rpCleared = state.rpActivePitcherId === oldPitcher.cardId;
    return {
        ...state,
        [fieldingSide]: team,
        gameLog: [...state.gameLog, `Double switch: ${newPitcher.name} replaces ${oldPitcher.name} (slot ${pitcherSlot + 1}, lineup swap with slot ${swappedSlot + 1})`],
        controlModifier: 0,
        rpActivePitcherId: rpCleared ? null : state.rpActivePitcherId,
        phase: 'pre_atbat', subPhaseStep: 'offense_re',
    };
}

export function handleSkipSub(state) {
    if (state.phase === 'pre_atbat') {
        if (state.subPhaseStep === 'offense_first' || state.subPhaseStep === 'offense_re') {
            return enterDefenseSub(state);
        }
    }
    if (state.phase === 'defense_sub') {
        return enterBuntOrPitch(state);
    }
    return state;
}

/** Enter defense_sub phase — defense always gets this phase (IBB is always an option) */
function enterDefenseSub(state) {
    return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
}

/** After defense skips/finishes, go to bunt decision (if eligible) or pitch */
function enterBuntOrPitch(state) {
    const bases = state.bases;
    const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;
    if (canBunt) {
        return { ...state, phase: 'bunt_decision', subPhaseStep: null };
    }
    return { ...state, phase: 'pitch', controlModifier: state.controlModifier || 0 };
}

export function enterPreAtBat(state) {
    const offSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';

    // Log matchup once per at-bat (not on re-entries from steal etc.)
    if (!state.matchupLogged) {
        const batter = state[offSide].lineup[state[offSide].currentBatterIndex];
        const pitcher = state[defSide].pitcher;
        if (batter && pitcher) {
            state = {
                ...state,
                matchupLogged: true,
                gameLog: [...state.gameLog, `${batter.name} vs ${pitcher.name}`],
            };
        }
    }

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

    // Check SB icon — only for runners on stealable bases (must match client button logic)
    const battingTeam = state[offSide];
    let hasSBOption = false;
    if (bases.first && !bases.second) {
        const runner = battingTeam.lineup.find(p => p.cardId === bases.first);
        if (runner && playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runner.cardId, 'SB')) hasSBOption = true;
    }
    if (bases.second && !bases.third) {
        const runner = battingTeam.lineup.find(p => p.cardId === bases.second);
        if (runner && playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runner.cardId, 'SB')) hasSBOption = true;
    }

    // Bunt is now in bunt_decision phase (after IBB), not pre_atbat

    if (hasBench || hasSBOption || canSteal) {
        return { ...state, phase: 'pre_atbat', subPhaseStep: 'offense_first' };
    }

    // Always go to defense_sub — defense always has IBB as an option
    return enterDefenseSub(state);
}
