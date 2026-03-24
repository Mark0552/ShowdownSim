import type { PitcherState } from '../types/gameState';

/**
 * Get the fatigue penalty for a pitcher.
 * Each inning past IP rating = -1 to every pitch roll.
 */
export function getFatiguePenalty(pitcher: PitcherState): number {
    const effectiveIP = pitcher.card.ip + pitcher.cyBonusIP;
    const inningsPitched = Math.ceil(pitcher.outsRecorded / 3);
    if (inningsPitched <= effectiveIP) return 0;
    return -(inningsPitched - effectiveIP);
}

/**
 * Check if starter can be removed.
 * Starter can't leave before 5th inning unless 10+ runs given up.
 */
export function canRemoveStarter(pitcher: PitcherState, currentInning: number): boolean {
    if (pitcher.card.role !== 'Starter') return true; // relievers/closers can always be removed
    if (currentInning >= 5) return true;
    if (pitcher.runsAllowed >= 10) return true;
    return false;
}

/**
 * Get innings pitched as a display string (e.g., "5.2" for 17 outs)
 */
export function getInningsPitchedDisplay(outsRecorded: number): string {
    const full = Math.floor(outsRecorded / 3);
    const partial = outsRecorded % 3;
    return `${full}.${partial}`;
}
