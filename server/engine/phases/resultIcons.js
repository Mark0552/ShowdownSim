/**
 * Post-result icon handlers (K, HR, V, S) and pre-pitch icons (SB, 20, RP).
 */

import { playerHasIcon, canUseIcon, recordIconUse } from '../icons.js';
import { applyResult } from './baserunning.js';
import { handleSkipSub } from './substitutions.js';
import { addBatterStat } from '../stats.js';

/** Bump iconChangeSequence so the client briefly freezes the lineup highlight
 *  during an icon-driven outcome change WITHOUT spinning the dice again
 *  (the dice already settled on its real value). */
function bumpIconChange(state) {
    return (state.iconChangeSequence || 0) + 1;
}

export function getPostResultIcons(state, outcome) {
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const battingTeam = state[battingSide];
    const defense = state.halfInning === 'top' ? 'home' : 'away';
    const offense = state.halfInning === 'top' ? 'away' : 'home';
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];
    const pitcher = fieldingTeam.pitcher;
    const icons = [];

    const isOut = ['SO', 'GB', 'FB', 'PU'].includes(outcome);
    const isHit = ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(outcome);

    // K icon (defense): any hit/walk becomes SO
    if ((isHit || outcome === 'W') && playerHasIcon(pitcher, 'K') && canUseIcon(fieldingTeam, pitcher.cardId, 'K')) {
        icons.push({ cardId: pitcher.cardId, icon: 'K', description: `K: Override to Strikeout`, team: defense });
    }

    // HR icon (offense): convert DB or TR to HR
    if ((outcome === 'DB' || outcome === 'TR') && playerHasIcon(batter, 'HR') && canUseIcon(battingTeam, batter.cardId, 'HR')) {
        icons.push({ cardId: batter.cardId, icon: 'HR', description: `HR: Convert to Home Run`, team: offense });
    }

    // V icon (offense): reroll out (2x/game)
    if (isOut && playerHasIcon(batter, 'V') && canUseIcon(battingTeam, batter.cardId, 'V')) {
        icons.push({ cardId: batter.cardId, icon: 'V', description: `V: Reroll this out`, team: offense });
    }

    // S icon (offense): convert S/S+ to DB
    if ((outcome === 'S' || outcome === 'SPlus') && playerHasIcon(batter, 'S') && canUseIcon(battingTeam, batter.cardId, 'S')) {
        icons.push({ cardId: batter.cardId, icon: 'S', description: `S: Single to Double`, team: offense });
    }

    return icons;
}

export function handleUseIcon(state, action) {
    const { cardId, icon } = action;

    if (state.phase === 'pre_atbat' || state.phase === 'defense_sub' || state.phase === 'pitch' || state.phase === 'ibb_decision') {
        return handlePrePitchIcon(state, action);
    }

    if (state.phase !== 'result_icons') return state;

    // Safety guard: the icon must be in the current prompt's available list.
    // Otherwise a mis-wired prompt could let the wrong team use an opponent's
    // icon (e.g. defense clicking the hitter's S icon to upgrade a single).
    const available = state.iconPrompt?.availableIcons || [];
    if (!available.some(i => i.icon === icon && i.cardId === cardId)) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    switch (icon) {
        case 'K': {
            let team = recordIconUse(state[fieldingSide], cardId, 'K');
            let newState = { ...state, [fieldingSide]: team, lastOutcome: 'SO', iconPrompt: null, iconChangeSequence: bumpIconChange(state) };
            newState.gameLog = [...state.gameLog, `K icon used! Result changed to Strikeout`];
            const battingTeam = newState[battingSide];
            if (playerHasIcon(batter, 'V') && canUseIcon(battingTeam, batter.cardId, 'V')) {
                const offense = state.halfInning === 'top' ? 'away' : 'home';
                return {
                    ...newState, phase: 'result_icons',
                    iconPrompt: { team: offense, availableIcons: [{ cardId: batter.cardId, icon: 'V', description: 'V: Reroll this Strikeout' }] },
                };
            }
            return applyResult(newState, 'SO', batter.cardId);
        }

        case 'HR': {
            let team = recordIconUse(state[battingSide], cardId, 'HR');
            let newState = { ...state, [battingSide]: team, lastOutcome: 'HR', iconPrompt: null, iconChangeSequence: bumpIconChange(state) };
            newState.gameLog = [...state.gameLog, `HR icon used! Result upgraded to Home Run!`];
            return applyResult(newState, 'HR', batter.cardId);
        }

        case 'V': {
            let team = recordIconUse(state[battingSide], cardId, 'V');
            let newState = { ...state, [battingSide]: team, iconPrompt: null };
            newState.gameLog = [...state.gameLog, `V (Veteran) icon used! Rerolling...`];
            return { ...newState, phase: 'swing', lastOutcome: null, lastSwingRoll: 0 };
        }

        case 'S': {
            // S and HR cannot be used on the same result
            let team = recordIconUse(state[battingSide], cardId, 'S');
            let newState = { ...state, [battingSide]: team, lastOutcome: 'DB', iconPrompt: null, iconChangeSequence: bumpIconChange(state) };
            newState.gameLog = [...state.gameLog, `S (Silver Slugger) icon! Single upgraded to Double`];
            return applyResult(newState, 'DB', batter.cardId);
        }

        default:
            return state;
    }
}

export function handleSkipIcons(state) {
    if (state.phase !== 'result_icons') return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    // If DEFENSE just skipped (prompted team is the defense side), the
    // offense may still have icons to use on the original outcome — give
    // them their turn before applying the result.
    const offenseKey = state.halfInning === 'top' ? 'away' : 'home';
    const defenseKey = state.halfInning === 'top' ? 'home' : 'away';
    if (state.iconPrompt?.team === defenseKey) {
        const remaining = getPostResultIcons(state, state.lastOutcome).filter(i => i.team === offenseKey);
        if (remaining.length > 0) {
            return {
                ...state,
                phase: 'result_icons',
                iconPrompt: { team: offenseKey, availableIcons: remaining.map(i => ({ cardId: i.cardId, icon: i.icon, description: i.description })) },
            };
        }
    }

    // Bump rollSequence so the client freezes display while applyResult advances the batter
    return applyResult({ ...state, iconPrompt: null, iconChangeSequence: bumpIconChange(state) }, state.lastOutcome, batter.cardId);
}

export function handlePrePitchIcon(state, action) {
    const { cardId, icon } = action;

    if (icon === 'SB') {
        const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
        let team = recordIconUse(state[battingSide], cardId, 'SB');
        const bases = { ...state.bases };
        const logs = [];

        if (bases.second === cardId && !bases.third) {
            bases.third = bases.second; bases.second = null;
            team = addBatterStat(team, cardId, 'sb');
            logs.push(`${findPlayerName(team, cardId)} steals third! (SB icon)`);
        } else if (bases.first === cardId && !bases.second) {
            bases.second = bases.first; bases.first = null;
            team = addBatterStat(team, cardId, 'sb');
            logs.push(`${findPlayerName(team, cardId)} steals second! (SB icon)`);
        }

        if (logs.length === 0) {
            for (const base of ['first', 'second']) {
                const rId = bases[base];
                if (!rId) continue;
                const runner = team.lineup.find(p => p.cardId === rId);
                if (runner && playerHasIcon(runner, 'SB') && canUseIcon(team, runner.cardId, 'SB')) {
                    const nextBase = base === 'first' ? 'second' : 'third';
                    if (!bases[nextBase]) {
                        team = recordIconUse(team, runner.cardId, 'SB');
                        bases[nextBase] = rId; bases[base] = null;
                        team = addBatterStat(team, runner.cardId, 'sb');
                        logs.push(`${runner.name} steals ${nextBase}! (SB icon)`);
                        break;
                    }
                }
            }
        }

        let newState = { ...state, [battingSide]: team, bases, gameLog: [...state.gameLog, ...logs] };
        return handleSkipSub(newState);
    }

    if (icon === '20') {
        const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
        let team = recordIconUse(state[fieldingSide], cardId, '20');
        let newState = {
            ...state, [fieldingSide]: team,
            controlModifier: (state.controlModifier || 0) + 3,
            icon20UsedThisInning: true,
        };
        newState.gameLog = [...state.gameLog, `20 icon: +3 control for this pitch`];
        return { ...newState, phase: 'pitch', subPhaseStep: null };
    }

    if (icon === 'RP') {
        if (state.inning <= 6) return state;
        const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
        // RP is once per pitcher per game
        if (!canUseIcon(state[fieldingSide], cardId, 'RP')) return state;
        let team = recordIconUse(state[fieldingSide], cardId, 'RP');
        let newState = {
            ...state, [fieldingSide]: team,
            controlModifier: (state.controlModifier || 0) + 3,
            rpActiveInning: state.inning,
            rpActiveTeam: state.halfInning === 'top' ? 'home' : 'away',
            rpActivePitcherId: team.pitcher.cardId,
        };
        newState.gameLog = [...state.gameLog, `RP icon: +3 control for this inning`];
        return { ...newState, phase: 'pitch', subPhaseStep: null };
    }

    return state;
}

export function findPlayerName(team, cardId) {
    const p = team.lineup.find(p => p.cardId === cardId);
    return p ? p.name : 'Runner';
}
