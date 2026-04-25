-- Migration: usernames lookup table for username-based login on top of
-- Supabase auth's email-based signInWithPassword.
--
-- Login flow:
--   1. User types "alice" + password
--   2. Client SELECTs email from usernames where username='alice'
--   3. Client calls signInWithPassword({ email, password })
--
-- Signup flow:
--   1. User types email, username, password
--   2. Client calls signUp({ email, password, options: { data: { username }}})
--   3. Trigger below mirrors username → usernames table
--   4. PK conflict on duplicate username throws → auth.users insert rolls
--      back → client surfaces "username already taken"
--
-- Run ONCE in the Supabase SQL Editor on the live DB. Then re-enable
-- email confirmation in Auth → Providers → Email settings.

create table if not exists usernames (
    username text primary key,
    user_id  uuid not null references auth.users(id) on delete cascade,
    email    text not null
);

-- Anon needs to read email-by-username before login (the lookup happens
-- pre-authentication). This permits username enumeration, which is the
-- standard tradeoff for username-based login.
alter table usernames enable row level security;

drop policy if exists "Anyone can read usernames" on usernames;
create policy "Anyone can read usernames"
    on usernames for select
    using (true);

-- Trigger: copy username from raw_user_meta_data into usernames on
-- auth.users insert. SECURITY DEFINER so it can write to a table that
-- anon can't write to directly. Lowercases for case-insensitive
-- uniqueness so "Alice" and "alice" can't both be claimed.
create or replace function copy_username_from_metadata()
returns trigger
language plpgsql
security definer
as $$
declare
    uname text;
begin
    uname := lower(trim(new.raw_user_meta_data ->> 'username'));
    if uname is null or uname = '' then
        return new;
    end if;
    insert into usernames(username, user_id, email)
    values (uname, new.id, lower(new.email));
    return new;
end;
$$;

drop trigger if exists users_after_insert_copy_username on auth.users;
create trigger users_after_insert_copy_username
    after insert on auth.users
    for each row
    execute function copy_username_from_metadata();
