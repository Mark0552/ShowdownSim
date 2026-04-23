-- MLB Showdown — Series Delete RLS
-- Allows the series creator (home_user_id) to delete their own series rows
-- regardless of status. Previously only waiting-series could be deleted,
-- which meant the lobby's "Delete Series" button silently left a dangling
-- row for in-progress and finished series even after all child games had
-- been cascaded away via game_player_stats.game_id ON DELETE CASCADE.

DROP POLICY IF EXISTS "Creator can delete waiting series" ON series;

CREATE POLICY "Creator can delete own series" ON series
    FOR DELETE USING (auth.uid() = home_user_id);
