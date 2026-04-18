import { supabase } from './supabase';
import { getUsername, getUser } from './auth';
import type { GameRow, SeriesRow, PlayerRole } from '../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';

export async function createGame(password?: string): Promise<GameRow> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const insert: any = {
        home_user_id: user.id,
        home_user_email: getUsername(user),
        status: 'waiting',
    };
    if (password) insert.password = password;

    const { data, error } = await supabase
        .from('games')
        .insert(insert)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getOpenGames(): Promise<GameRow[]> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'waiting')
        .neq('home_user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getMyGames(): Promise<GameRow[]> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('games')
        .select('*')
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .in('status', ['lineup_select', 'in_progress'])
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function joinGame(gameId: string): Promise<GameRow> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Update first
    const { error: updateError } = await supabase
        .from('games')
        .update({
            away_user_id: user.id,
            away_user_email: getUsername(user),
            status: 'lineup_select',
        })
        .eq('id', gameId)
        .eq('status', 'waiting');
    if (updateError) throw updateError;

    // Then fetch (now the user is a participant, so RLS allows it)
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    if (error) throw error;
    return data;
}

export async function selectLineup(gameId: string, role: PlayerRole, lineupId: string, lineupName: string, lineupData: any): Promise<void> {
    // Use separate JSONB fields to avoid race condition when both players write simultaneously
    // We use a Postgres jsonb merge via raw SQL-like approach, but since we can't do that
    // easily with the JS client, we use separate columns per role via the pending_action field
    // as a temp store for the away lineup, OR we just retry the merge

    // Retry loop to handle race condition
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data: current } = await supabase.from('games').select('state').eq('id', gameId).single();
        const existingState = (typeof current?.state === 'object' && current?.state !== null) ? current.state : {};

        const newState = {
            ...existingState,
            [`${role}Lineup`]: lineupData,
        };

        const update = role === 'home'
            ? { home_lineup_id: lineupId, home_lineup_name: lineupName, home_ready: true, state: newState }
            : { away_lineup_id: lineupId, away_lineup_name: lineupName, away_ready: true, state: newState };

        const { error } = await supabase
            .from('games')
            .update(update)
            .eq('id', gameId);

        if (!error) return;
        // Wait a bit and retry
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Failed to save lineup after retries');
}

export async function startGame(gameId: string, initialState: any): Promise<void> {
    const { error } = await supabase
        .from('games')
        .update({ status: 'in_progress', state: initialState })
        .eq('id', gameId);
    if (error) throw error;
}

export async function updateGameState(gameId: string, state: any): Promise<void> {
    const { error } = await supabase
        .from('games')
        .update({ state })
        .eq('id', gameId);
    if (error) throw error;
}

export async function deleteGame(gameId: string): Promise<void> {
    const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);
    if (error) throw error;
}

export async function getGame(gameId: string): Promise<GameRow> {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    if (error) throw error;
    return data;
}

export function getMyRole(game: GameRow, userId: string): PlayerRole | null {
    if (game.home_user_id === userId) return 'home';
    if (game.away_user_id === userId) return 'away';
    return null;
}

export function subscribeToGame(gameId: string, callback: (game: GameRow) => void): RealtimeChannel {
    return supabase
        .channel(`game-${gameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
        }, (payload) => {
            callback(payload.new as GameRow);
        })
        .subscribe();
}

export function subscribeToLobby(callback: (games: GameRow[]) => void): RealtimeChannel {
    // Initial fetch + subscribe to changes
    getOpenGames().then(callback);

    return supabase
        .channel('lobby')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'games',
        }, () => {
            // Refetch on any change
            getOpenGames().then(callback);
        })
        .subscribe();
}

// ============================================================================
// SERIES
// ============================================================================

export async function createSeries(bestOf: number, password?: string): Promise<{ series: SeriesRow; game: GameRow }> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Create series
    const { data: series, error: seriesError } = await supabase
        .from('series')
        .insert({
            home_user_id: user.id,
            home_user_email: getUsername(user),
            best_of: bestOf,
            status: 'waiting',
        })
        .select()
        .single();
    if (seriesError) throw seriesError;

    // Create first game in series
    const gameInsert: any = {
        home_user_id: user.id,
        home_user_email: getUsername(user),
        status: 'waiting',
        series_id: series.id,
        game_number: 1,
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

export async function createNextSeriesGame(seriesId: string, gameNumber: number, homeUserId: string, awayUserId: string, homeEmail: string, awayEmail: string): Promise<GameRow> {
    const { data, error } = await supabase
        .from('games')
        .insert({
            home_user_id: homeUserId,
            away_user_id: awayUserId,
            home_user_email: homeEmail,
            away_user_email: awayEmail,
            status: 'lineup_select',
            series_id: seriesId,
            game_number: gameNumber,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Idempotently sync a series' starter_offset from the actual game-1 state.
 * Reads game 1's home-team active pitcher, parses "Starter-N" from its
 * assignedPosition, and writes that N as the series' starter_offset so the
 * engine's rotation formula (((offset + gameNum - 2) % 4) + 1) cycles
 * starting from the next slot. Safe to call any time — only writes when
 * game 1 has finished its SP roll and the value differs from what's stored.
 */
export async function syncSeriesStarterOffsetFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const game1 = games.find(g => g.game_number === 1);
    if (!game1?.state?.homeTeam?.pitcher?.assignedPosition) return;
    const pos = String(game1.state.homeTeam.pitcher.assignedPosition);
    const m = pos.match(/^Starter-(\d+)$/);
    if (!m) return;
    const offset = parseInt(m[1], 10);
    if (!offset || offset < 1 || offset > 4) return;
    const series = await getSeries(seriesId);
    if (series.starter_offset === offset) return; // already in sync
    await updateSeries(seriesId, { starter_offset: offset } as Partial<SeriesRow>);
}

/**
 * Idempotently sync a series' reliever_history from completed-game rows.
 * For each finished game, find every non-Starter pitcher who recorded any
 * batters faced (bf > 0), and add that game_number to their list. Looks
 * across active pitcher + bullpen + archivedPlayers (subbed-out pitchers
 * still count). Safe to re-run.
 */
export async function syncSeriesRelieverHistoryFromGames(seriesId: string): Promise<void> {
    const games = await getSeriesGames(seriesId);
    const finished = games.filter(g => g.status === 'finished' && g.state).sort((a, b) => a.game_number - b.game_number);
    const history: { home: Record<string, number[]>; away: Record<string, number[]> } = { home: {}, away: {} };

    for (const game of finished) {
        for (const side of ['home', 'away'] as const) {
            const team = game.state[`${side}Team`];
            if (!team) continue;
            const pitcherStats = team.pitcherStats || {};
            // Collect all pitchers we know about: active + bullpen + archived
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
                const list = history[side][p.cardId] = history[side][p.cardId] || [];
                if (!list.includes(game.game_number)) list.push(game.game_number);
            }
        }
    }

    await updateSeries(seriesId, { reliever_history: history } as Partial<SeriesRow>);
}

/**
 * Idempotently sync a series' win counts from the actual completed-game rows.
 * Safe to call any number of times — uses the games table as source of truth so
 * page revisits / reloads don't double-count.
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

/**
 * Create the next game in a series, or return the existing one if already
 * been created (race-safe). Either client can call this.
 *
 * Enforces the "same lineup throughout the series" rule by carrying the
 * previous game's lineup IDs + names AND the embedded lineup data from
 * game.state.{homeLineup,awayLineup} into the new game, and setting both
 * ready flags to true so the lobby skips lineup-select entirely. When the
 * clients navigate to the new game, the server finds state.homeLineup /
 * awayLineup and initializes immediately — no "waiting for opponent".
 */
export async function ensureNextSeriesGame(
    seriesId: string,
    gameNumber: number,
    homeUserId: string,
    awayUserId: string,
    homeEmail: string,
    awayEmail: string,
): Promise<GameRow> {
    const games = await getSeriesGames(seriesId);
    const existing = games.find(g => g.game_number === gameNumber);
    if (existing) return existing;

    const prevGame = games.find(g => g.game_number === gameNumber - 1);
    const prevState: any = prevGame?.state || {};
    const initialState = {
        homeLineup: prevState.homeLineup,
        awayLineup: prevState.awayLineup,
    };

    try {
        const { data, error } = await supabase
            .from('games')
            .insert({
                home_user_id: homeUserId,
                away_user_id: awayUserId,
                home_user_email: homeEmail,
                away_user_email: awayEmail,
                status: 'lineup_select',
                series_id: seriesId,
                game_number: gameNumber,
                home_lineup_id: prevGame?.home_lineup_id,
                home_lineup_name: prevGame?.home_lineup_name,
                away_lineup_id: prevGame?.away_lineup_id,
                away_lineup_name: prevGame?.away_lineup_name,
                home_ready: true,
                away_ready: true,
                state: initialState,
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (e) {
        const refetched = await getSeriesGames(seriesId);
        const found = refetched.find(g => g.game_number === gameNumber);
        if (found) return found;
        throw e;
    }
}

/** Subscribe to new games being added to a series — used so when one player
 *  creates the next game, the other auto-detects and can navigate. */
export function subscribeToSeriesGames(seriesId: string, onChange: (game: GameRow) => void) {
    const channel = supabase
        .channel(`series-games-${seriesId}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'games', filter: `series_id=eq.${seriesId}` },
            (payload) => onChange(payload.new as GameRow))
        .subscribe();
    return () => { supabase.removeChannel(channel); };
}
