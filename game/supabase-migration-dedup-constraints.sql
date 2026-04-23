-- Migration: data-integrity constraints surfaced in the Apr 2026 audit.
-- Run ONCE in the Supabase SQL Editor on the live DB.
--
-- 1) Unique(game_id, user_id, card_id) on game_player_stats — prevents
--    duplicate stat rows when both players' clients save at end-of-game
--    (previously nothing blocked a second INSERT by the other player
--    or by a client reconnecting after game-over).
-- 2) Unique(series_id, game_number) on games — prevents two rows from
--    being created for the same series slot when both clients race to
--    call ensureNextSeriesGame after both ready-up.
-- 3) RPC set_ready_for_next_game(game_id, role, ready) — atomic
--    read-modify-write of pending_action.readyNext[role] via
--    jsonb_set, replacing the client-side read→patch→write pattern
--    that could lose updates when both players clicked Ready at the
--    same time. Runs as SECURITY INVOKER so existing participant RLS
--    on games still applies.

-- 1. Dedup stats
alter table game_player_stats
    add constraint game_player_stats_game_user_card_unique
    unique (game_id, user_id, card_id);

-- 2. One game per series slot
alter table games
    add constraint games_series_game_number_unique
    unique (series_id, game_number);

-- 3. Atomic readyNext toggle
create or replace function set_ready_for_next_game(
    p_game_id uuid,
    p_role text,
    p_ready boolean
)
returns void
language plpgsql
security invoker
as $$
begin
    update games
    set pending_action = jsonb_set(
        coalesce(pending_action, '{}'::jsonb),
        array['readyNext', p_role],
        to_jsonb(p_ready),
        true
    )
    where id = p_game_id;
end;
$$;
