/**
 * Icon logic for Advanced ruleset.
 * All icons are player-choice (not auto-applied like in the sim).
 */
import type { GameState, TeamState, Outcome, PitcherState } from '../types/gameState';
import type { IconType } from '../types/gameActions';
import { OUT_OUTCOMES } from '../types/gameState';

export interface IconOption {
    icon: IconType;
    cardId: string;
    description: string;
}

/**
 * Get available offensive icon options after a result.
 */
export function getOffensiveIcons(state: GameState): IconOption[] {
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const result = state.pendingResult?.outcome;
    if (!result) return [];

    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];
    if (!batter || !batter.isActive) return [];

    const options: IconOption[] = [];
    const icons = batter.card.icons;

    // V (Vision): reroll out on hitter chart, 2x per game
    if (icons.includes('V') && OUT_OUTCOMES.includes(result) && !state.pendingResult?.usedPitcherChart) {
        const uses = battingTeam.icons.visionUses[batter.cardId] || 0;
        if (uses < 2) {
            options.push({ icon: 'V', cardId: batter.cardId, description: `Vision: Reroll this out (${2 - uses} left)` });
        }
    }

    // S (Speed): upgrade 1B/1B+ to 2B, 1x per game
    if (icons.includes('S') && (result === 'S' || result === 'SPlus')) {
        if (!battingTeam.icons.speedUsed[batter.cardId]) {
            options.push({ icon: 'S', cardId: batter.cardId, description: 'Speed: Upgrade to double' });
        }
    }

    // HR (Power): upgrade 2B/3B to HR, 1x per game
    if (icons.includes('HR') && (result === 'DB' || result === 'TR')) {
        if (!battingTeam.icons.hrUsed[batter.cardId]) {
            options.push({ icon: 'HR', cardId: batter.cardId, description: 'Power: Upgrade to home run' });
        }
    }

    return options;
}

/**
 * Get available defensive icon options after a result.
 */
export function getDefensiveIcons(state: GameState): IconOption[] {
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const result = state.pendingResult?.outcome;
    if (!result) return [];

    const options: IconOption[] = [];
    const pitcher = fieldingTeam.pitchers[fieldingTeam.currentPitcherIndex];

    // K (Strikeout): change any result to SO, 1x per game
    if (pitcher && pitcher.card.icons.includes('K') && !fieldingTeam.icons.kUsedThisGame) {
        // K is most useful on hits, especially HR
        if (result !== 'SO' && result !== 'PU') {
            options.push({ icon: 'K', cardId: pitcher.cardId, description: 'Strikeout: Change result to SO' });
        }
    }

    return options;
}

/**
 * Get pre-pitch icon options for offense (SB).
 */
export function getPrePitchOffenseIcons(state: GameState): IconOption[] {
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const options: IconOption[] = [];

    // Check all runners for SB icon
    for (const base of ['first', 'second'] as const) {
        const runnerId = state.bases[base];
        if (!runnerId) continue;

        const runner = battingTeam.lineup.find(p => p.cardId === runnerId);
        if (!runner) continue;

        if (runner.card.icons.includes('SB') && !battingTeam.icons.sbUsed[runnerId]) {
            const targetBase = base === 'first' ? 'second' : 'third';
            // Can only steal if target base is open
            if (!state.bases[targetBase === 'second' ? 'second' : 'third']) {
                options.push({ icon: 'SB', cardId: runnerId, description: `SB: ${runner.card.name} steals ${targetBase} without throw` });
            }
        }
    }

    return options;
}

/**
 * Get pre-pitch icon options for defense (20, RP).
 * 20 and RP are auto-applied when chosen, not interactive mid-at-bat.
 */
export function getPitchModifiers(state: GameState): { modifier: number; descriptions: string[] } {
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const pitcher = fieldingTeam.pitchers[fieldingTeam.currentPitcherIndex];
    if (!pitcher) return { modifier: 0, descriptions: [] };

    let modifier = 0;
    const descriptions: string[] = [];

    // 20 icon: +3 control, once per inning
    if (pitcher.card.icons.includes('20') && !pitcher.twentyUsedThisInning) {
        modifier += 3;
        descriptions.push('+3 control (20 icon)');
    }

    // RP icon: +3 control for 1 full inning after 6th, 1x per game
    if (pitcher.card.icons.includes('RP') && !pitcher.rpUsedThisGame && state.inning > 6) {
        modifier += 3;
        descriptions.push('+3 control (RP icon)');
    }

    return { modifier, descriptions };
}

/**
 * Get fielding check icon options (G - Gold Glove).
 */
export function getFieldingIcons(state: GameState): IconOption[] {
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const options: IconOption[] = [];

    // Check all fielders for G icon
    for (const player of fieldingTeam.lineup) {
        if (!player.isActive) continue;
        if (player.card.icons.includes('G') && !fieldingTeam.icons.goldGloveUsed[player.cardId]) {
            options.push({ icon: 'G', cardId: player.cardId, description: `Gold Glove: ${player.card.name} +10 fielding` });
        }
    }

    return options;
}
