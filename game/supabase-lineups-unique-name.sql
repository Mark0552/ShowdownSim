-- Enforce unique lineup names per user (case-insensitive).
-- "My Team" and "my team" collide; "My Team" and "My Other Team" don't.
-- A unique INDEX (not a CONSTRAINT) is used because we're indexing the
-- expression LOWER(name), which constraints can't do directly.
--
-- Pre-check: confirmed zero duplicates in the live DB before this runs.
-- If duplicates ever appear, this migration fails at the index creation
-- and the DB stays in a known-good state.

CREATE UNIQUE INDEX IF NOT EXISTS lineups_user_name_unique
    ON public.lineups (user_id, LOWER(name));

-- Post-check (run manually):
-- \d public.lineups   -- confirm the new index
-- SELECT user_id, name FROM public.lineups ORDER BY user_id, name;
