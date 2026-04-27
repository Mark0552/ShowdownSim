/**
 * Series-level Supabase operations: CRUD for the `series` table plus the
 * next-game insert flow, ready-up toggle, and realtime subscription.
 *
 * Separated from lib/games.ts so the series surface is discoverable in one
 * place. Pure sync/aggregation helpers live in ./sync.ts; orchestration that
 * runs every sync in order lives in ./finalize.ts.
 */

import { supabase } from '../supabase';
import { getUser, getUsername } from '../auth';
import { isCreatorHomeInGame } from '../seriesSchedule';
import { deleteGame } from '../games';
import type { GameRow, SeriesRow, PlayerRole } from '../../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// CRUD
// ============================================================================

export async function createSeries(bestOf: number, password?: string, mode: 'lineup' | 'draft' = 'lineup'): Promise<{ series: SeriesRow; game: GameRow }> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const { data: series, error: seriesError } = await supabase
        .from('series')
        .insert({
            home_user_id: user.id,
            home_user_email: getUsername(user),
            best_of: bestOf,
            status: 'waiting',
            mode,
        })
        .select()
        .single();
    if (seriesError) throw seriesError;

    const gameInsert: any = {
        home_user_id: user.id,
        home_user_email: getUsername(user),
        status: 'waiting',
        series_id: series.id,
        game_number: 1,
        mode,
    };
    if (password) gameInsert.password = password;

    const { data: game, error: gameError } = await supabase
        .from('games')
        .insert(gameInsert)
        .select()
        .single();
    if (gameError) throw gameError;

    return { series, game };
}

export async function getSeries(seriesId: string): Promise<SeriesRow> {
    const { data, error } = await supabase
        .from('series')
        .select('*')
        .eq('id', seriesId)
        .single();
    if (error) throw error;
    return data;
}

export async function getSeriesGames(seriesId: string): Promise<GameRow[]> {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('series_id', seriesId)
        .order('game_number', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function updateSeries(seriesId: string, updates: Partial<SeriesRow>): Promise<void> {
    const { error } = await supabase
        .from('series')
        .update(updates)
        .eq('id', seriesId);
    if (error) throw error;
}

/**
 * Delete every game in a series, then the series row (if RLS permits).
 * Individual deleteGame calls cascade game_player_stats via FK; the last
 * game deletion triggers the orphan-series cleanup path. This function also
 * tries an explicit series delete at the end for the mid-series case where
 * the orphan path's RLS filter (waiting-only) wouldn't fire.
 */
export async function deleteSeries(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    for (const g of games) {
        try { await deleteGame(g.id); }
        catch { /* continue — best-effort */ }
    }
    try {
        await supabase.from('series').delete().eq('id', seriesId);
    } catch { /* ignore */ }
}

// ============================================================================
// NEXT-GAME CREATION
// ============================================================================

/**
 * Create the next game in a series, or return the existing one if already
 * created (race-safe). Either client can call this.
 *
 * Enforces two rules:
 *   1. Same lineup throughout the series — carries lineup IDs/names and the
 *      embedded lineup data from the previous game.
 *   2. MLB postseason home-field schedule — the creator (higher seed) hosts
 *      a specific subset of games depending on bestOf:
 *        best-of-3: all games at creator (3-0-0)
 *        best-of-5: creator hosts 1, 2, 5 (2-2-1)
 *        best-of-7: creator hosts 1, 2, 6, 7 (2-3-2)
 *      Swaps home/away on the new game row when the schedule calls for it.
 *
 * Both ready flags are set to true so the lobby skips lineup-select. The
 * server reads state.homeLineup/awayLineup on join and starts immediately.
 */
export async function ensureNextSeriesGame(seriesId: string, gameNumber: number): Promise<GameRow> {
    const games = await getSeriesGames(seriesId);
    const existing = games.find(g => g.game_number === gameNumber);
    if (existing) return existing;

    const series = await getSeries(seriesId);
    const creatorUserId = series.home_user_id;
    const creatorUsername = series.home_user_email;
    // series.away_user_id wasn't populated for older series (joinGame only
    // wrote the games row). Fall back to deriving the opponent from any
    // sibling game whose home/away spread reveals the non-creator.
    let opponentUserId = series.away_user_id;
    let opponentUsername = series.away_user_email;
    if (!opponentUserId) {
        for (const g of games) {
            if (g.away_user_id && g.away_user_id !== creatorUserId) {
                opponentUserId = g.away_user_id;
                opponentUsername = g.away_user_email;
                break;
            }
            if (g.home_user_id && g.home_user_id !== creatorUserId) {
                opponentUserId = g.home_user_id;
                opponentUsername = g.home_user_email;
                break;
            }
        }
        // Best-effort: backfill the series row so subsequent calls don't
        // need to re-derive. Failures are non-fatal — RLS or transient
        // errors shouldn't block advancement.
        if (opponentUserId) {
            try {
                await updateSeries(seriesId, {
                    away_user_id: opponentUserId,
                    away_user_email: opponentUsername,
                } as Partial<SeriesRow>);
            } catch { /* non-fatal */ }
        }
    }
    if (!creatorUserId || !opponentUserId) {
        throw new Error('Cannot advance series: both players must be present.');
    }

    const prevGame = games.find(g => g.game_number === gameNumber - 1);
    const prevState: any = prevGame?.state || {};

    // Map the previous game's home/away fields back to creator/opponent —
    // the prev game may have had its sides swapped by the schedule.
    const prevCreatorWasHome = prevGame ? prevGame.home_user_id === creatorUserId : true;
    const creatorLineup = prevCreatorWasHome ? prevState.homeLineup : prevState.awayLineup;
    const opponentLineup = prevCreatorWasHome ? prevState.awayLineup : prevState.homeLineup;
    const creatorLineupId = prevCreatorWasHome ? prevGame?.home_lineup_id : prevGame?.away_lineup_id;
    const creatorLineupName = prevCreatorWasHome ? prevGame?.home_lineup_name : prevGame?.away_lineup_name;
    const opponentLineupId = prevCreatorWasHome ? prevGame?.away_lineup_id : prevGame?.home_lineup_id;
    const opponentLineupName = prevCreatorWasHome ? prevGame?.away_lineup_name : prevGame?.home_lineup_name;

    const creatorIsHome = isCreatorHomeInGame(series.best_of, gameNumber);

    const newHomeUserId = creatorIsHome ? creatorUserId : opponentUserId;
    const newAwayUserId = creatorIsHome ? opponentUserId : creatorUserId;
    const newHomeUsername = creatorIsHome ? creatorUsername : opponentUsername;
    const newAwayUsername = creatorIsHome ? opponentUsername : creatorUsername;
    const newHomeLineup = creatorIsHome ? creatorLineup : opponentLineup;
    const newAwayLineup = creatorIsHome ? opponentLineup : creatorLineup;
    const newHomeLineupId = creatorIsHome ? creatorLineupId : opponentLineupId;
    const newHomeLineupName = creatorIsHome ? creatorLineupName : opponentLineupName;
    const newAwayLineupId = creatorIsHome ? opponentLineupId : creatorLineupId;
    const newAwayLineupName = creatorIsHome ? opponentLineupName : creatorLineupName;

    const initialState = {
        homeLineup: newHomeLineup,
        awayLineup: newAwayLineup,
    };

    try {
        const { data, error } = await supabase
            .from('games')
            .insert({
                home_user_id: newHomeUserId,
                away_user_id: newAwayUserId,
                home_user_email: newHomeUsername,
                away_user_email: newAwayUsername,
                status: 'lineup_select',
                series_id: seriesId,
                game_number: gameNumber,
                home_lineup_id: newHomeLineupId,
                home_lineup_name: newHomeLineupName,
                away_lineup_id: newAwayLineupId,
                away_lineup_name: newAwayLineupName,
                home_ready: true,
                away_ready: true,
                state: initialState,
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (e: any) {
        // Only swallow the UNIQUE-constraint race (Postgres 23505 on
        // games_series_id_game_number_key) — the other client inserted
        // first, so we refetch and return their row. Any other error
        // (RLS, FK, network) is a real failure and must bubble up.
        const isUniqueViolation = e?.code === '23505' || /duplicate key|unique/i.test(e?.message || '');
        if (!isUniqueViolation) throw e;
        const refetched = await getSeriesGames(seriesId);
        const found = refetched.find(g => g.game_number === gameNumber);
        if (found) return found;
        throw e;
    }
}

// ============================================================================
// READY-UP TOGGLE
// ============================================================================

/**
 * Toggle the current player's "ready for next series game" flag using a
 * dedicated boolean column per role (home_ready_next / away_ready_next).
 *
 * Each role only writes its own column, so there's no read-modify-write
 * race even if both players click simultaneously. We .select() so the DB
 * returns the affected row(s); 0 rows means RLS or some other filter
 * silently swallowed the UPDATE, which is the failure mode that produced
 * the long-standing "ready bounces back" bug. Throw loudly so the caller
 * can roll back the optimistic UI flip instead of leaving the user
 * staring at a fake ✓ that never advances the game.
 */
export async function setReadyForNextGame(gameId: string, role: PlayerRole, ready: boolean): Promise<void> {
    const column = role === 'home' ? 'home_ready_next' : 'away_ready_next';
    const { data, error } = await supabase
        .from('games')
        .update({ [column]: ready })
        .eq('id', gameId)
        .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(`Ready-up write affected 0 rows (gameId=${gameId}, role=${role}). RLS denied or row missing.`);
    }
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to new games being added to a series — used so when one player
 * creates the next game, the other auto-detects and can navigate.
 */
export function subscribeToSeriesGames(seriesId: string, onChange: (game: GameRow) => void): () => void {
    const channel: RealtimeChannel = supabase
        .channel(`series-games-${seriesId}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'games', filter: `series_id=eq.${seriesId}` },
            (payload) => onChange(payload.new as GameRow))
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}
