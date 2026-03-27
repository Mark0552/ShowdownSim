-- MLB Showdown Series Support
-- Run this in the Supabase SQL editor

-- Series table
CREATE TABLE IF NOT EXISTS series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_user_id UUID NOT NULL REFERENCES auth.users(id),
    away_user_id UUID REFERENCES auth.users(id),
    home_user_email TEXT,
    away_user_email TEXT,
    best_of INT NOT NULL DEFAULT 1,       -- 1, 3, 5, or 7
    home_wins INT DEFAULT 0,
    away_wins INT DEFAULT 0,
    home_lineup_id UUID,
    away_lineup_id UUID,
    home_lineup_name TEXT,
    away_lineup_name TEXT,
    status TEXT DEFAULT 'waiting',          -- waiting, in_progress, finished
    winner_user_id UUID,
    starter_offset INT DEFAULT 0,          -- SP number determined by game 1 roll (0-3)
    reliever_history JSONB DEFAULT '{}',   -- tracks reliever usage per game for fatigue
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add series columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_number INT DEFAULT 1;

-- RLS for series table
ALTER TABLE series ENABLE ROW LEVEL SECURITY;

-- Anyone can see waiting series (for lobby)
CREATE POLICY "Anyone can view waiting series" ON series
    FOR SELECT USING (status = 'waiting' OR auth.uid() = home_user_id OR auth.uid() = away_user_id);

-- Creator can insert
CREATE POLICY "Users can create series" ON series
    FOR INSERT WITH CHECK (auth.uid() = home_user_id);

-- Participants can update their series
CREATE POLICY "Participants can update series" ON series
    FOR UPDATE USING (auth.uid() = home_user_id OR auth.uid() = away_user_id);

-- Creator can delete waiting series
CREATE POLICY "Creator can delete waiting series" ON series
    FOR DELETE USING (auth.uid() = home_user_id AND status = 'waiting');
