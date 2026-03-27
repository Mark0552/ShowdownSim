-- Stats persistence
CREATE TABLE IF NOT EXISTS game_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id),
    series_id UUID REFERENCES series(id),
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
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE game_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own stats" ON game_player_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own stats" ON game_player_stats FOR SELECT USING (auth.uid() = user_id);

-- Password column on games
ALTER TABLE games ADD COLUMN IF NOT EXISTS password TEXT;
