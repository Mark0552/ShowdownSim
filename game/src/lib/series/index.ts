/**
 * Barrel re-export for series-level logic. Consumers should import from
 * '../lib/series' rather than drilling into individual files.
 */

export {
    createSeries,
    getSeries,
    getSeriesGames,
    updateSeries,
    deleteSeries,
    ensureNextSeriesGame,
    setReadyForNextGame,
    subscribeToSeriesGames,
} from './db';

export {
    findGame1StarterNumber,
    syncSeriesStarterOffsetFromGames,
    syncSeriesRelieverHistoryFromGames,
    syncSeriesWinsFromGames,
} from './sync';

export { finalizeSeriesGame } from './finalize';

export { isCreatorHomeInGame, homeFieldLabel } from '../seriesSchedule';
export {
    computeStarterSlot,
    findStarterNameInLineup,
    getGameStarterNames,
    winnerSide,
    gameScore,
    liveInning,
} from '../seriesRotation';
export type { StarterNames, GameScore, InningMarker } from '../seriesRotation';
