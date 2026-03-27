/**
 * MLB Showdown Game Engine — Server (Single Source of Truth)
 * Router module: processAction, whoseTurn, getCurrentBatter, getCurrentPitcher.
 */

import { initializeGame } from './init.js';
import { handlePitch, handleSwing } from './phases/pitch.js';
import { handlePinchHit, handlePitchingChange, handleSkipSub } from './phases/substitutions.js';
import { handleUseIcon, handleSkipIcons } from './phases/resultIcons.js';
import { handleGbDecision } from './phases/groundball.js';
import { handleSteal, handleStealGDecision } from './phases/steal.js';
import { handleSendRunners, handleHoldRunners, handleExtraBaseThrow, handleSkipExtraBase } from './phases/extrabase.js';
import { handleSacBunt } from './phases/bunt.js';

export { initializeGame };

export function whoseTurn(state) {
    if (state.isOver) return null;
    const offense = state.halfInning === 'top' ? 'away' : 'home';
    const defense = state.halfInning === 'top' ? 'home' : 'away';
    switch (state.phase) {
        case 'pre_atbat':         return offense;
        case 'defense_sub':       return defense;
        case 'pitch':             return defense;
        case 'swing':             return offense;
        case 'result_icons':      return state.iconPrompt?.team || offense;
        case 'gb_decision':       return defense;
        case 'steal_resolve':     return defense;
        case 'extra_base_offer':  return offense;
        case 'extra_base':        return defense;
        default: return null;
    }
}

export function processAction(state, action) {
    if (state.isOver) return state;
    switch (action.type) {
        case 'ROLL_PITCH':         return handlePitch(state);
        case 'ROLL_SWING':         return handleSwing(state);
        case 'PINCH_HIT':          return handlePinchHit(state, action);
        case 'PITCHING_CHANGE':    return handlePitchingChange(state, action);
        case 'USE_ICON':           return handleUseIcon(state, action);
        case 'GB_DECISION':        return handleGbDecision(state, action);
        case 'STEAL':              return handleSteal(state, action);
        case 'STEAL_G_DECISION':   return handleStealGDecision(state, action);
        case 'SEND_RUNNERS':       return handleSendRunners(state, action);
        case 'HOLD_RUNNERS':       return handleHoldRunners(state);
        case 'EXTRA_BASE_THROW':   return handleExtraBaseThrow(state, action);
        case 'SKIP_SUB':           return handleSkipSub(state);
        case 'SKIP_ICONS':         return handleSkipIcons(state);
        case 'SKIP_EXTRA_BASE':    return handleSkipExtraBase(state);
        case 'SAC_BUNT':           return handleSacBunt(state);
        default: return state;
    }
}

export function getCurrentBatter(state) {
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = state[battingSide];
    return team.lineup[team.currentBatterIndex];
}

export function getCurrentPitcher(state) {
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    return state[fieldingSide].pitcher;
}
