/**
 * Steal phase handlers.
 */

import { rollD20, getRollSequence } from '../dice.js';
import { playerHasIcon, canUseIcon, recordIconUse } from '../icons.js';
import { gIconEligible } from '../fielding.js';
import { addBatterStat } from '../stats.js';
import { enterPreAtBat } from './substitutions.js';
import { endHalfInning } from './baserunning.js';

export function handleSteal(state, action) {
    if (state.phase !== 'pre_atbat') return state;
    // One steal event per pre-at-bat (success or fail), per runner at most
    // one active steal per trip to the bases (S+ arrival also counts).
    if (state.stealUsedThisPreAtBat) return state;
    if ((state.runnersAlreadyStole || []).includes(action.runnerId)) return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingTeam = state[battingSide];
    const fieldingTeam = state[fieldingSide];
    const bases = state.bases;

    // Find the runner
    const runnerId = action.runnerId;
    let fromBase = null, toBase = null;
    if (bases.second === runnerId && !bases.third) { fromBase = 'second'; toBase = 'third'; }
    else if (bases.first === runnerId && !bases.second) { fromBase = 'first'; toBase = 'second'; }
    // Special: if runners on 1st and 2nd, and 2nd steals 3rd, 1st auto-advances
    else if (bases.first === runnerId && bases.second && !bases.third) {
        // Runner on 1st can't steal 2nd directly if 2nd is occupied
        // But if 2nd base runner is stealing 3rd... check if the action targets 2nd base runner
        return state;
    }
    else if (bases.second === runnerId && bases.first && !bases.third) {
        fromBase = 'second'; toBase = 'third';
        // Runner on 1st will auto-advance to 2nd if steal succeeds
    }

    if (!fromBase) return state;

    const runner = battingTeam.lineup.find(p => p.cardId === runnerId);
    if (!runner) return state;

    const catcherArmVal = fieldingTeam.catcherArm || 0;
    const stealThirdBonus = toBase === 'third' ? 5 : 0;

    // Check for G icon available on catcher (for steal defense)
    const catcher = fieldingTeam.lineup.find(p => (p.assignedPosition || '').replace(/-\d+$/, '') === 'C');
    const catcherGPlayers = [];
    if (catcher && playerHasIcon(catcher, 'G') && canUseIcon(fieldingTeam, catcher.cardId, 'G')) {
        catcherGPlayers.push({ cardId: catcher.cardId, name: catcher.name, position: 'C' });
    }

    const sbAvailable = playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runnerId, 'SB');
    const autoAdvanceFirst = !!(fromBase === 'second' && bases.first);

    // Throw targets the defense can pick from. Single-runner steals offer one
    // target (the stealer); the auto-advance scenario (2nd steals 3rd while
    // 1st is on base) is treated as a true double steal — the catcher can
    // throw at either the lead stealer (3rd) or the trailing runner (advancing
    // to 2nd). The non-targeted runner reaches their base safely.
    const targets = [{
        runnerId, runnerName: runner.name, runnerSpeed: runner.speed,
        fromBase, toBase, throwBonus: stealThirdBonus,
    }];
    if (autoAdvanceFirst && bases.first) {
        const trailing = battingTeam.lineup.find(p => p.cardId === bases.first);
        if (trailing) {
            targets.push({
                runnerId: trailing.cardId, runnerName: trailing.name, runnerSpeed: trailing.speed,
                fromBase: 'first', toBase: 'second', throwBonus: 0,
            });
        }
    }

    const pendingSteal = {
        // Primary stealer fields kept for back-compat with UI that hasn't
        // been migrated to multi-target yet.
        runnerId, runnerName: runner.name, runnerSpeed: runner.speed,
        fromBase, toBase, catcherArm: catcherArmVal, stealThirdBonus,
        catcherGPlayers, sbAvailable,
        autoAdvanceFirst,
        // Multi-target throw choice (defense picks).
        targets,
    };

    const logs = [`${runner.name} attempts to steal ${toBase}!`];
    if (autoAdvanceFirst && targets.length > 1) {
        logs.push(`${targets[1].runnerName} taking off from 1st on the play.`);
    }

    // If runner has SB icon, prompt offense first
    if (sbAvailable) {
        return {
            ...state,
            phase: 'steal_sb',
            pendingSteal,
            gameLog: [...state.gameLog, ...logs],
        };
    }

    // Always go to defense-picks-throw — no auto-resolve. The defense must
    // explicitly pick a target (and optionally a Gold Glove) before the
    // catcher's throw is rolled.
    return {
        ...state,
        phase: 'steal_resolve',
        pendingSteal,
        gameLog: [...state.gameLog, ...logs],
    };
}

export function handleStealSbDecision(state, action) {
    if (state.phase !== 'steal_sb' || !state.pendingSteal) return state;
    const steal = state.pendingSteal;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';

    if (action.useSB) {
        // SB icon used — automatic safe steal, no roll
        let battingTeam = { ...state[battingSide] };
        battingTeam = recordIconUse(battingTeam, steal.runnerId, 'SB');
        battingTeam = addBatterStat(battingTeam, steal.runnerId, 'sb');
        const bases = { ...state.bases };
        bases[steal.toBase] = bases[steal.fromBase];
        bases[steal.fromBase] = null;
        const logs = [`SB icon used! ${steal.runnerName} steals ${steal.toBase} automatically!`];
        if (steal.autoAdvanceFirst && bases.first) {
            bases.second = bases.first;
            bases.first = null;
            logs.push('Runner on 1st advances to 2nd');
        }
        const pendingStealResult = {
            runnerId: steal.runnerId, runnerName: steal.runnerName,
            roll: 0, defenseTotal: 0, runnerSpeed: steal.runnerSpeed, safe: true, goldGloveUsed: false,
        };
        const runnersAlreadyStole = [
            ...(state.runnersAlreadyStole || []),
            steal.runnerId,
        ];
        return enterPreAtBat({
            ...state, bases, [battingSide]: battingTeam,
            pendingSteal: null, pendingStealResult,
            stealUsedThisPreAtBat: true,
            runnersAlreadyStole,
            gameLog: [...state.gameLog, ...logs],
        });
    }

    // Declined SB — proceed to defense-picks-throw flow.
    return { ...state, phase: 'steal_resolve' };
}

export function handleStealGDecision(state, action) {
    if (state.phase !== 'steal_resolve' || !state.pendingSteal) return state;
    return resolveSteal(state, action.goldGloveCardId || null, action.targetRunnerId || null);
}

export function resolveSteal(state, goldGloveCardId, targetRunnerId) {
    const steal = state.pendingSteal;
    if (!steal) return state;

    // Pick which target the catcher is throwing at. Default to primary
    // (the stealer) for back-compat. For autoAdvanceFirst with two targets,
    // defense's STEAL_G_DECISION action carries targetRunnerId.
    const targets = steal.targets && steal.targets.length > 0 ? steal.targets : [{
        runnerId: steal.runnerId, runnerName: steal.runnerName, runnerSpeed: steal.runnerSpeed,
        fromBase: steal.fromBase, toBase: steal.toBase, throwBonus: steal.stealThirdBonus,
    }];
    const target = (targetRunnerId && targets.find(t => t.runnerId === targetRunnerId)) || targets[0];
    const otherTargets = targets.filter(t => t.runnerId !== target.runnerId);

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let fieldingTeam = state[fieldingSide];

    const roll = rollD20();
    let armTotal = (steal.catcherArm || 0) + (target.throwBonus || 0);
    let goldGloveUsed = false;

    if (goldGloveCardId) {
        const gPlayer = fieldingTeam.lineup.find(p => p.cardId === goldGloveCardId);
        if (gPlayer
            && playerHasIcon(gPlayer, 'G')
            && canUseIcon(fieldingTeam, gPlayer.cardId, 'G')
            && gIconEligible(gPlayer, gPlayer.assignedPosition)) {
            armTotal += 10;
            goldGloveUsed = true;
            fieldingTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
        }
    }

    const defenseTotal = roll + armTotal;
    const safe = !(defenseTotal > target.runnerSpeed); // defense must BEAT speed; ties go to runner

    const bases = { ...state.bases };
    let outs = state.outs;
    const logs = [];

    const pendingStealResult = {
        runnerId: target.runnerId, runnerName: target.runnerName,
        roll, defenseTotal, runnerSpeed: target.runnerSpeed, safe, goldGloveUsed,
    };

    // Resolve the throw against the chosen target.
    if (safe) {
        bases[target.toBase] = bases[target.fromBase];
        bases[target.fromBase] = null;
        logs.push(`${target.runnerName} steals ${target.toBase}! Spd ${target.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
    } else {
        outs++;
        bases[target.fromBase] = null;
        logs.push(`${target.runnerName} caught stealing! Spd ${target.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
        fieldingTeam = { ...fieldingTeam, outsRecordedByCurrentPitcher: (fieldingTeam.outsRecordedByCurrentPitcher || 0) + 1 };
    }

    // Other steal targets (the catcher couldn't throw at them — they're safe).
    for (const other of otherTargets) {
        if (bases[other.fromBase] === other.runnerId) {
            bases[other.toBase] = bases[other.fromBase];
            bases[other.fromBase] = null;
            logs.push(`${other.runnerName} reaches ${other.toBase} on the throw to ${target.toBase}.`);
        }
    }

    // Record SB/CS stats. The targeted runner gets SB on safe / CS on out.
    // Any non-targeted runner who advanced gets credit for the steal too.
    let battingTeam = { ...state[battingSide] };
    if (safe) {
        battingTeam = addBatterStat(battingTeam, target.runnerId, 'sb');
    } else {
        battingTeam = addBatterStat(battingTeam, target.runnerId, 'cs');
    }
    for (const other of otherTargets) {
        battingTeam = addBatterStat(battingTeam, other.runnerId, 'sb');
    }

    // One-shot per pre-at-bat (flag set on both success and fail).
    // Tag any runner who successfully advanced (target if safe, plus any
    // other-target who reached their base on the throw) so they can't try
    // another active steal on the same trip.
    const tagged = [];
    if (safe) tagged.push(target.runnerId);
    for (const other of otherTargets) tagged.push(other.runnerId);
    const runnersAlreadyStole = tagged.length > 0
        ? [...(state.runnersAlreadyStole || []), ...tagged]
        : (state.runnersAlreadyStole || []);

    let newState = {
        ...state, bases, outs,
        [fieldingSide]: fieldingTeam,
        [battingSide]: battingTeam,
        pendingSteal: null, pendingStealResult,
        stealUsedThisPreAtBat: true,
        runnersAlreadyStole,
        lastRoll: roll, lastRollType: 'fielding', rollSequence: getRollSequence(),
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);

    // Return to pre_atbat for remaining decisions, then pitch
    return enterPreAtBat(newState);
}
