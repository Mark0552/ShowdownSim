-- Stats persistence
CREATE TABLE IF NOT EXISTS game_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- CASCADE: stats are per-game, so deleting a game should clean up its
    -- stat rows rather than block the delete.
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    -- SET NULL: deleting a series doesn't need to kill the per-game stats,
    -- just detach them from the series aggregation.
    series_id UUID REFERENCES series(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    card_type TEXT NOT NULL,
    ab INT DEFAULT 0, h INT DEFAULT 0, r INT DEFAULT 0, rbi INT DEFAULT 0,
    bb INT DEFAULT 0, ibb INT DEFAULT 0, so INT DEFAULT 0, hr INT DEFAULT 0,
    sb INT DEFAULT 0, cs INT DEFAULT 0,
    ip INT DEFAULT 0,
    p_h INT DEFAULT 0, p_r INT DEFAULT 0, p_bb INT DEFAULT 0, p_ibb INT DEFAULT 0,
    p_so INT DEFAULT 0, p_hr INT DEFAULT 0, bf INT DEFAULT 0,
    win BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Prevent duplicate stat rows for the same (game, user, card). Both
    -- players' clients save at game-end; without this either a second
    -- fire or a reconnect-after-over could insert a duplicate.
    CONSTRAINT game_player_stats_game_user_card_unique UNIQUE (game_id, user_id, card_id)
);

ALTER TABLE game_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own stats" ON game_player_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own stats" ON game_player_stats FOR SELECT USING (auth.uid() = user_id);

-- Password column on games
ALTER TABLE games ADD COLUMN IF NOT EXISTS password TEXT;
