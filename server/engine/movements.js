/**
 * Compute runner movements by comparing old and new base states.
 * Returns an array of { cardId, imagePath, fromBase, toBase, outTarget?, segments } for the client to animate.
 */

const BASE_ORDER = ['home', 'first', 'second', 'third', 'scored'];
const BASE_KEYS = ['first', 'second', 'third'];

export function computeRunnerMovements(oldState, newState) {
    if (!oldState || !newState) return [];

    const oldBases = oldState.bases || {};
    const newBases = newState.bases || {};
    const basesChanged = oldBases.first !== newBases.first || oldBases.second !== newBases.second || oldBases.third !== newBases.third;

    const oldBattingSide = oldState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const oldTeam = oldState[oldBattingSide];
    const newBattingSide = newState.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const newTeam = newState[newBattingSide];
    if (!oldTeam?.lineup) return [];

    const side = oldState.halfInning === 'top' ? 'away' : 'home';
    const scoreBefore = oldState.score?.[side] || 0;
    const scoreAfter = newState.score?.[side] || 0;
    let runsToAccount = scoreAfter - scoreBefore;

    const movements = [];
    const movedIds = new Set();

    const findPlayer = (cardId) => {
        return oldTeam.lineup.find(p => p.cardId === cardId)
            || newTeam?.lineup?.find(p => p.cardId === cardId)
            || oldTeam.bench?.find(p => p.cardId === cardId);
    };

    const countSegments = (from, to) => {
        const fromIdx = BASE_ORDER.indexOf(from);
        const toIdx = BASE_ORDER.indexOf(to);
        return (fromIdx >= 0 && toIdx > fromIdx) ? toIdx - fromIdx : 1;
    };

    // Get the batter who just acted (previous batter, since currentBatterIndex may have advanced)
    const getPrevBatter = () => {
        // Use the team from the same half-inning as the old state
        const sameHalf = oldState.halfInning === newState.halfInning;
        const team = sameHalf ? (newState[newBattingSide] || oldTeam) : oldTeam;
        if (sameHalf) {
            const idx = (team.currentBatterIndex || 1) - 1;
            return team.lineup[idx < 0 ? team.lineup.length - 1 : idx];
        }
        // Half-inning switched — the batter was from the OLD batting team
        const idx = (oldTeam.currentBatterIndex || 1) - 1;
        return oldTeam.lineup[idx < 0 ? oldTeam.lineup.length - 1 : idx];
    };

    // === SECTION 1: Existing runners that moved ===
    if (basesChanged) {
        for (const fromBase of BASE_KEYS) {
            const cardId = oldBases[fromBase];
            if (!cardId) continue;
            if (newBases[fromBase] === cardId) continue;
            const toBase = BASE_KEYS.find(b => newBases[b] === cardId);
            const player = findPlayer(cardId);
            const imagePath = player?.imagePath || '';

            if (toBase) {
                movements.push({ cardId, imagePath, fromBase, toBase, segments: countSegments(fromBase, toBase) });
            } else if (runsToAccount > 0) {
                runsToAccount--;
                movements.push({ cardId, imagePath, fromBase, toBase: 'scored', segments: countSegments(fromBase, 'scored') });
            } else {
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
            if (segments > 0) movements.push({ cardId, imagePath, fromBase: 'home', toBase, segments });
            movedIds.add(cardId);
        }
    }

    // === SECTION 2: Batter scoring (HR — not on any base after, runs increased) ===
    // This is OUTSIDE the basesChanged gate to handle solo HRs (empty bases before and after)
    if (runsToAccount > 0) {
        const prevBatter = getPrevBatter();
        if (prevBatter && !movedIds.has(prevBatter.cardId) && !BASE_KEYS.some(b => newBases[b] === prevBatter.cardId)) {
            movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'scored', segments: 4 });
            movedIds.add(prevBatter.cardId);
        }
    }

    // === SECTION 3: Batter out (not on any base, outs increased) ===
    // Handles: SO, PU, FB, GB (simple + all decisions), SAC bunt, DP batter out
    if (newState.outs > oldState.outs || newState.halfInning !== oldState.halfInning) {
        const prevBatter = getPrevBatter();
        if (prevBatter && !movedIds.has(prevBatter.cardId) && !BASE_KEYS.some(b => newBases[b] === prevBatter.cardId)) {
            const outcome = newState.lastOutcome || oldState.lastOutcome;
            // SO only: fade at home (strikeout looking). Everything else: run toward 1st and fade.
            const isAtHomeOut = outcome === 'SO';
            if (isAtHomeOut) {
                movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'out', outTarget: 'home', segments: 0 });
            } else {
                // GB/SAC/DP: batter ran toward 1st but was thrown out
                movements.push({ cardId: prevBatter.cardId, imagePath: prevBatter.imagePath || '', fromBase: 'home', toBase: 'out', outTarget: 'first', segments: 1 });
            }
        }
    }

    return movements;
}
