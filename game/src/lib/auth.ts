import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Sign up with email + username + password. The username is mirrored into
 * the public `usernames` table by a Postgres trigger on auth.users insert,
 * which enforces case-insensitive uniqueness. Email confirmation (managed
 * via Supabase Dashboard) gates first sign-in.
 */
export async function signUp(username: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
            data: { username: username.trim() },
        },
    });
    if (error) {
        // The trigger throws a unique-violation when the username PK
        // conflicts. Supabase wraps it as a 500 with the Postgres message
        // bubbling through; surface a friendlier label.
        if (/usernames_pkey|duplicate key|already exists/i.test(error.message)) {
            throw new Error('Username already taken');
        }
        throw error;
    }
    return data;
}

/**
 * Sign in by username — looks up the email first, then defers to
 * signInWithPassword. Two round trips, but it lets us keep username as
 * the public-facing identifier while Supabase auth requires email.
 */
export async function signIn(username: string, password: string) {
    const lower = username.toLowerCase().trim();
    const { data: row, error: lookupError } = await supabase
        .from('usernames')
        .select('email')
        .eq('username', lower)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (!row) throw new Error('Invalid login credentials');

    const { data, error } = await supabase.auth.signInWithPassword({
        email: row.email,
        password,
    });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

let _userPromise: Promise<User | null> | null = null;
let _userCache: User | null = null;
let _userCacheTime = 0;
const USER_CACHE_MS = 5000;

export async function getUser(): Promise<User | null> {
    const now = Date.now();
    if (_userCache && now - _userCacheTime < USER_CACHE_MS) return _userCache;
    if (_userPromise) return _userPromise;
    _userPromise = supabase.auth.getUser()
        .then(({ data: { user } }) => {
            _userCache = user;
            _userCacheTime = Date.now();
            _userPromise = null;
            return user;
        })
        .catch((err) => {
            _userPromise = null;
            throw err;
        });
    return _userPromise;
}

export function getUsername(user: User): string {
    // user_metadata.username is set at signup. Fall back to the email
    // local-part for safety, though every account created post-migration
    // will have the metadata field.
    return user.user_metadata?.username || (user.email?.split('@')[0] || 'user');
}
