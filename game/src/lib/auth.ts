import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

const FAKE_DOMAIN = '@showdown.game';

function usernameToEmail(username: string): string {
    return username.toLowerCase().trim() + FAKE_DOMAIN;
}

export function emailToUsername(email: string): string {
    return email.replace(FAKE_DOMAIN, '');
}

export async function signUp(username: string, password: string) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username: username.trim() },
        },
    });
    if (error) throw error;
    return data;
}

export async function signIn(username: string, password: string) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

// Deduplicated getUser — concurrent callers share one in-flight request
let _userPromise: Promise<User | null> | null = null;
let _userCache: User | null = null;
let _userCacheTime = 0;
const USER_CACHE_MS = 5000; // cache for 5 seconds

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
    return user.user_metadata?.username || emailToUsername(user.email || '');
}
