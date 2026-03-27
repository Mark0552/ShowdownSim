/**
 * Pitch and swing phase handlers.
 */

import { rollD20, resolveChart } from '../dice.js';
import { getPostResultIcons } from './resultIcons.js';
import { applyResult } from './baserunning.js';

export function handlePitch(state) {
    if (state.phase !== 'pitch') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const battingTeam = state[battingSide];
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const roll = rollD20();
    const baseControl = pitcher.control || 0;
    const ipRating = pitcher.fatigued ? 0 : (pitcher.ip || 0); // fatigued relievers start at IP 0
    const fatiguePenalty = Math.max(0, fieldingTeam.inningsPitched - ipRating);
    let controlMod = state.controlModifier || 0;
    const effectiveControl = Math.max(0, baseControl - fatiguePenalty + controlMod);
    const total = roll + effectiveControl;
    const usePitcherChart = total > batter.onBase;
    const chartOwner = usePitcherChart ? pitcher.name : batter.name;

    const logs = [`${batter.name} vs ${pitcher.name}`];
    let controlStr = `${roll} + ${baseControl}`;
    if (fatiguePenalty > 0) controlStr += ` - ${fatiguePenalty}(fatigue)`;
    if (controlMod > 0) controlStr += ` + ${controlMod}(icon)`;
    logs.push(`Pitch: ${controlStr} = ${total} vs OB ${batter.onBase} -> ${chartOwner}'s chart`);

    let newControlModifier = controlMod;
    if (state.icon20UsedThisInning && controlMod > 0 && !state.rpActiveInning) {
        newControlModifier = 0;
    }

    return {
        ...state,
        phase: 'swing',
        lastPitchRoll: roll,
        lastPitchTotal: total,
        usedPitcherChart: usePitcherChart,
        lastOutcome: null,
        lastSwingRoll: 0,
        fatiguePenalty,
        controlModifier: newControlModifier,
        pendingDpResult: null,
        extraBaseEligible: null,
        pendingExtraBaseResult: null,
        pendingStealResult: null,
        gbOptions: null,
        outsBeforeSwing: state.outs,
        gameLog: [...state.gameLog, ...logs],
    };
}

export function handleSwing(state) {
    if (state.phase !== 'swing') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const pitcher = state[fieldingSide].pitcher;
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    const roll = rollD20();
    const chart = state.usedPitcherChart ? pitcher.chart : batter.chart;
    const outcome = resolveChart(chart, roll, !state.usedPitcherChart);

    const names = {
        SO: 'Strikeout', GB: 'Ground Ball', FB: 'Fly Ball', PU: 'Popup',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double', TR: 'Triple', HR: 'HOME RUN',
    };

    let newState = {
        ...state,
        lastSwingRoll: roll,
        lastOutcome: outcome,
        gameLog: [...state.gameLog, `Swing: ${roll} -> ${names[outcome] || outcome}`],
    };

    // Check for post-result icons before applying result
    const postIcons = getPostResultIcons(newState, outcome);
    if (postIcons.length > 0) {
        return {
            ...newState,
            phase: 'result_icons',
            iconPrompt: { team: postIcons[0].team, availableIcons: postIcons.map(i => ({ cardId: i.cardId, icon: i.icon, description: i.description })) },
        };
    }

    return applyResult(newState, outcome, batter.cardId);
}
