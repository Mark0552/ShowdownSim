import type { GameRow, SeriesRow } from '../../types/game';
import { computeStarterSlot, findStarterNameInLineup, winnerSide, gameScore, liveInning } from '../../lib/seriesRotation';
import './SeriesCard.css';

interface Props {
    series: SeriesRow;
    games: GameRow[];          // all DB-persisted games in the series, in game_number order
    userId: string;
    onResumeSeries?: () => void;
    onDeleteSeries?: () => void;
    /** When provided, individual game rows become clickable (used by history view). */
    onGameClick?: (game: GameRow) => void;
}

interface DisplayRow {
    gameNumber: number;
    game: GameRow | null;      // null = upcoming (not yet persisted)
    homeStarter: string | null;
    awayStarter: string | null;
}

/** Pull the locked lineup snapshots from any existing game in the series. */
function lockedLineups(games: GameRow[]): { home: any; away: any } {
    for (const g of games) {
        const home = g.state?.homeLineup;
        const away = g.state?.awayLineup;
        if (home && away) return { home, away };
    }
    return { home: null, away: null };
}

function statusBadge(row: DisplayRow): { label: string; cls: string } {
    const g = row.game;
    if (!g) return { label: 'UPCOMING', cls: 'status-upcoming' };
    if (g.status === 'finished') return { label: 'FINAL', cls: 'status-final' };
    if (g.status === 'in_progress') {
        const li = liveInning(g);
        if (li) {
            const arrow = li.half === 'top' ? '▲' : '▼';
            return { label: `LIVE · ${arrow}${li.inning}`, cls: 'status-live' };
        }
        return { label: 'LIVE', cls: 'status-live' };
    }
    if (g.status === 'lineup_select') return { label: 'LINEUP SELECT', cls: 'status-select' };
    return { label: 'WAITING', cls: 'status-select' };
}

export default function SeriesCard({ series, games, userId, onResumeSeries, onDeleteSeries, onGameClick }: Props) {
    const homeName = series.home_user_email || 'Home';
    const awayName = series.away_user_email || 'Away';
    const isCreator = series.home_user_id === userId;
    const showActions = !!(onResumeSeries || (onDeleteSeries && isCreator));

    const lineups = lockedLineups(games);
    const rows: DisplayRow[] = [];

    // Existing games, ordered
    const ordered = [...games].sort((a, b) => a.game_number - b.game_number);
    const lastPlayedNum = ordered.length > 0 ? ordered[ordered.length - 1].game_number : 0;

    for (const g of ordered) {
        const slot = computeStarterSlot(series.starter_offset, g.game_number);
        const homeStarter = g.state?.homeTeam?.pitcher?.name
            ?? findStarterNameInLineup(g.state?.homeLineup ?? lineups.home, slot);
        const awayStarter = g.state?.awayTeam?.pitcher?.name
            ?? findStarterNameInLineup(g.state?.awayLineup ?? lineups.away, slot);
        rows.push({
            gameNumber: g.game_number,
            game: g,
            homeStarter: homeStarter ?? null,
            awayStarter: awayStarter ?? null,
        });
    }

    // Upcoming games — show whenever we have locked lineups and the series isn't decided.
    // If starter_offset is 0 (G1 hasn't rolled yet), SP names will be blank until the roll.
    if (series.status !== 'finished' && lineups.home && lineups.away) {
        const neededToWin = Math.floor(series.best_of / 2) + 1;
        for (let n = lastPlayedNum + 1; n <= series.best_of; n++) {
            if ((series.home_wins || 0) >= neededToWin || (series.away_wins || 0) >= neededToWin) break;
            const slot = computeStarterSlot(series.starter_offset, n);
            rows.push({
                gameNumber: n,
                game: null,
                homeStarter: findStarterNameInLineup(lineups.home, slot),
                awayStarter: findStarterNameInLineup(lineups.away, slot),
            });
        }
    }

    const recordStr = `${series.home_wins || 0}–${series.away_wins || 0}`;
    const seriesWinnerSide = series.status === 'finished'
        ? (series.winner_user_id === series.home_user_id ? 'home' : 'away')
        : null;

    return (
        <div className="series-card">
            <div className="series-card-header">
                <div className="series-card-title">
                    <span className={`series-card-user ${seriesWinnerSide === 'home' ? 'winner' : ''}`}>{homeName}</span>
                    <span className="series-card-vs">vs</span>
                    <span className={`series-card-user ${seriesWinnerSide === 'away' ? 'winner' : ''}`}>{awayName}</span>
                </div>
                <div className="series-card-meta">
                    <span className="series-card-bestof">Best of {series.best_of}</span>
                    <span className="series-card-record">{recordStr}</span>
                </div>
            </div>

            <div className="series-card-games">
                {rows.map(r => {
                    const s = statusBadge(r);
                    const score = r.game ? gameScore(r.game) : null;
                    const winner = r.game ? winnerSide(r.game) : null;
                    const clickable = !!(onGameClick && r.game);
                    return (
                        <div
                            key={r.gameNumber}
                            className={`series-game ${!r.game ? 'upcoming' : ''} ${clickable ? 'clickable' : ''}`}
                            onClick={clickable ? () => onGameClick!(r.game!) : undefined}
                        >
                            <div className="series-game-top">
                                <span className="series-game-num">G{r.gameNumber}</span>
                                <span className={`series-game-status ${s.cls}`}>{s.label}</span>
                            </div>
                            <div className="series-game-rows">
                                <div className={`series-game-row ${winner === 'home' ? 'winner' : (winner === 'away' ? 'loser' : '')}`}>
                                    <span className="series-player">{homeName}</span>
                                    <span className="series-pitcher">{r.homeStarter ? `· ${r.homeStarter}` : ''}</span>
                                    <span className="series-score">{score ? score.home : ''}</span>
                                    <span className="series-winner-mark">{winner === 'home' ? '◀ W' : ''}</span>
                                </div>
                                <div className={`series-game-row ${winner === 'away' ? 'winner' : (winner === 'home' ? 'loser' : '')}`}>
                                    <span className="series-player">{awayName}</span>
                                    <span className="series-pitcher">{r.awayStarter ? `· ${r.awayStarter}` : ''}</span>
                                    <span className="series-score">{score ? score.away : ''}</span>
                                    <span className="series-winner-mark">{winner === 'away' ? '◀ W' : ''}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showActions && (
                <div className="series-card-actions">
                    {onResumeSeries && (
                        <button className="series-resume" onClick={onResumeSeries}>
                            {series.status === 'finished' ? 'View Series' : 'Resume Series'}
                        </button>
                    )}
                    {isCreator && onDeleteSeries && (
                        <button className="series-delete" onClick={onDeleteSeries}>
                            Delete Series
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
