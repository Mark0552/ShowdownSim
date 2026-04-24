import type { SeriesRow } from '../../types/game';
import {
    syncSeriesStarterOffsetFromGames,
    syncSeriesRelieverHistoryFromGames,
    syncSeriesWinsFromGames,
} from '../games';

/**
 * Run every series-level aggregation sync against a single series and
 * return the latest series row.
 *
 * Callers:
 *  - On game-over: updates the scoreboard's win count + ensures reliever
 *    history and starter offset are in Supabase for the UI to consume.
 *  - Right before ensureNextSeriesGame in the auto-advance flow: guarantees
 *    the next game's server-side init sees fully-synced aggregates. Before
 *    this, each sync fired fire-and-forget and a 2-second countdown could
 *    race ahead of the commits — the server has derivation fallbacks to
 *    compensate, but calling finalize first avoids triggering them.
 *
 * All three syncs are idempotent, so this function is safe to call
 * multiple times (e.g. on game-over AND before advance).
 *
 * Sequence matters only weakly: starter_offset comes from game 1's state
 * (not the just-finished game), reliever_history scans every finished
 * game, and wins scans every finished game with winner_user_id set.
 * Running sequentially keeps error handling simple — any failure bubbles
 * up immediately.
 */
export async function finalizeSeriesGame(seriesId: string): Promise<SeriesRow> {
    await syncSeriesStarterOffsetFromGames(seriesId);
    await syncSeriesRelieverHistoryFromGames(seriesId);
    return syncSeriesWinsFromGames(seriesId);
}
