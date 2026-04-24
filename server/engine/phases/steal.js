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

    const leadSbAvailable = playerHasIcon(runner, 'SB') && canUseIcon(battingTeam, runnerId, 'SB');
    const autoAdvanceFirst = !!(fromBase === 'second' && bases.first);

    // Build the per-runner decision targets. The lead runner is committed to
    // attempting (the offense already clicked STEAL for them); their only
    // remaining choice is whether to use the SB icon. The trailing runner
    // (auto-advance scenario) is a separate decision: STEAL or STAY, and
    // then SB if applicable.
    const targets = [{
        runnerId, runnerName: runner.name, runnerSpeed: runner.speed,
        fromBase, toBase, throwBonus: stealThirdBonus,
        // Outcome resolved as offense decides. 'pending-sb' = SB icon decision
        // pending. 'pending-go' = STEAL/STAY decision pending (trailing only).
        // 'sb' = automatic safe via icon. 'steal' = attempting (defense may
        // throw). 'stay' = not moving.
        sbAvailable: leadSbAvailable,
        outcome: leadSbAvailable ? 'pending-sb' : 'steal',
    }];
    if (autoAdvanceFirst && bases.first) {
        const trailing = battingTeam.lineup.find(p => p.cardId === bases.first);
        if (trailing) {
            const trailingSbAvailable = playerHasIcon(trailing, 'SB') && canUseIcon(battingTeam, trailing.cardId, 'SB');
            targets.push({
                runnerId: trailing.cardId, runnerName: trailing.name, runnerSpeed: trailing.speed,
                fromBase: 'first', toBase: 'second', throwBonus: 0,
                sbAvailable: trailingSbAvailable,
                outcome: 'pending-go',
            });
        }
    }

    const pendingSteal = {
        // Primary stealer fields kept for legacy code paths.
        runnerId, runnerName: runner.name, runnerSpeed: runner.speed,
        fromBase, toBase, catcherArm: catcherArmVal, stealThirdBonus,
        catcherGPlayers, sbAvailable: leadSbAvailable,
        autoAdvanceFirst,
        targets,
    };

    const logs = [`${runner.name} attempts to steal ${toBase}!`];
    if (autoAdvanceFirst && targets.length > 1) {
        logs.push(`${targets[1].runnerName} on 1st may also attempt to steal.`);
    }

    return advanceStealDecisions({ ...state, pendingSteal, gameLog: [...state.gameLog, ...logs] });
}

/**
 * Walk the targets list and pick the next phase based on what's still
 * 'pending-*'. If everyone's resolved, transition to either 'steal_resolve'
 * (defense throws at any 'steal' target) or skip directly to enterPreAtBat
 * (no one is attempting). Re-callable after every offense decision.
 */
function advanceStealDecisions(state) {
    const ps = state.pendingSteal;
    if (!ps || !ps.targets) return state;
    // Find the first unresolved target. Decisions go in order so the lead
    // resolves before the trailing runner is offered any choice.
    const next = ps.targets.find(t => t.outcome === 'pending-sb' || t.outcome === 'pending-go');
    if (next) {
        // Phase mapping:
        //   pending-sb (lead OR trailing) → steal_sb
        //   pending-go (trailing only)    → steal_trailing_decision
        const phase = next.outcome === 'pending-sb' ? 'steal_sb' : 'steal_trailing_decision';
        return { ...state, phase };
    }
    // All decisions made.
    const anyAttempting = ps.targets.some(t => t.outcome === 'steal');
    if (anyAttempting) {
        return { ...state, phase: 'steal_resolve' };
    }
    // Everyone is SB-safe or stayed — resolve immediately (no catcher throw).
    return resolveSteal(state, null, null);
}

/**
 * SB icon decision for the current pending-sb target. Updates that target's
 * outcome and advances to the next decision (or resolves if all done).
 */
export function handleStealSbDecision(state, action) {
    if (state.phase !== 'steal_sb' || !state.pendingSteal) return state;
    const ps = state.pendingSteal;
    const idx = ps.targets.findIndex(t => t.outcome === 'pending-sb');
    if (idx < 0) return state;
    const target = ps.targets[idx];
    const newTargets = [...ps.targets];
    if (action.useSB) {
        newTargets[idx] = { ...target, outcome: 'sb' };
    } else {
        // Declined SB — runner is still attempting; defense may throw at them.
        newTargets[idx] = { ...target, outcome: 'steal' };
    }
    return advanceStealDecisions({
        ...state,
        pendingSteal: { ...ps, targets: newTargets },
    });
}

/**
 * Trailing-runner STEAL/STAY decision. If they choose STEAL, check whether
 * they have an SB icon — if so, queue the SB sub-decision; otherwise mark
 * outcome as 'steal'.
 */
export function handleStealTrailingDecision(state, action) {
    if (state.phase !== 'steal_trailing_decision' || !state.pendingSteal) return state;
    const ps = state.pendingSteal;
    const idx = ps.targets.findIndex(t => t.outcome === 'pending-go');
    if (idx < 0) return state;
    const target = ps.targets[idx];
    const newTargets = [...ps.targets];
    if (!action.attempt) {
        newTargets[idx] = { ...target, outcome: 'stay' };
    } else if (target.sbAvailable) {
        // Wants to attempt + has SB icon — offense decides SB next.
        newTargets[idx] = { ...target, outcome: 'pending-sb' };
    } else {
        newTargets[idx] = { ...target, outcome: 'steal' };
    }
    return advanceStealDecisions({
        ...state,
        pendingSteal: { ...ps, targets: newTargets },
    });
}

export function handleStealGDecision(state, action) {
    if (state.phase !== 'steal_resolve' || !state.pendingSteal) return state;
    return resolveSteal(state, action.goldGloveCardId || null, action.targetRunnerId || null);
}

export function resolveSteal(state, goldGloveCardId, targetRunnerId) {
    const steal = state.pendingSteal;
    if (!steal) return state;

    const targets = steal.targets && steal.targets.length > 0 ? steal.targets : [{
        runnerId: steal.runnerId, runnerName: steal.runnerName, runnerSpeed: steal.runnerSpeed,
        fromBase: steal.fromBase, toBase: steal.toBase, throwBonus: steal.stealThirdBonus,
        outcome: 'steal', sbAvailable: false,
    }];
    // Categorize targets by their resolved outcome.
    const sbTargets = targets.filter(t => t.outcome === 'sb');
    const stealTargets = targets.filter(t => t.outcome === 'steal');
    // The catcher only throws if at least one runner is attempting. Pick the
    // chosen target if specified, else default to the first 'steal' target.
    const target = stealTargets.length > 0
        ? ((targetRunnerId && stealTargets.find(t => t.runnerId === targetRunnerId)) || stealTargets[0])
        : null;
    // Other 'steal' targets that the catcher didn't throw at — they reach
    // safely on the throw.
    const otherStealTargets = target ? stealTargets.filter(t => t.runnerId !== target.runnerId) : [];

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let fieldingTeam = state[fieldingSide];

    const roll = target ? rollD20() : 0;
    let armTotal = target ? (steal.catcherArm || 0) + (target.throwBonus || 0) : 0;
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

    const defenseTotal = target ? roll + armTotal : 0;
    const safe = target ? !(defenseTotal > target.runnerSpeed) : true;

    const bases = { ...state.bases };
    let outs = state.outs;
    const logs = [];
    let battingTeam = { ...state[battingSide] };

    // 1. SB-icon advances first — those runners are auto-safe regardless of throw.
    for (const sbT of sbTargets) {
        battingTeam = recordIconUse(battingTeam, sbT.runnerId, 'SB');
        if (bases[sbT.fromBase] === sbT.runnerId) {
            bases[sbT.toBase] = bases[sbT.fromBase];
            bases[sbT.fromBase] = null;
        }
        logs.push(`SB icon used! ${sbT.runnerName} automatically reaches ${sbT.toBase}.`);
    }

    // 2. Resolve the catcher's throw against the chosen target (if any).
    const pendingStealResult = target ? {
        runnerId: target.runnerId, runnerName: target.runnerName,
        roll, defenseTotal, runnerSpeed: target.runnerSpeed, safe, goldGloveUsed,
    } : null;
    if (target) {
        if (safe) {
            if (bases[target.fromBase] === target.runnerId) {
                bases[target.toBase] = bases[target.fromBase];
                bases[target.fromBase] = null;
            }
            logs.push(`${target.runnerName} steals ${target.toBase}! Spd ${target.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
        } else {
            outs++;
            bases[target.fromBase] = null;
            logs.push(`${target.runnerName} caught stealing! Spd ${target.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
            fieldingTeam = { ...fieldingTeam, outsRecordedByCurrentPitcher: (fieldingTeam.outsRecordedByCurrentPitcher || 0) + 1 };
        }
    }

    // 3. Other 'steal' targets (catcher didn't throw at them) reach safely.
    for (const other of otherStealTargets) {
        if (bases[other.fromBase] === other.runnerId) {
            bases[other.toBase] = bases[other.fromBase];
            bases[other.fromBase] = null;
            logs.push(`${other.runnerName} reaches ${other.toBase} on the throw.`);
        }
    }

    // 'stay' outcomes: do nothing.

    // Stats. Each safe advance counts as SB; the thrown-at-out target gets CS.
    for (const sbT of sbTargets) {
        battingTeam = addBatterStat(battingTeam, sbT.runnerId, 'sb');
    }
    if (target) {
        battingTeam = addBatterStat(battingTeam, target.runnerId, safe ? 'sb' : 'cs');
    }
    for (const other of otherStealTargets) {
        battingTeam = addBatterStat(battingTeam, other.runnerId, 'sb');
    }

    // One-shot tagging: every runner who successfully advanced is now flagged
    // so they can't try another active steal on the same trip to the bases.
    const tagged = [];
    for (const sbT of sbTargets) tagged.push(sbT.runnerId);
    if (target && safe) tagged.push(target.runnerId);
    for (const other of otherStealTargets) tagged.push(other.runnerId);
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
        // Only stamp roll metadata if a roll actually happened (for animation).
        ...(target ? { lastRoll: roll, lastRollType: 'fielding', rollSequence: getRollSequence() } : {}),
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);

    return enterPreAtBat(newState);
}
