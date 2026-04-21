-- Migration: allow deleting a game or series even when game_player_stats
-- rows still reference them. Run this ONCE in the Supabase SQL Editor.
--
-- Before: deleting a game failed with
--   update or delete on table "games" violates foreign key constraint
--   "game_player_stats_game_id_fkey" on table "game_player_stats"
-- because game_player_stats.game_id had no ON DELETE action (default NO
-- ACTION blocks the delete).
--
-- After:
--   - game_id ON DELETE CASCADE: stats are per-game, so deleting a game
--     cleans up its stat rows. No orphaned stats, no block.
--   - series_id ON DELETE SET NULL: deleting a series just detaches the
--     stats from the aggregation, doesn't drop them.

alter table game_player_stats drop constraint game_player_stats_game_id_fkey;
alter table game_player_stats drop constraint game_player_stats_series_id_fkey;

alter table game_player_stats add constraint game_player_stats_game_id_fkey
    foreign key (game_id) references games(id) on delete cascade;
alter table game_player_stats add constraint game_player_stats_series_id_fkey
    foreign key (series_id) references series(id) on delete set null;
