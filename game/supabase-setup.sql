-- MLB Showdown Database Setup
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Lineups table: stores saved team lineups per user
create table if not exists lineups (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    data jsonb not null,  -- the full team object (slots, rules, lineupOrder)
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table lineups enable row level security;

-- Users can only see their own lineups
create policy "Users can view own lineups"
    on lineups for select
    using (auth.uid() = user_id);

-- Users can insert their own lineups
create policy "Users can create lineups"
    on lineups for insert
    with check (auth.uid() = user_id);

-- Users can update their own lineups
create policy "Users can update own lineups"
    on lineups for update
    using (auth.uid() = user_id);

-- Users can delete their own lineups
create policy "Users can delete own lineups"
    on lineups for delete
    using (auth.uid() = user_id);

-- Auto-update the updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger lineups_updated_at
    before update on lineups
    for each row
    execute function update_updated_at();
