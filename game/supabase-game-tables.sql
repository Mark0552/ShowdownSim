-- MLB Showdown Game Tables
-- Run this in the Supabase SQL Editor

-- Games table
create table if not exists games (
    id uuid default gen_random_uuid() primary key,
    status text not null default 'waiting',
    home_user_id uuid references auth.users(id) not null,
    away_user_id uuid references auth.users(id),
    home_user_email text,
    away_user_email text,
    -- ON DELETE SET NULL: deleting a lineup doesn't block the delete; it just
    -- nulls the id on any games that reference it. Safe because games embed
    -- the full lineup data in state.homeLineup / state.awayLineup at start.
    home_lineup_id uuid references lineups(id) on delete set null,
    away_lineup_id uuid references lineups(id) on delete set null,
    home_lineup_name text,
    away_lineup_name text,
    home_ready boolean default false,
    away_ready boolean default false,
    state jsonb default '{}'::jsonb,
    pending_action jsonb,
    winner_user_id uuid references auth.users(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    -- One game per series slot. Prevents a race when both clients call
    -- ensureNextSeriesGame simultaneously from creating two rows for
    -- the same (series_id, game_number).
    constraint games_series_game_number_unique unique (series_id, game_number)
);

-- Enable Row Level Security
alter table games enable row level security;

-- Anyone authenticated can see waiting games
create policy "Anyone can view open games"
    on games for select
    using (status = 'waiting' or auth.uid() = home_user_id or auth.uid() = away_user_id);

-- Authenticated users can create games
create policy "Users can create games"
    on games for insert
    with check (auth.uid() = home_user_id);

-- Participants can update their game
create policy "Participants can update games"
    on games for update
    using (auth.uid() = home_user_id or auth.uid() = away_user_id);

-- Only creator can delete a waiting game
create policy "Creator can delete waiting games"
    on games for delete
    using (auth.uid() = home_user_id and status = 'waiting');

-- Auto-update timestamp
create trigger games_updated_at
    before update on games
    for each row
    execute function update_updated_at();

-- Enable Realtime on games table
alter publication supabase_realtime add table games;
