-- =============================================================================
-- Migration: real-email + username auth with OTP-code email confirmation
-- =============================================================================
-- This migration:
--   1. WIPES all user data (auth.users + cascaded public.* rows).
--   2. Renames the misnamed home_user_email / away_user_email columns on
--      games and series to home_username / away_username (they always stored
--      usernames despite the name).
--   3. Creates public.profiles to enforce username uniqueness and let the
--      lobby read usernames without needing to read auth.users.
--   4. Adds an on-signup trigger that populates profiles.username from the
--      auth.users metadata. The trigger runs inside the signup transaction,
--      so a duplicate-username INSERT rolls back the whole signup (atomic).
--   5. Adds the email_for_username RPC that the client uses to resolve a
--      typed-in username to its email before calling signInWithPassword.
--
-- Apply order is important. Do NOT run this against the live DB until the
-- frontend that uses the new column names is deployed. See the rollout
-- notes in CLAUDE.md.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. WIPE EVERYTHING
-- -----------------------------------------------------------------------------
-- Deleting auth.users cascades to lineups, games, series, game_player_stats
-- via the existing ON DELETE CASCADE / FK constraints. Explicit DELETEs on
-- the public tables first are belt-and-suspenders + give us clean status
-- output for debugging.

DELETE FROM public.game_player_stats;
DELETE FROM public.games;
DELETE FROM public.series;
DELETE FROM public.lineups;
DELETE FROM auth.users;

-- -----------------------------------------------------------------------------
-- 2. RENAME MISNAMED COLUMNS
-- -----------------------------------------------------------------------------
-- The _user_email columns on games and series always stored usernames (set
-- via getUsername(user), which strips the @showdown.game suffix). Real
-- emails are coming back, so the misnaming becomes actively confusing.
-- Rename to *_username for accuracy.

ALTER TABLE public.games  RENAME COLUMN home_user_email TO home_username;
ALTER TABLE public.games  RENAME COLUMN away_user_email TO away_username;
ALTER TABLE public.series RENAME COLUMN home_user_email TO home_username;
ALTER TABLE public.series RENAME COLUMN away_user_email TO away_username;

-- -----------------------------------------------------------------------------
-- 3. PROFILES TABLE
-- -----------------------------------------------------------------------------
-- Mirrors auth.users with a username for global uniqueness + lobby reads.
-- We don't mirror email here; the email_for_username RPC reads it directly
-- from auth.users via SECURITY DEFINER, so we avoid a sync-drift problem
-- if a user ever changes their email later.

CREATE TABLE public.profiles (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username   TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any profile row (so the lobby + game UI
-- can show opponent usernames). No SELECT for anon — anon doesn't need to
-- read profiles, only call the RPC.
CREATE POLICY "Authed users read all profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Users may update their OWN row (e.g. future "change username" feature).
-- Not enabled in the app yet but ready for it.
CREATE POLICY "Users update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- No INSERT/DELETE policies — the trigger handles INSERT, and we never want
-- a user deleting their own profile row (the auth.users CASCADE handles it
-- if the account is deleted).

-- Index on lowercased username for case-insensitive uniqueness lookups
-- from the email_for_username RPC.
CREATE UNIQUE INDEX profiles_username_lower_idx
    ON public.profiles (LOWER(username));

-- -----------------------------------------------------------------------------
-- 4. ON-SIGNUP TRIGGER: copy username from metadata into profiles
-- -----------------------------------------------------------------------------
-- signUp() passes the username via options.data, which Supabase stores in
-- auth.users.raw_user_meta_data. This trigger copies it into the profiles
-- table so we get a UNIQUE constraint we can rely on. If the username is
-- taken, this INSERT fails — and because the trigger runs in the same
-- transaction as the auth.users INSERT, the whole signup rolls back.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- raw_user_meta_data is JSONB; ->> coerces to text. Skip the profile
    -- insert silently when username is missing — this happens when
    -- admin uses Supabase Dashboard's "Invite user" or "Add user"
    -- features (which don't pass user_metadata). The auth.users row is
    -- still created; the profile row just doesn't exist. Such users
    -- can complete onboarding later. App signups always pass a
    -- username, so they always get a profile.
    --
    -- Originally this raised an exception, which broke admin-invite
    -- entirely AND surfaced as opaque "unexpected_failure" 500s on app
    -- signup if anything stripped the user_metadata in transit.
    IF NEW.raw_user_meta_data ->> 'username' IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.profiles (user_id, username)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'username');

    RETURN NEW;
END;
$$;

-- The trigger fires AFTER INSERT so NEW.id is populated. AFTER vs BEFORE
-- doesn't change the atomicity here — both run inside the same transaction
-- as the original INSERT and a RAISE EXCEPTION rolls everything back.
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. EMAIL-FOR-USERNAME RPC
-- -----------------------------------------------------------------------------
-- The client uses this to translate a typed-in username to its associated
-- email before calling supabase.auth.signInWithPassword(email, password).
-- It's callable by anon (you have to be able to log in before you're
-- authenticated) and by authenticated.
--
-- Trade-off: this leaks the email associated with any known username. The
-- attacker can already enumerate usernames from waiting-game rows (which
-- expose home_username via RLS), so this RPC turns "username known" into
-- "email known" one lookup at a time. Mitigations:
--   - Always return a generic "Invalid login" error on the client, never
--     "username not found" vs "wrong password".
--   - Rate-limit at the Supabase project level (default IP-based limits
--     apply).
-- We accept the trade-off; without it, "login with username" is impossible
-- without something more elaborate (Edge Function + admin API).

CREATE OR REPLACE FUNCTION public.email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    found_email TEXT;
BEGIN
    SELECT u.email
    INTO found_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE LOWER(p.username) = LOWER(p_username);
    -- found_email is NULL if no match — client interprets that as "no such
    -- user" and shows the generic "Invalid login" error.
    RETURN found_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_for_username(TEXT) TO anon, authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION SANITY CHECKS (run manually after applying)
-- -----------------------------------------------------------------------------
-- SELECT count(*) FROM auth.users;                          -- expect 0
-- SELECT count(*) FROM public.lineups;                      -- expect 0
-- SELECT count(*) FROM public.games;                        -- expect 0
-- SELECT count(*) FROM public.series;                       -- expect 0
-- SELECT count(*) FROM public.game_player_stats;            -- expect 0
-- SELECT count(*) FROM public.profiles;                     -- expect 0
-- \d public.games   -- confirm home_username / away_username columns exist
-- \d public.series  -- same
-- \d public.profiles -- confirm structure
-- SELECT public.email_for_username('nobody');               -- expect NULL
