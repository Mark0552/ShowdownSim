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

export async function getUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export function getUsername(user: User): string {
    return user.user_metadata?.username || emailToUsername(user.email || '');
}
