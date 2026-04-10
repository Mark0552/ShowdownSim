/**
 * Compute runner movements by comparing old and new base states.
 * Returns an array of { cardId, imagePath, fromBase, toBase, segments } for the client to animate.
 */

const BASE_ORDER = ['home', 'first', 'second', 'third', 'scored'];
const BASE_KEYS = ['first', 'second', 'third'];

export function computeRunnerMovements(oldState, newState) {
    if (!oldState || !newState) return [];

    const oldBases = oldState.bases || {};
    const newBases = newState.bases || {};

    // Quick check: anything changed?
    if (oldBases.first === newBases.first && oldBases.second === newBases.second && oldBases.third === newBases.third) return [];

    const oldBattingSide = oldState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const oldTeam = oldState[oldBattingSide];
    const newBattingSide = newState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const newTeam = newState[newBattingSide];
    if (!oldTeam?.lineup) return [];

    // Score comparison to distinguish scoring from outs
    const side = oldState.halfInning === 'top' ? 'away' : 'home';
    const scoreBefore = oldState.score?.[side] || 0;
    const scoreAfter = newState.score?.[side] || 0;
    let runsToAccount = scoreAfter - scoreBefore;

    const movements = [];
    const movedIds = new Set();

    // Find player by cardId across both teams
    const findPlayer = (cardId) => {
        return oldTeam.lineup.find(p => p.cardId === cardId)
            || newTeam?.lineup?.find(p => p.cardId === cardId)
            || oldTeam.bench?.find(p => p.cardId === cardId);
    };

    // Count segments along base path
    const countSegments = (from, to) => {
        const fromIdx = BASE_ORDER.indexOf(from);
        const toIdx = BASE_ORDER.indexOf(to);
        return (fromIdx >= 0 && toIdx > fromIdx) ? toIdx - fromIdx : 1;
    };

    // Existing runners that moved
    for (const fromBase of BASE_KEYS) {
        const cardId = oldBases[fromBase];
        if (!cardId) continue;
        if (newBases[fromBase] === cardId) continue; // still on same base

        const toBase = BASE_KEYS.find(b => newBases[b] === cardId);
        const player = findPlayer(cardId);
        const imagePath = player?.imagePath || '';

        if (toBase) {
            // Advanced to another base
            movements.push({ cardId, imagePath, fromBase, toBase, segments: countSegments(fromBase, toBase) });
        } else if (runsToAccount > 0) {
            // Scored
            runsToAccount--;
            movements.push({ cardId, imagePath, fromBase, toBase: 'scored', segments: countSegments(fromBase, 'scored') });
        } else {
            // Out — determine which base they were heading to
            const fromIdx = BASE_ORDER.indexOf(fromBase);
            const nextBase = fromIdx >= 0 && fromIdx < BASE_ORDER.length - 1 ? BASE_ORDER[fromIdx + 1] : 'scored';
            movements.push({ cardId, imagePath, fromBase, toBase: 'out', outTarget: nextBase, segments: 1 });
        }
        movedIds.add(cardId);
    }

    // Batter reaching base (wasn't on any base before, now is)
    for (const toBase of BASE_KEYS) {
        const cardId = newBases[toBase];
        if (!cardId) continue;
        if (movedIds.has(cardId)) continue;
        const wasOnBase = BASE_KEYS.some(b => oldBases[b] === cardId);
        if (wasOnBase) continue;
        const player = findPlayer(cardId);
        const imagePath = player?.imagePath || '';
        const segments = countSegments('home', toBase);
        if (segments > 0) {
            movements.push({ cardId, imagePath, fromBase: 'home', toBase, segments });
        }
    }

    // Batter hitting HR (scored — not on any base in new state, but was the batter)
    if (runsToAccount > 0 && !movedIds.has(newState[newBattingSide]?.lineup?.[newState[newBattingSide]?.currentBatterIndex - 1]?.cardId)) {
        // Check if previous batter scored (HR)
        const prevIdx = (newState[newBattingSide]?.currentBatterIndex || 1) - 1;
        const prevBatter = newTeam?.lineup?.[prevIdx < 0 ? newTeam.lineup.length - 1 : prevIdx];
        if (prevBatter && !movedIds.has(prevBatter.cardId) && !BASE_KEYS.some(b => newBases[b] === prevBatter.cardId)) {
            // Batter scored (HR) — full circuit
            movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'scored', segments: 4 });
        }
    }

    return movements;
}
