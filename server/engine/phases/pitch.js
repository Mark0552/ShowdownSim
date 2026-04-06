/**
 * Pitch and swing phase handlers.
 */

import { rollD20, resolveChart } from '../dice.js';
import { getPostResultIcons } from './resultIcons.js';
import { applyResult } from './baserunning.js';

export function handlePitch(state) {
    // Allow rolling pitch directly from defense_sub or ibb_decision (skips bunt if not eligible)
    if (state.phase === 'defense_sub' || state.phase === 'ibb_decision') {
        const bases = state.bases;
        const canBunt = state.outs < 2 && (bases.first || bases.second) && !bases.third;
        if (canBunt) return state; // must go through bunt decision first
        state = { ...state, phase: 'pitch' };
    }
    if (state.phase !== 'pitch') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const battingTeam = state[battingSide];
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const roll = rollD20();
    const baseControl = pitcher.control || 0;
    const cardIp = pitcher.fatigued ? 0 : (pitcher.ip || 0);
    // Effective IP = card IP - floor(runs/3) + CY bonus innings
    const pitcherRuns = fieldingTeam.pitcherStats?.[pitcher.cardId]?.r || 0;
    const cyBonus = fieldingTeam.cyBonusInnings || 0;
    const effectiveIp = Math.max(0, cardIp - Math.floor(pitcherRuns / 3) + cyBonus);
    // Fatigue: current inning the pitcher is IN (not completed) vs effective IP
    const inningsPitching = state.inning - (fieldingTeam.pitcherEntryInning || 1) + 1;
    const fatiguePenalty = Math.max(0, inningsPitching - effectiveIp);
    // RP bonus only applies if this pitcher is the one who activated it
    let controlMod = state.controlModifier || 0;
    if (controlMod > 0 && state.rpActivePitcherId && state.rpActivePitcherId !== pitcher.cardId) {
        // RP bonus is +3; strip it since this pitcher didn't activate it
        controlMod = Math.max(0, controlMod - 3);
    }
    const effectiveControl = Math.max(0, baseControl - fatiguePenalty + controlMod);
    const total = roll + effectiveControl;
    const usePitcherChart = total > batter.onBase;
    const chartOwner = usePitcherChart ? pitcher.name : batter.name;

    const logs = [`${batter.name} vs ${pitcher.name}`];
    let controlStr = `${roll} + ${baseControl}`;
    if (fatiguePenalty > 0) controlStr += ` - ${fatiguePenalty}(fatigue)`;
    if (controlMod > 0) controlStr += ` + ${controlMod}(icon)`;
    logs.push(`Pitch: ${controlStr} = ${total} vs OB ${batter.onBase} -> ${chartOwner}'s chart`);

    // After the pitch, strip the 20 icon's +3 (it only applies to one pitch)
    // If RP is also active, controlMod includes both (+6); strip only the 20 portion (+3)
    let newControlModifier = controlMod;
    if (state.icon20UsedThisInning && controlMod > 0) {
        newControlModifier = Math.max(0, controlMod - 3);
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
        lastRoll: roll,
        lastRollType: 'pitch',
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
        lastRoll: roll,
        lastRollType: 'swing',
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
