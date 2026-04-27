-- Draft mode support.
--
-- Adds a `mode` column to both `games` and `series` so the lobby can mark
-- a game/series as 'lineup' (existing flow: each player picks a saved lineup)
-- vs 'draft' (new flow: snake-draft players from the full card pool).
--
-- Also documents the new 'drafting' value for `games.status`. Status is a
-- plain text column, no enum constraint, so no DDL change is needed there.
--
-- Status flow for draft games:
--   waiting   --> drafting --> active --> finished
-- (lineup games skip 'drafting' and go waiting -> active directly.)
--
-- Run ONCE in the Supabase SQL Editor.

alter table games  add column if not exists mode text not null default 'lineup';
alter table series add column if not exists mode text not null default 'lineup';

-- Defensive constraint: only the two known values are valid.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'games_mode_check'
    ) then
        alter table games  add constraint games_mode_check  check (mode in ('lineup', 'draft'));
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'series_mode_check'
    ) then
        alter table series add constraint series_mode_check check (mode in ('lineup', 'draft'));
    end if;
end $$;

-- For draft games, home_lineup_id / away_lineup_id stay null until the
-- post-draft lineup-builder screen produces a saved Team object. The
-- existing FK migration (supabase-migration-lineup-fk.sql) already allows
-- nulls, so nothing to change there.
