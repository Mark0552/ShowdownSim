import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Auth surface for real-email + username login with OTP-code email
 * confirmation.
 *
 * Sign-up: collect (email, username, password) → supabase.auth.signUp().
 *   Supabase sends a 6-digit code to the email (template uses {{ .Token }}
 *   in the dashboard, not {{ .ConfirmationURL }}). The signup transaction
 *   also fires the on_auth_user_created trigger, which inserts a
 *   public.profiles row with the username — UNIQUE constraint there
 *   enforces global username uniqueness atomically.
 *
 * Sign-in: collect (identifier, password) where identifier is an email
 *   OR a username.
 *     - Identifier contains "@" → treat as email, pass directly.
 *     - Otherwise → call email_for_username RPC to resolve to an email,
 *       then sign in. RPC returns NULL if username not found; we surface
 *       a generic "Invalid login" error in that case to avoid leaking
 *       which usernames exist.
 *
 * OTP verification: signup and password-recovery share the verifyOtp API
 *   with different `type:` values.
 *
 * Password reset: resetPasswordForEmail → 6-digit code → verifyOtp(type:
 *   'recovery') returns a session → updateUser({ password }).
 */

export async function signUp(email: string, username: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
            data: { username: username.trim() },
        },
    });
    if (error) {
        // Username uniqueness violation comes back as a trigger error; the
        // server message contains "duplicate key value" + the index name.
        if (error.message.includes('profiles_username_lower_idx')
            || error.message.toLowerCase().includes('duplicate')
            && error.message.toLowerCase().includes('username')) {
            throw new Error('That username is already taken. Try another.');
        }
        if (error.message.toLowerCase().includes('already registered')) {
            throw new Error('An account with that email already exists. Try signing in.');
        }
        throw error;
    }
    // data.session is null here — user must confirm email before they're
    // signed in. The caller transitions to the OTP-entry view.
    return data;
}

export async function signIn(identifier: string, password: string) {
    const trimmed = identifier.trim();
    let email = trimmed;

    if (!trimmed.includes('@')) {
        // Username path: resolve via RPC.
        const { data: rpcEmail, error: rpcError } = await supabase.rpc('email_for_username', {
            p_username: trimmed,
        });
        if (rpcError) {
            // RPC failure is unusual — propagate the underlying error.
            throw new Error(`Login failed: ${rpcError.message}`);
        }
        if (!rpcEmail) {
            // No user with that username — surface the same error as
            // wrong-password so we don't leak which usernames exist.
            throw new Error('Invalid login. Check your email/username and password.');
        }
        email = rpcEmail;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
    });
    if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
            // Special-cased so the caller can route the user back to OTP
            // entry. Wrap in a known error code via the message prefix.
            const e = new Error('EMAIL_NOT_CONFIRMED');
            (e as any).email = email;
            throw e;
        }
        if (error.message.toLowerCase().includes('invalid login')) {
            throw new Error('Invalid login. Check your email/username and password.');
        }
        throw error;
    }
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * Verify a 6-digit signup OTP code. On success, the user is authenticated
 * and a session is set on the supabase client automatically.
 */
export async function verifyOtp(email: string, code: string) {
    const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'signup',
    });
    if (error) {
        if (error.message.toLowerCase().includes('expired')) {
            throw new Error('That code expired. Tap "Resend code" to get a new one.');
        }
        if (error.message.toLowerCase().includes('invalid')) {
            throw new Error('Invalid code. Check the 6 digits and try again.');
        }
        throw error;
    }
    return data;
}

export async function resendSignupOtp(email: string) {
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
    });
    if (error) throw error;
}

/**
 * Send a 6-digit password-reset code to the given email. Same OTP template
 * ({{ .Token }}) is used by Supabase for the "recovery" type.
 */
export async function resetPasswordForEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
}

/**
 * Verify a recovery OTP. On success, the user is in a "password change"
 * session — the caller must immediately call updatePassword() to finish
 * the reset. Without that follow-up, the session is still authenticated
 * but the user has not actually changed their password.
 */
export async function verifyRecoveryOtp(email: string, code: string) {
    const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'recovery',
    });
    if (error) {
        if (error.message.toLowerCase().includes('expired')) {
            throw new Error('That code expired. Request a new password reset.');
        }
        if (error.message.toLowerCase().includes('invalid')) {
            throw new Error('Invalid code. Check the 6 digits and try again.');
        }
        throw error;
    }
    return data;
}

export async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
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
    return user.user_metadata?.username || user.email || '';
}

export function getEmail(user: User): string {
    return user.email || '';
}
