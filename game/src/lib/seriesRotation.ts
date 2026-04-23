import type { GameRow, SeriesRow } from '../types/game';

/**
 * Compute the SP slot number (1-4) for a given game in a series.
 * Offset is the slot from Game 1's d20 SP roll; the formula matches the
 * server-side rotation.
 */
export function computeStarterSlot(offset: number, gameNum: number): number {
    if (!offset || offset < 1) return 0;
    if (gameNum === 1) return offset;
    return ((offset + gameNum - 2) % 4) + 1;
}

/** Find the player name occupying a specific Starter-N slot in a raw lineup snapshot. */
export function findStarterNameInLineup(lineup: any, slotNum: number): string | null {
    if (!lineup?.slots || !slotNum) return null;
    const slot = lineup.slots.find((s: any) => s.assignedPosition === `Starter-${slotNum}`);
    return slot?.card?.name ?? null;
}

/** Find the active pitcher's name on the live team state. */
function livePitcherName(team: any): string | null {
    return team?.pitcher?.name ?? null;
}

export interface StarterNames {
    home: string | null;
    away: string | null;
}

/**
 * Get the starter names for a game. For live/finished games we prefer the
 * actual active pitcher on the live team state (reflects any mid-game subs
 * for the purposes of the box score line). For lineup-select/upcoming games
 * we compute from the rotation formula against the locked lineup snapshot.
 */
export function getGameStarterNames(
    game: GameRow | null,
    series: SeriesRow | null,
    gameNum: number,
    fallbackLineups?: { home?: any; away?: any },
): StarterNames {
    // Live / finished: read the game 1 SP from state.spRoll on that game, or
    // the active pitcher on the live team state.
    if (game?.state?.homeTeam?.pitcher && game?.state?.awayTeam?.pitcher) {
        return {
            home: livePitcherName(game.state.homeTeam),
            away: livePitcherName(game.state.awayTeam),
        };
    }

    // Computed (upcoming or lineup-select) — need both the offset and the
    // locked lineups.
    const offset = series?.starter_offset || 0;
    const slot = computeStarterSlot(offset, gameNum);
    if (!slot) return { home: null, away: null };

    const homeLineup = game?.state?.homeLineup || fallbackLineups?.home;
    const awayLineup = game?.state?.awayLineup || fallbackLineups?.away;
    return {
        home: findStarterNameInLineup(homeLineup, slot),
        away: findStarterNameInLineup(awayLineup, slot),
    };
}

/** Derive a single winner side ('home' | 'away' | null) from a finished game row. */
export function winnerSide(game: GameRow): 'home' | 'away' | null {
    if (game.status !== 'finished' || !game.winner_user_id) return null;
    if (game.winner_user_id === game.home_user_id) return 'home';
    if (game.winner_user_id === game.away_user_id) return 'away';
    return null;
}

export interface GameScore { home: number; away: number; }

export function gameScore(game: GameRow): GameScore | null {
    const s = game.state?.score;
    if (!s) return null;
    return { home: Number(s.home) || 0, away: Number(s.away) || 0 };
}

export interface InningMarker { half: 'top' | 'bottom'; inning: number; }

export function liveInning(game: GameRow): InningMarker | null {
    if (game.status !== 'in_progress') return null;
    const st = game.state;
    if (!st?.inning) return null;
    return { half: st.halfInning === 'top' ? 'top' : 'bottom', inning: st.inning };
}
