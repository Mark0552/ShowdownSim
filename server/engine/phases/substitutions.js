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

/** Archive a substituted-out player so the box score can still show their stats. */
function archivePlayer(team, player) {
    if (!player) return;
    team.archivedPlayers = { ...(team.archivedPlayers || {}), [player.cardId]: player };
}

/**
 * Backup-player entry rule (DH-only game, no PH-for-pitcher exception):
 *   Home backup may enter starting bottom of the 6th (or any inning ≥ 7).
 *   Away backup may enter starting top of the 7th (any inning ≥ 7).
 * Applies uniformly to all sub types (PH, PR, DS).
 */
function canBackupEnter(state, isHomeTeam) {
    if (state.inning >= 7) return true;
    if (isHomeTeam && state.inning === 6 && state.halfInning === 'bottom') return true;
    return false;
}

function backupRejection(isHomeTeam) {
    return isHomeTeam
        ? 'Backup players cannot enter until the bottom of the 6th inning'
        : 'Backup players cannot enter until the top of the 7th inning';
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

    // Backup player entry rule (unified)
    if (newPlayer.isBackup && !canBackupEnter(state, battingSide === 'homeTeam')) {
        return { ...state, gameLog: [...state.gameLog, backupRejection(battingSide === 'homeTeam')] };
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
    archivePlayer(team, oldPlayer);

    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;
    team.catcherArm = catcherArm;
    syncAlignment(team);

    const newState = {
        ...state,
        [battingSide]: team,
        // Re-log the matchup now that the pinch hitter is the batter.
        matchupLogged: false,
        gameLog: [...state.gameLog, `${newPlayer.name} pinch-hits for ${oldPlayer.name}`],
    };
    // Stay in pre_atbat so the offense can also pinch-run, steal, or use an
    // SB icon before ending their sub phase. enterPreAtBat auto-skips to
    // defense_sub if no further offense options remain (matches the PR flow).
    return enterPreAtBat(newState);
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
    archivePlayer(team, oldPitcher);
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
// Atomic substitution operations
// PINCH_RUN, DEFENSIVE_SUB
// All only allowed during pre_atbat / defense_sub (before pitch roll).
// (Double Switch intentionally not implemented — DH-only game makes the
// traditional double-switch tactic unnecessary; the only edge case where
// it'd matter is DH-forfeit, which we don't model.)
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

    if (newRunner.isBackup && !canBackupEnter(state, battingSide === 'homeTeam')) {
        return { ...state, gameLog: [...state.gameLog, backupRejection(battingSide === 'homeTeam')] };
    }

    // Find the runner in the lineup and swap them out
    const lineup = [...team.lineup];
    const lineupIdx = lineup.findIndex(p => p.cardId === runnerCardId);
    let oldPlayerName = runnerCardId;
    let oldPlayerForArchive = null;
    if (lineupIdx >= 0) {
        const oldPlayer = lineup[lineupIdx];
        oldPlayerName = oldPlayer.name;
        oldPlayerForArchive = oldPlayer;
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
    if (oldPlayerForArchive) archivePlayer(team, oldPlayerForArchive);

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

    if (newPlayer.isBackup && !canBackupEnter(state, teamSide === 'homeTeam')) {
        return { ...state, gameLog: [...state.gameLog, backupRejection(teamSide === 'homeTeam')] };
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
    archivePlayer(team, oldPlayer);

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

    // Prune runnersAlreadyStole: drop cardIds no longer on base (scored,
    // thrown out, or just left the basepaths some other way). A card that
    // leaves and later returns via a fresh hit starts unflagged.
    const onBases = new Set([state.bases.first, state.bases.second, state.bases.third].filter(Boolean));
    const pruned = (state.runnersAlreadyStole || []).filter(id => onBases.has(id));
    if (pruned.length !== (state.runnersAlreadyStole || []).length) {
        state = { ...state, runnersAlreadyStole: pruned };
    }

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

    // Check steal eligibility. A runner is eligible if their target base is
    // open AND they haven't already used their one steal (via prior success
    // or via S+ auto-advance). Also gate on the per-pre-at-bat cap.
    const alreadyStole = new Set(state.runnersAlreadyStole || []);
    const firstCanSteal = !!bases.first && !bases.second && !alreadyStole.has(bases.first);
    const secondCanSteal = !!bases.second && !bases.third && !alreadyStole.has(bases.second);
    const canSteal = !state.stealUsedThisPreAtBat && (firstCanSteal || secondCanSteal);

    // Check SB icon — only for runners on stealable bases who are still eligible.
    const battingTeam = state[offSide];
    let hasSBOption = false;
    if (firstCanSteal) {
        const runner = battingTeam.lineup.find(p => p.cardId === bases.first);
        if (runner && playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runner.cardId, 'SB')) hasSBOption = true;
    }
    if (secondCanSteal) {
        const runner = battingTeam.lineup.find(p => p.cardId === bases.second);
        if (runner && playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runner.cardId, 'SB')) hasSBOption = true;
    }
    if (state.stealUsedThisPreAtBat) hasSBOption = false;

    // Bunt is now in bunt_decision phase (after IBB), not pre_atbat

    if (hasBench || hasSBOption || canSteal) {
        return { ...state, phase: 'pre_atbat', subPhaseStep: 'offense_first' };
    }

    // Always go to defense_sub — defense always has IBB as an option
    return enterDefenseSub(state);
}
