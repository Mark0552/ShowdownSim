/**
 * Substitution rules from 2004 Advanced rulebook.
 */
import type { GameState, TeamState, PitcherState, LineupPlayer } from '../types/gameState';
import { canRemoveStarter } from './fatigue';

/**
 * Get available bench players for pinch hitting.
 */
export function getAvailablePinchHitters(team: TeamState): LineupPlayer[] {
    return team.bench.filter(p => p.isActive);
}

/**
 * Get available relief pitchers for a pitching change.
 */
export function getAvailableRelievers(team: TeamState, currentInning: number): PitcherState[] {
    const currentPitcher = team.pitchers[team.currentPitcherIndex];

    // Check if current pitcher can be removed
    if (currentPitcher && !canRemoveStarter(currentPitcher, currentInning)) {
        return []; // can't change yet
    }

    return team.pitchers.filter(p =>
        p.isAvailable &&
        !p.isActive &&
        (p.card.role === 'Reliever' || p.card.role === 'Closer')
    );
}

/**
 * Apply a pinch hit substitution.
 */
export function applyPinchHit(
    team: TeamState,
    benchIndex: number,
    replacingIndex: number,
): TeamState {
    const newTeam = { ...team };
    const newLineup = [...team.lineup];
    const newBench = [...team.bench];

    const benchPlayer = newBench[benchIndex];
    const replacedPlayer = newLineup[replacingIndex];

    // Bench player takes the lineup spot
    newLineup[replacingIndex] = {
        ...benchPlayer,
        assignedPosition: replacedPlayer.assignedPosition,
        isActive: true,
    };

    // Old player is removed
    newBench[benchIndex] = { ...benchPlayer, isActive: false };

    newTeam.lineup = newLineup;
    newTeam.bench = newBench;
    return newTeam;
}

/**
 * Apply a pitching change.
 * New pitcher entering mid-inning counts as a full inning vs their IP.
 */
export function applyPitchingChange(
    team: TeamState,
    newPitcherIndex: number,
    currentInning: number,
    outsInInning: number,
): TeamState {
    const newTeam = { ...team };
    const newPitchers = [...team.pitchers];

    // Deactivate current pitcher
    const current = newPitchers[team.currentPitcherIndex];
    if (current) {
        newPitchers[team.currentPitcherIndex] = { ...current, isActive: false, isAvailable: false };
    }

    // Activate new pitcher
    const newPitcher = newPitchers[newPitcherIndex];
    newPitchers[newPitcherIndex] = {
        ...newPitcher,
        isActive: true,
        inningStartedIn: currentInning,
        // Mid-inning entry: start with outs already in this inning to count as full inning
        outsRecorded: outsInInning > 0 ? outsInInning : 0,
    };

    newTeam.pitchers = newPitchers;
    newTeam.currentPitcherIndex = newPitcherIndex;
    return newTeam;
}

/**
 * Calculate total infield fielding for a team.
 */
export function getTotalInfieldFielding(team: TeamState): number {
    let total = 0;
    for (const player of team.lineup) {
        if (!player.isActive) continue;
        const pos = player.assignedPosition;
        if (['1B', '2B', '3B', 'SS'].includes(pos)) {
            const posEntry = player.card.positions.find(p => p.position === pos);
            total += posEntry?.fielding || 0;
        }
    }
    return total;
}

/**
 * Calculate total outfield fielding for a team.
 */
export function getTotalOutfieldFielding(team: TeamState): number {
    let total = 0;
    for (const player of team.lineup) {
        if (!player.isActive) continue;
        const pos = player.assignedPosition;
        if (['LF-RF-1', 'LF-RF-2', 'CF', 'LF', 'RF'].includes(pos)) {
            // Find the best matching fielding bonus
            const normalizedPos = pos.startsWith('LF-RF') ? 'LF' : pos; // LF-RF slots count as LF or RF
            const posEntry = player.card.positions.find(p =>
                p.position === normalizedPos || p.position === 'RF' || p.position === 'LF'
            );
            total += posEntry?.fielding || 0;
        }
    }
    return total;
}
