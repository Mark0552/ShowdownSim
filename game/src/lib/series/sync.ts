/**
 * Idempotent sync helpers that re-derive series-level aggregates from the
 * actual completed-game rows. Safe to re-run — each one diffs the stored
 * value and writes only when changed (except wins, which always returns
 * the latest series row for the caller's UI).
 *
 * Called individually by the game-over UI and en-masse by finalizeSeriesGame
 * before auto-advance creates the next game.
 */

import { getSeries, getSeriesGames, updateSeries } from './db';
import type { SeriesRow } from '../../types/game';

/**
 * Find the Starter-N number that actually pitched first in game 1. The
 * active pitcher may have changed mid-game (pitching change swaps in a
 * reliever), so we scan across active pitcher + bullpen + archivedPlayers
 * for any player with an assignedPosition matching /^Starter-(\d+)$/ who
 * recorded at least one batter faced. Returns 1-4 or null if not found.
 */
export function findGame1StarterNumber(state: any): number | null {
    const home = state?.homeTeam;
    if (!home) return null;
    const stats = home.pitcherStats || {};
    const pool: any[] = [home.pitcher, ...(home.bullpen || [])];
    if (home.archivedPlayers) {
        for (const id of Object.keys(home.archivedPlayers)) {
            if (!pool.find(p => p?.cardId === id)) pool.push(home.archivedPlayers[id]);
        }
    }
    let best: { num: number; bf: number } | null = null;
    for (const p of pool) {
        if (!p) continue;
        const pos = String(p.assignedPosition || '');
        const m = pos.match(/^Starter-(\d+)$/);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        if (!num || num < 1 || num > 4) continue;
        const bf = stats[p.cardId]?.bf || 0;
        // Prefer the starter who actually faced batters. Fall back to any
        // matched starter so a freshly-rolled-but-not-yet-pitched state
        // still produces an offset (covers the early-write call).
        if (!best || bf > best.bf) best = { num, bf };
    }
    return best ? best.num : null;
}

/**
 * Sync series.starter_offset from game 1's state. The engine's rotation
 * formula (((offset + gameNum - 2) % 4) + 1) cycles starting from the
 * offset, so this determines which SP pitches each game of the series.
 * Only writes when the value differs.
 */
export async function syncSeriesStarterOffsetFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const game1 = games.find(g => g.game_number === 1);
    if (!game1?.state) return;
    const offset = findGame1StarterNumber(game1.state);
    if (!offset) return;
    const series = await getSeries(seriesId);
    if (series.starter_offset === offset) return;
    await updateSeries(seriesId, { starter_offset: offset } as Partial<SeriesRow>);
}

/**
 * Sync series.reliever_history from completed-game rows. For each finished
 * game, find every non-Starter pitcher who recorded any batters faced (bf
 * > 0), and add that game_number to their list. Scans active pitcher +
 * bullpen + archivedPlayers so subbed-out pitchers still count.
 *
 * Bucketed by creator / opponent (stable across games) instead of home/away
 * (which swaps per MLB schedule). Server's initializeGame maps each bucket
 * to the right team based on each game's home_user_id vs series.home_user_id.
 */
export async function syncSeriesRelieverHistoryFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const finished = games.filter(g => g.status === 'finished' && g.state).sort((a, b) => a.game_number - b.game_number);
    const series = await getSeries(seriesId);
    const creatorUserId = series.home_user_id;
    const history: { creator: Record<string, number[]>; opponent: Record<string, number[]> } = { creator: {}, opponent: {} };

    for (const game of finished) {
        for (const side of ['home', 'away'] as const) {
            const team = game.state[`${side}Team`];
            if (!team) continue;
            const sideUserId = side === 'home' ? game.home_user_id : game.away_user_id;
            const bucket: 'creator' | 'opponent' = sideUserId === creatorUserId ? 'creator' : 'opponent';
            const pitcherStats = team.pitcherStats || {};
            const allPitchers: any[] = [];
            if (team.pitcher) allPitchers.push(team.pitcher);
            for (const p of team.bullpen || []) allPitchers.push(p);
            if (team.archivedPlayers) {
                for (const id of Object.keys(team.archivedPlayers)) {
                    if (team.archivedPlayers[id].type === 'pitcher') allPitchers.push(team.archivedPlayers[id]);
                }
            }
            for (const p of allPitchers) {
                if (!p.cardId) continue;
                if (p.role === 'Starter') continue;
                const stats = pitcherStats[p.cardId];
                if (!stats || (stats.bf || 0) === 0) continue;
                const list = history[bucket][p.cardId] = history[bucket][p.cardId] || [];
                if (!list.includes(game.game_number)) list.push(game.game_number);
            }
        }
    }

    await updateSeries(seriesId, { reliever_history: history } as Partial<SeriesRow>);
}

/**
 * Sync series.home_wins / series.away_wins + series.status from the actual
 * completed-game rows. Safe to call any number of times — uses games as the
 * source of truth so page revisits / reloads don't double-count. Returns the
 * latest series row so the caller can update its UI immediately.
 */
export async function syncSeriesWinsFromGames(seriesId: string): Promise<SeriesRow> {
    const games = await getSeriesGames(seriesId);
    const series = await getSeries(seriesId);
    const homeWins = games.filter(g => g.status === 'finished' && g.winner_user_id === g.home_user_id).length;
    const awayWins = games.filter(g => g.status === 'finished' && g.winner_user_id === g.away_user_id).length;
    const decided = Math.max(homeWins, awayWins) > series.best_of / 2;
    const updates: Partial<SeriesRow> = { home_wins: homeWins, away_wins: awayWins };
    if (decided && series.status !== 'finished') {
        updates.status = 'finished';
        updates.winner_user_id = homeWins > awayWins ? series.home_user_id : (series.away_user_id || null);
    }
    if (homeWins !== series.home_wins || awayWins !== series.away_wins || (decided && series.status !== 'finished')) {
        await updateSeries(seriesId, updates);
    }
    return { ...series, ...updates } as SeriesRow;
}
