/**
 * Defense setup phase — fires at every half-inning transition to the
 * defense when the current alignment has ≥1 player at a non-native
 * position (excluding 1B, which is always legal with penalty). Lets
 * the defense drag-drop to fix alignment and/or bring in bench players,
 * then commits atomically via DEFENSE_SETUP_COMMIT.
 */

import {
    computeFieldingTotals,
    buildFieldingAt,
    buildRoster,
    getFieldingFromSlot,
    fieldingPenalty,
} from '../fielding.js';
import { validPossible } from '../defense.js';
import { enterPreAtBat } from './substitutions.js';

const ALL_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH'];

function defSideFromHalf(halfInning) {
    return halfInning === 'top' ? 'homeTeam' : 'awayTeam';
}

function isHomeDefense(halfInning) {
    return halfInning === 'top';
}

function canBackupEnter(state, isHome) {
    if (state.inning >= 7) return true;
    if (isHome && state.inning === 6 && state.halfInning === 'bottom') return true;
    return false;
}

function backupRejection(isHome) {
    return isHome
        ? 'Backup players cannot enter until the bottom of the 6th inning'
        : 'Backup players cannot enter until the top of the 7th inning';
}

/** True if any fielder (non-1B, non-DH, non-bench) is in a non-native slot. */
function hasInvalidAssignment(team) {
    for (const p of team.lineup || []) {
        const slot = p.assignedPosition || '';
        const norm = slot.replace(/-\d+$/, '');
        if (!norm || norm === 'DH' || norm === '1B' || norm === 'bench') continue;
        const { penalty } = fieldingPenalty(p, slot);
        if (penalty < 0) return true;
    }
    return false;
}

/**
 * Called in place of enterPreAtBat at half-inning boundaries.
 * Jumps to defense_setup if the defending team has any OOP players;
 * otherwise falls through to enterPreAtBat.
 */
export function enterDefenseSetupOrPreAtBat(state) {
    const defTeam = state[defSideFromHalf(state.halfInning)];
    if (defTeam && hasInvalidAssignment(defTeam)) {
        return { ...state, phase: 'defense_setup' };
    }
    return enterPreAtBat(state);
}

/**
 * DEFENSE_SETUP_COMMIT { alignment: { slotKey: cardId } }
 * alignment must cover all 9 slots (C, 1B, 2B, 3B, SS, LF-RF-1, LF-RF-2,
 * CF, DH) with cardIds drawn from the current lineup + bench. Any old
 * lineup card not in the new alignment is archived (subbed out).
 */
export function handleDefenseSetupCommit(state, action) {
    if (state.phase !== 'defense_setup') return state;
    const defSide = defSideFromHalf(state.halfInning);
    const team = { ...state[defSide] };
    const isHome = isHomeDefense(state.halfInning);

    const alignment = action?.alignment || {};

    // Gather current cards (lineup + bench) for lookup
    const oldLineup = team.lineup || [];
    const oldBench = team.bench || [];
    const oldLineupIds = new Set(oldLineup.map(p => p.cardId));
    const byId = {};
    for (const p of oldLineup) byId[p.cardId] = p;
    for (const p of oldBench) byId[p.cardId] = p;

    // Validate alignment shape and cardIds
    const seen = new Set();
    for (const slotKey of ALL_SLOTS) {
        const cardId = alignment[slotKey];
        if (!cardId) {
            return { ...state, gameLog: [...state.gameLog, `Defense setup rejected: ${slotKey} unfilled`] };
        }
        if (!byId[cardId]) {
            return { ...state, gameLog: [...state.gameLog, `Defense setup rejected: unknown card`] };
        }
        if (seen.has(cardId)) {
            return { ...state, gameLog: [...state.gameLog, `Defense setup rejected: duplicate card`] };
        }
        seen.add(cardId);
    }

    // Backup entry rule: any bench→lineup move must pass timing
    for (const slotKey of ALL_SLOTS) {
        const cardId = alignment[slotKey];
        if (!oldLineupIds.has(cardId)) {
            const card = byId[cardId];
            if (card?.isBackup && !canBackupEnter(state, isHome)) {
                return { ...state, gameLog: [...state.gameLog, backupRejection(isHome)] };
            }
        }
    }

    // Build the proposed new lineup (9 PlayerSlots with updated positions)
    const newLineup = ALL_SLOTS.map(slotKey => {
        const card = byId[alignment[slotKey]];
        const updated = { ...card };
        updated.assignedPosition = slotKey;
        const norm = slotKey.replace(/-\d+$/, '');
        const isCatcher = norm === 'C';
        const raw = getFieldingFromSlot(card.positions || [], slotKey);
        updated.fielding = isCatcher ? 0 : raw;
        updated.arm = isCatcher ? raw : 0;
        return updated;
    });

    // If validPossible on the new 9 cards, every non-1B non-DH must be native.
    if (validPossible(newLineup)) {
        for (const slotKey of ALL_SLOTS) {
            const norm = slotKey.replace(/-\d+$/, '');
            if (norm === 'DH' || norm === '1B') continue;
            const card = byId[alignment[slotKey]];
            const { penalty } = fieldingPenalty(card, slotKey);
            if (penalty < 0) {
                return { ...state, gameLog: [...state.gameLog, 'Defense setup rejected: a valid native arrangement exists — fix OOP positions'] };
            }
        }
    }

    // Archive cards removed from lineup
    const newIds = new Set(newLineup.map(p => p.cardId));
    const archivedPlayers = { ...(team.archivedPlayers || {}) };
    const usedPlayers = [...(team.usedPlayers || [])];
    const droppedNames = [];
    const addedNames = [];
    for (const p of oldLineup) {
        if (!newIds.has(p.cardId)) {
            archivedPlayers[p.cardId] = p;
            usedPlayers.push(p.cardId);
            droppedNames.push(p.name);
        }
    }
    for (const p of newLineup) {
        if (!oldLineupIds.has(p.cardId)) addedNames.push(p.name);
    }

    const newBench = oldBench.filter(p => !newIds.has(p.cardId));

    team.lineup = newLineup;
    team.bench = newBench;
    team.archivedPlayers = archivedPlayers;
    team.usedPlayers = usedPlayers;
    const totals = computeFieldingTotals(newLineup);
    team.totalInfieldFielding = totals.totalInfieldFielding;
    team.totalOutfieldFielding = totals.totalOutfieldFielding;
    team.catcherArm = totals.catcherArm;
    team.fieldingAt = buildFieldingAt(team);
    team.roster = buildRoster(team);

    const logs = [];
    if (droppedNames.length > 0) logs.push(`Defense sub: ${addedNames.join(', ')} in for ${droppedNames.join(', ')}`);
    logs.push('Defense set');

    let newState = { ...state, [defSide]: team, gameLog: [...state.gameLog, ...logs] };
    return enterPreAtBat(newState);
}

/**
 * POSITION_SWAP { slotA, slotB } — swap the assignedPosition of two
 * players currently in the defending team's lineup. Valid in defense_sub
 * and defense_setup phases. No subs, no archives.
 */
export function handlePositionSwap(state, action) {
    if (state.phase !== 'defense_sub' && state.phase !== 'defense_setup') return state;
    const defSide = defSideFromHalf(state.halfInning);
    const team = { ...state[defSide] };
    const lineup = [...(team.lineup || [])];
    const a = lineup.findIndex(p => p.assignedPosition === action?.slotA);
    const b = lineup.findIndex(p => p.assignedPosition === action?.slotB);
    if (a === -1 || b === -1 || a === b) {
        return { ...state, gameLog: [...state.gameLog, 'Position swap rejected'] };
    }

    const pa = { ...lineup[a] };
    const pb = { ...lineup[b] };
    const slotA = pa.assignedPosition;
    const slotB = pb.assignedPosition;

    pa.assignedPosition = slotB;
    const bNorm = (slotB || '').replace(/-\d+$/, '');
    const bIsC = bNorm === 'C';
    const bRaw = getFieldingFromSlot(pa.positions || [], slotB);
    pa.fielding = bIsC ? 0 : bRaw;
    pa.arm = bIsC ? bRaw : 0;

    pb.assignedPosition = slotA;
    const aNorm = (slotA || '').replace(/-\d+$/, '');
    const aIsC = aNorm === 'C';
    const aRaw = getFieldingFromSlot(pb.positions || [], slotA);
    pb.fielding = aIsC ? 0 : aRaw;
    pb.arm = aIsC ? aRaw : 0;

    lineup[a] = pa;
    lineup[b] = pb;
    team.lineup = lineup;
    const totals = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totals.totalInfieldFielding;
    team.totalOutfieldFielding = totals.totalOutfieldFielding;
    team.catcherArm = totals.catcherArm;
    team.fieldingAt = buildFieldingAt(team);
    team.roster = buildRoster(team);

    return {
        ...state,
        [defSide]: team,
        gameLog: [...state.gameLog, `Defense swap: ${pa.name} ↔ ${pb.name}`],
    };
}
