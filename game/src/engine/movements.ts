/**
 * Client-side port of server/engine/movements.js.
 *
 * Computes runner movements by diffing the previous game state against the
 * new one. Used as a fallback (and now the primary source) so animations
 * fire even if the server-supplied runnerMovements field is missing — e.g.
 * after a brief WebSocket reconnect or a race in message delivery.
 */

import type { GameState, PlayerSlot } from './gameEngine';

export interface RunnerMovement {
    cardId: string;
    imagePath: string;
    fromBase: 'home' | 'first' | 'second' | 'third';
    toBase: 'first' | 'second' | 'third' | 'scored' | 'out';
    outTarget?: 'home' | 'first' | 'second' | 'third' | 'scored';
    segments: number;
}

const BASE_ORDER = ['home', 'first', 'second', 'third', 'scored'] as const;
const BASE_KEYS = ['first', 'second', 'third'] as const;

export function computeRunnerMovements(oldState: GameState | null, newState: GameState | null): RunnerMovement[] {
    if (!oldState || !newState) return [];

    const oldBases = oldState.bases || { first: null, second: null, third: null };
    const newBases = newState.bases || { first: null, second: null, third: null };
    const basesChanged = oldBases.first !== newBases.first
        || oldBases.second !== newBases.second
        || oldBases.third !== newBases.third;

    const oldBattingSide = oldState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const oldTeam = oldState[oldBattingSide];
    const newBattingSide = newState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const newTeam = newState[newBattingSide];
    if (!oldTeam?.lineup) return [];

    const side = oldState.halfInning === 'top' ? 'away' : 'home';
    const scoreBefore = oldState.score?.[side] ?? 0;
    const scoreAfter = newState.score?.[side] ?? 0;
    let runsToAccount = scoreAfter - scoreBefore;

    const movements: RunnerMovement[] = [];
    const movedIds = new Set<string>();

    const findPlayer = (cardId: string): PlayerSlot | undefined => {
        return oldTeam.lineup.find(p => p.cardId === cardId)
            || newTeam?.lineup?.find(p => p.cardId === cardId)
            || (oldTeam.bench || []).find(p => p.cardId === cardId)
            || (newTeam?.archivedPlayers && newTeam.archivedPlayers[cardId])
            || (oldTeam.archivedPlayers && oldTeam.archivedPlayers[cardId]);
    };

    const countSegments = (from: string, to: string): number => {
        const fromIdx = (BASE_ORDER as readonly string[]).indexOf(from);
        const toIdx = (BASE_ORDER as readonly string[]).indexOf(to);
        return (fromIdx >= 0 && toIdx > fromIdx) ? toIdx - fromIdx : 1;
    };

    const getPrevBatter = (): PlayerSlot | undefined => {
        const sameHalf = oldState.halfInning === newState.halfInning;
        const team = sameHalf ? (newState[newBattingSide] || oldTeam) : oldTeam;
        if (sameHalf) {
            const idx = (team.currentBatterIndex || 1) - 1;
            return team.lineup[idx < 0 ? team.lineup.length - 1 : idx];
        }
        const idx = (oldTeam.currentBatterIndex || 1) - 1;
        return oldTeam.lineup[idx < 0 ? oldTeam.lineup.length - 1 : idx];
    };

    // Existing runners that moved (or scored, or were thrown out)
    if (basesChanged) {
        for (const fromBase of BASE_KEYS) {
            const cardId = oldBases[fromBase];
            if (!cardId) continue;
            if (newBases[fromBase] === cardId) continue;
            const toBase = (BASE_KEYS as readonly string[]).find(b => newBases[b as 'first' | 'second' | 'third'] === cardId) as 'first' | 'second' | 'third' | undefined;
            const player = findPlayer(cardId);
            const imagePath = player?.imagePath || '';
            if (toBase) {
                movements.push({ cardId, imagePath, fromBase, toBase, segments: countSegments(fromBase, toBase) });
            } else if (runsToAccount > 0) {
                runsToAccount--;
                movements.push({ cardId, imagePath, fromBase, toBase: 'scored', segments: countSegments(fromBase, 'scored') });
            } else {
                const fromIdx = (BASE_ORDER as readonly string[]).indexOf(fromBase);
                const nextBase = (fromIdx >= 0 && fromIdx < BASE_ORDER.length - 1 ? BASE_ORDER[fromIdx + 1] : 'scored') as 'home' | 'first' | 'second' | 'third' | 'scored';
                movements.push({ cardId, imagePath, fromBase, toBase: 'out', outTarget: nextBase, segments: 1 });
            }
            movedIds.add(cardId);
        }

        // Batter reaching base (wasn't on any base before, now is)
        for (const toBase of BASE_KEYS) {
            const cardId = newBases[toBase];
            if (!cardId) continue;
            if (movedIds.has(cardId)) continue;
            const wasOnBase = (BASE_KEYS as readonly string[]).some(b => oldBases[b as 'first' | 'second' | 'third'] === cardId);
            if (wasOnBase) continue;
            const player = findPlayer(cardId);
            const imagePath = player?.imagePath || '';
            const segments = countSegments('home', toBase);
            if (segments > 0) movements.push({ cardId, imagePath, fromBase: 'home', toBase, segments });
            movedIds.add(cardId);
        }
    }

    // Solo HR (empty bases before & after, but runs went up)
    if (runsToAccount > 0) {
        const prevBatter = getPrevBatter();
        if (prevBatter && !movedIds.has(prevBatter.cardId)
            && !(BASE_KEYS as readonly string[]).some(b => newBases[b as 'first' | 'second' | 'third'] === prevBatter.cardId)) {
            movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'scored', segments: 4 });
            movedIds.add(prevBatter.cardId);
        }
    }

    // Batter out (no base, outs increased OR half-inning flipped)
    if (newState.outs > oldState.outs || newState.halfInning !== oldState.halfInning) {
        const prevBatter = getPrevBatter();
        if (prevBatter && !movedIds.has(prevBatter.cardId)
            && !(BASE_KEYS as readonly string[]).some(b => newBases[b as 'first' | 'second' | 'third'] === prevBatter.cardId)) {
            const outcome = newState.lastOutcome || oldState.lastOutcome;
            if (outcome === 'SO') {
                movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'out', outTarget: 'home', segments: 0 });
            } else {
                movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'out', outTarget: 'first', segments: 1 });
            }
        }
    }

    return movements;
}
