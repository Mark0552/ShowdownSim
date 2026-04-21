-- Migration: allow deleting a lineup even when games still reference it.
-- Run this ONCE in the Supabase SQL Editor on the live DB.
--
-- Before: deleting a lineup that's referenced by any row in `games`
--         (home_lineup_id or away_lineup_id) throws:
--   "update or delete on table \"lineups\" violates foreign key constraint
--    \"games_away_lineup_id_fkey\" on table \"games\""
--
-- After: the delete succeeds and the referencing game row just has its
--        home_lineup_id / away_lineup_id set to NULL. Safe because games
--        embed the full lineup data in state.homeLineup / state.awayLineup
--        when the game starts, so nulling the FK doesn't lose anything
--        the engine needs.

alter table games drop constraint games_home_lineup_id_fkey;
alter table games drop constraint games_away_lineup_id_fkey;

alter table games add constraint games_home_lineup_id_fkey
    foreign key (home_lineup_id) references lineups(id) on delete set null;
alter table games add constraint games_away_lineup_id_fkey
    foreign key (away_lineup_id) references lineups(id) on delete set null;
