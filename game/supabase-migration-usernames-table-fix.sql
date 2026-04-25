-- Fix: trigger fired from auth.users couldn't resolve `usernames` because
-- the calling session's search_path didn't include public. Schema-qualify
-- the insert and pin search_path on the function so signup stops 500ing
-- with "Database error saving new user".
--
-- Run ONCE in the Supabase SQL Editor.

create or replace function public.copy_username_from_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    uname text;
begin
    uname := lower(trim(new.raw_user_meta_data ->> 'username'));
    if uname is null or uname = '' then
        return new;
    end if;
    insert into public.usernames(username, user_id, email)
    values (uname, new.id, lower(new.email));
    return new;
end;
$$;

-- Recreate the trigger so it points at the (now-fixed) function. Dropping
-- and recreating is safe because the trigger has no per-row state.
drop trigger if exists users_after_insert_copy_username on auth.users;
create trigger users_after_insert_copy_username
    after insert on auth.users
    for each row
    execute function public.copy_username_from_metadata();
