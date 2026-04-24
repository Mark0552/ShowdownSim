-- Migration: replace pending_action.readyNext JSON with dedicated boolean
-- columns on the games table.
--
-- Why: the JSON approach required a Postgres RPC (set_ready_for_next_game)
-- that ran SECURITY INVOKER. If RLS filtered out the row at UPDATE time
-- (e.g. user appears as participant but RLS context says otherwise), the
-- RPC silently succeeded with 0 rows affected — Supabase reports no error,
-- so the client thought the write landed even though the DB was unchanged.
-- The next poll would then read pending_action.readyNext.{role} as
-- false/null and revert the optimistic UI flip ("ready stays for a little
-- longer, then bounces back").
--
-- Direct boolean columns sidestep this entirely: each role writes only
-- its own column via plain UPDATE, .select() returns the affected row(s),
-- and the client throws on 0-row updates so the rollback fires loudly
-- instead of silently.
--
-- Run ONCE in the Supabase SQL Editor on the live DB.

alter table games add column if not exists home_ready_next boolean default false;
alter table games add column if not exists away_ready_next boolean default false;

-- The old RPC and the pending_action column itself can stay around
-- harmlessly; nothing reads them after this migration ships. Drop later
-- if you want to clean up:
--   drop function if exists set_ready_for_next_game(uuid, text, boolean);
--   alter table games drop column if exists pending_action;
