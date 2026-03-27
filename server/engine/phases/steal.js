/**
 * Steal phase handlers.
 */

import { rollD20 } from '../dice.js';
import { playerHasIcon, canUseIcon, recordIconUse } from '../icons.js';
import { enterPreAtBat } from './substitutions.js';
import { endHalfInning } from './baserunning.js';

export function handleSteal(state, action) {
    if (state.phase !== 'pre_atbat') return state;
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

    const pendingSteal = {
        runnerId, runnerName: runner.name, runnerSpeed: runner.speed,
        fromBase, toBase, catcherArm: catcherArmVal, stealThirdBonus,
        catcherGPlayers,
        autoAdvanceFirst: !!(fromBase === 'second' && bases.first),
    };

    const logs = [`${runner.name} attempts to steal ${toBase}!`];

    if (catcherGPlayers.length > 0) {
        return {
            ...state,
            phase: 'steal_resolve',
            pendingSteal,
            gameLog: [...state.gameLog, ...logs],
        };
    }

    // No G available — auto-resolve
    return resolveSteal({ ...state, pendingSteal, gameLog: [...state.gameLog, ...logs] }, null);
}

export function handleStealGDecision(state, action) {
    if (state.phase !== 'steal_resolve' || !state.pendingSteal) return state;
    return resolveSteal(state, action.goldGloveCardId || null);
}

export function resolveSteal(state, goldGloveCardId) {
    const steal = state.pendingSteal;
    if (!steal) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    let fieldingTeam = state[fieldingSide];

    const roll = rollD20();
    let armTotal = steal.catcherArm + steal.stealThirdBonus;
    let goldGloveUsed = false;

    if (goldGloveCardId) {
        const gPlayer = fieldingTeam.lineup.find(p => p.cardId === goldGloveCardId);
        if (gPlayer && playerHasIcon(gPlayer, 'G') && canUseIcon(fieldingTeam, gPlayer.cardId, 'G')) {
            armTotal += 10;
            goldGloveUsed = true;
            fieldingTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
        }
    }

    const defenseTotal = roll + armTotal;
    const safe = !(defenseTotal > steal.runnerSpeed); // defense must BEAT speed; ties go to runner

    const bases = { ...state.bases };
    let outs = state.outs;
    const logs = [];

    const pendingStealResult = {
        runnerId: steal.runnerId, runnerName: steal.runnerName,
        roll, defenseTotal, runnerSpeed: steal.runnerSpeed, safe, goldGloveUsed,
    };

    if (safe) {
        bases[steal.toBase] = bases[steal.fromBase];
        bases[steal.fromBase] = null;
        logs.push(`${steal.runnerName} steals ${steal.toBase}! Spd ${steal.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
        // Auto-advance runner on 1st if 2nd base runner stole 3rd
        if (steal.autoAdvanceFirst && bases.first) {
            bases.second = bases.first;
            bases.first = null;
            logs.push(`Runner on 1st advances to 2nd`);
        }
    } else {
        outs++;
        bases[steal.fromBase] = null;
        logs.push(`${steal.runnerName} caught stealing! Spd ${steal.runnerSpeed} vs d20(${roll})+Arm(${armTotal})=${defenseTotal}`);
    }

    let newState = {
        ...state, bases, outs,
        [fieldingSide]: fieldingTeam,
        pendingSteal: null, pendingStealResult,
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);

    // Return to pre_atbat for remaining decisions, then pitch
    return enterPreAtBat(newState);
}
