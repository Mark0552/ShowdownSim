/**
 * Batter and pitcher stat tracking helpers.
 */

export function addBatterStat(team, cardId, stat, amount = 1) {
    const newStats = { ...team.batterStats };
    if (!newStats[cardId]) newStats[cardId] = { pa: 0, ab: 0, h: 0, r: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hr: 0, db: 0, tr: 0, tb: 0, sb: 0, cs: 0, gidp: 0, sh: 0, sf: 0 };
    newStats[cardId] = { ...newStats[cardId], [stat]: (newStats[cardId][stat] || 0) + amount };
    return { ...team, batterStats: newStats };
}

export function addPitcherStat(team, cardId, stat, amount = 1) {
    const newStats = { ...team.pitcherStats };
    if (!newStats[cardId]) newStats[cardId] = { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
    newStats[cardId] = { ...newStats[cardId], [stat]: (newStats[cardId][stat] || 0) + amount };
    return { ...team, pitcherStats: newStats };
}

/**
 * Update W/L tracker after any scoring event.
 * Call this after runs score and state.score has been updated.
 * Checks if the lead changed and records the responsible pitchers.
 */
export function updateWLTracker(state, prevHomeScore, prevAwayScore) {
    const { home, away } = state.score;
    const wl = { ...state.wlTracker };

    const prevLead = prevHomeScore > prevAwayScore ? 'home' : prevAwayScore > prevHomeScore ? 'away' : 'tied';
    const newLead = home > away ? 'home' : away > home ? 'away' : 'tied';

    // If the lead changed (including from tied to leading)
    if (newLead !== prevLead && newLead !== 'tied') {
        if (newLead === 'home') {
            // Home took the lead — home's current pitcher gets WP candidate
            // Away's current pitcher gets LP candidate (they allowed the go-ahead)
            wl.homeWP = state.homeTeam.pitcher.cardId;
            wl.awayLP = state.awayTeam.pitcher.cardId;
        } else {
            // Away took the lead
            wl.awayWP = state.awayTeam.pitcher.cardId;
            wl.homeLP = state.homeTeam.pitcher.cardId;
        }
    }

    return { ...state, wlTracker: wl };
}

/**
 * At game end, determine W/L/SV pitcher IDs.
 * Returns { winPitcherId, lossPitcherId, savePitcherId }
 */
export function determineWLS(state) {
    if (!state.isOver || !state.winnerId) return { winPitcherId: null, lossPitcherId: null, savePitcherId: null };

    const homeWon = state.score.home > state.score.away;
    const wl = state.wlTracker || {};

    const winPitcherId = homeWon ? (wl.homeWP || state.homeTeam.pitcher.cardId) : (wl.awayWP || state.awayTeam.pitcher.cardId);
    const lossPitcherId = homeWon ? (wl.awayLP || state.awayTeam.pitcher.cardId) : (wl.homeLP || state.homeTeam.pitcher.cardId);

    // Save: final pitcher on winning team, different from WP, entered with lead
    let savePitcherId = null;
    const winningTeam = homeWon ? state.homeTeam : state.awayTeam;
    const finalPitcher = winningTeam.pitcher.cardId;

    if (finalPitcher !== winPitcherId) {
        // Final pitcher is not the winning pitcher — check save criteria
        const leadMargin = Math.abs(state.score.home - state.score.away);
        const pitcherStats = winningTeam.pitcherStats?.[finalPitcher];
        const outsRecorded = pitcherStats?.ip || 0; // ip stored in thirds

        if (outsRecorded > 0) {
            // Save if: entered with lead of 3 or fewer, OR pitched 3+ innings (9+ outs)
            // We don't track exact entry lead, so use current margin as approximation
            // In practice, most Showdown saves are closers entering late with small leads
            if (leadMargin <= 3 || outsRecorded >= 9) {
                savePitcherId = finalPitcher;
            }
        }
    }

    return { winPitcherId, lossPitcherId, savePitcherId };
}
