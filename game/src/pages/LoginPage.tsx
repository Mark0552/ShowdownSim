import { useEffect, useState } from 'react';
import {
    signIn, signUp, verifyOtp, resendSignupOtp,
    resetPasswordForEmail, verifyRecoveryOtp, updatePassword,
} from '../lib/auth';
import './LoginPage.css';

interface Props {
    onLogin: () => void;
}

type View = 'signin' | 'signup' | 'verify-otp' | 'forgot' | 'reset-verify';

/** Persisted across page reload so a user who closes the browser mid-OTP
 *  can come back and finish. Cleared on successful verification. */
const PENDING_VERIFY_KEY = 'showdown_pending_verify_email';

export default function LoginPage({ onLogin }: Props) {
    // Resume into OTP entry if a signup is mid-flow from a previous visit.
    const initialView: View = (() => {
        if (typeof window === 'undefined') return 'signin';
        return localStorage.getItem(PENDING_VERIFY_KEY) ? 'verify-otp' : 'signin';
    })();
    const [view, setView] = useState<View>(initialView);

    // Shared fields. Reset on view changes via switchView() so leftover
    // state from a previous flow doesn't leak.
    const [identifier, setIdentifier] = useState('');   // signin only — email or username
    const [email, setEmail] = useState(() => localStorage.getItem(PENDING_VERIFY_KEY) || '');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otpCode, setOtpCode] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    // Clear transient feedback whenever the user moves between views.
    useEffect(() => { setError(''); setInfo(''); }, [view]);

    const switchView = (next: View) => {
        // Don't blow away `email` when transitioning into verify-otp from
        // signup or forgot — those flows depend on it. Same for username
        // when going from signup → verify-otp (we don't reset username
        // either since the user might want to back out and try again).
        if (next === 'signin' || next === 'signup' || next === 'forgot') {
            setOtpCode('');
            setConfirmPassword('');
            if (next !== 'signup') setUsername('');
            if (next === 'signin') setEmail('');
            setPassword('');
        }
        setView(next);
    };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!identifier.trim() || !password) {
            setError('Enter your email/username and password.');
            return;
        }
        setLoading(true);
        try {
            await signIn(identifier, password);
            onLogin();
        } catch (err: any) {
            if (err.message === 'EMAIL_NOT_CONFIRMED') {
                // Route user back to OTP entry. signIn attached the email
                // to err so we can prefill it.
                setEmail(err.email || identifier);
                localStorage.setItem(PENDING_VERIFY_KEY, err.email || identifier);
                setInfo('Your email is not confirmed yet. Enter the 6-digit code we sent you.');
                setView('verify-otp');
                return;
            }
            setError(err.message || 'Sign in failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !username.trim() || !password) {
            setError('Fill in all fields.');
            return;
        }
        // Loose email shape check — Supabase will fully validate server-side.
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
            setError('Enter a valid email address.');
            return;
        }
        if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username.trim())) {
            setError('Username must be 3-20 characters. Letters, numbers, periods, hyphens, and underscores only.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await signUp(email, username, password);
            localStorage.setItem(PENDING_VERIFY_KEY, email.trim().toLowerCase());
            setEmail(email.trim().toLowerCase());
            setInfo("Account created. Check your email for a 6-digit code.");
            setView('verify-otp');
        } catch (err: any) {
            setError(err.message || 'Sign up failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!/^\d{6}$/.test(otpCode.trim())) {
            setError('Enter the 6-digit code from your email.');
            return;
        }
        setLoading(true);
        try {
            await verifyOtp(email, otpCode);
            localStorage.removeItem(PENDING_VERIFY_KEY);
            onLogin();
        } catch (err: any) {
            setError(err.message || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        setInfo('');
        setLoading(true);
        try {
            await resendSignupOtp(email);
            setInfo('New code sent. Check your email.');
        } catch (err: any) {
            setError(err.message || 'Could not resend code.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgot = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
            setError('Enter the email address for your account.');
            return;
        }
        setLoading(true);
        try {
            await resetPasswordForEmail(email);
            setInfo("If that email is registered, a 6-digit reset code is on its way.");
            setView('reset-verify');
        } catch (err: any) {
            setError(err.message || 'Could not send reset code.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!/^\d{6}$/.test(otpCode.trim())) {
            setError('Enter the 6-digit code from your email.');
            return;
        }
        if (password.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await verifyRecoveryOtp(email, otpCode);
            // Recovery OTP verification leaves us in an authed session; we
            // must follow up with the password update or the reset is a
            // no-op.
            await updatePassword(password);
            onLogin();
        } catch (err: any) {
            setError(err.message || 'Reset failed.');
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------------- views

    const titleMap: Record<View, string> = {
        signin: 'Sign In',
        signup: 'Create Account',
        'verify-otp': 'Verify Your Email',
        forgot: 'Reset Password',
        'reset-verify': 'New Password',
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <h1>MLB Showdown</h1>
                <p className="login-subtitle">{titleMap[view]}</p>

                {view === 'signin' && (
                    <form onSubmit={handleSignIn}>
                        <input
                            type="text"
                            placeholder="Email or username"
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            required
                            autoComplete="username"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                        {error && <div className="login-error">{error}</div>}
                        {info && <div className="login-info">{info}</div>}
                        <button className="login-btn" type="submit" disabled={loading}>
                            {loading ? '...' : 'Sign In'}
                        </button>
                        <div className="login-links">
                            <button type="button" className="login-link" onClick={() => switchView('forgot')}>
                                Forgot password?
                            </button>
                            <button type="button" className="login-link" onClick={() => switchView('signup')}>
                                Create account
                            </button>
                        </div>
                    </form>
                )}

                {view === 'signup' && (
                    <form onSubmit={handleSignUp}>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                        <input
                            type="password"
                            placeholder="Password (min 8 characters)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        <input
                            type="password"
                            placeholder="Confirm password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        {error && <div className="login-error">{error}</div>}
                        <button className="login-btn" type="submit" disabled={loading}>
                            {loading ? '...' : 'Create Account'}
                        </button>
                        <button type="button" className="login-toggle" onClick={() => switchView('signin')}>
                            Already have an account? Sign in
                        </button>
                    </form>
                )}

                {view === 'verify-otp' && (
                    <form onSubmit={handleVerifyOtp}>
                        <div className="login-success-card">
                            <div className="login-success-icon">&#9993;</div>
                            <p>We sent a 6-digit code to</p>
                            <p className="login-success-email">{email}</p>
                            <p>Enter it below to confirm your email and finish signing up.</p>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            placeholder="6-digit code"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            required
                            autoComplete="one-time-code"
                            maxLength={6}
                        />
                        {error && <div className="login-error">{error}</div>}
                        {info && <div className="login-info">{info}</div>}
                        <button className="login-btn" type="submit" disabled={loading}>
                            {loading ? '...' : 'Verify & Sign In'}
                        </button>
                        <div className="login-links">
                            <button type="button" className="login-link" onClick={handleResendOtp} disabled={loading}>
                                Resend code
                            </button>
                            <button type="button" className="login-link" onClick={() => {
                                localStorage.removeItem(PENDING_VERIFY_KEY);
                                switchView('signin');
                            }}>
                                Back to sign in
                            </button>
                        </div>
                    </form>
                )}

                {view === 'forgot' && (
                    <form onSubmit={handleForgot}>
                        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '0 0 12px' }}>
                            Enter the email address for your account. We'll send you a 6-digit reset code.
                        </p>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                        {error && <div className="login-error">{error}</div>}
                        <button className="login-btn" type="submit" disabled={loading}>
                            {loading ? '...' : 'Send Reset Code'}
                        </button>
                        <button type="button" className="login-toggle" onClick={() => switchView('signin')}>
                            Back to sign in
                        </button>
                    </form>
                )}

                {view === 'reset-verify' && (
                    <form onSubmit={handleResetVerify}>
                        <div className="login-success-card">
                            <div className="login-success-icon">&#9993;</div>
                            <p>If <span className="login-success-email">{email}</span> is registered, a 6-digit reset code is on its way.</p>
                            <p>Enter the code and pick a new password.</p>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            placeholder="6-digit code"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            required
                            autoComplete="one-time-code"
                            maxLength={6}
                        />
                        <input
                            type="password"
                            placeholder="New password (min 8 characters)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        <input
                            type="password"
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        {error && <div className="login-error">{error}</div>}
                        {info && <div className="login-info">{info}</div>}
                        <button className="login-btn" type="submit" disabled={loading}>
                            {loading ? '...' : 'Set New Password & Sign In'}
                        </button>
                        <button type="button" className="login-toggle" onClick={() => switchView('signin')}>
                            Back to sign in
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
