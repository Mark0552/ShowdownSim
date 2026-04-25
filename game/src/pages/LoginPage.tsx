import { useState, useEffect } from 'react';
import {
    signIn, signUp,
    requestPasswordReset, updatePassword, lookupUsernameByEmail,
} from '../lib/auth';
import './LoginPage.css';

interface Props {
    onLogin: () => void;
    /** True when Supabase fired PASSWORD_RECOVERY — App.tsx pins the page
     *  to LoginPage and we open straight into the reset-password form. */
    recoveryMode?: boolean;
}

type Mode = 'signin' | 'signup' | 'forgot-password' | 'forgot-username' | 'reset-password';

export default function LoginPage({ onLogin, recoveryMode }: Props) {
    const [mode, setMode] = useState<Mode>(recoveryMode ? 'reset-password' : 'signin');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (recoveryMode) setMode('reset-password');
    }, [recoveryMode]);

    const switchMode = (next: Mode, opts?: { keepInfo?: boolean }) => {
        setMode(next);
        setError('');
        if (!opts?.keepInfo) setInfo('');
        setPassword('');
        setConfirmPassword('');
        if (next !== 'signup') setEmail('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfo('');

        try {
            if (mode === 'signin') {
                if (!username.trim()) { setError('Username is required'); return; }
                setLoading(true);
                await signIn(username, password);
                onLogin();
            } else if (mode === 'signup') {
                if (!username.trim()) { setError('Username is required'); return; }
                if (!email.trim()) { setError('Email is required'); return; }
                if (password !== confirmPassword) { setError('Passwords do not match'); return; }
                if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
                setLoading(true);
                await signUp(username, email, password);
                setInfo('Account created — check your email to confirm, then sign in.');
                switchMode('signin', { keepInfo: true });
            } else if (mode === 'forgot-password') {
                if (!email.trim()) { setError('Email is required'); return; }
                setLoading(true);
                await requestPasswordReset(email);
                setInfo('If an account exists for that email, a reset link is on its way.');
            } else if (mode === 'forgot-username') {
                if (!email.trim()) { setError('Email is required'); return; }
                setLoading(true);
                const found = await lookupUsernameByEmail(email);
                if (found) setInfo(`Your username is: ${found}`);
                else setError('No account found for that email.');
            } else if (mode === 'reset-password') {
                if (password !== confirmPassword) { setError('Passwords do not match'); return; }
                if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
                setLoading(true);
                await updatePassword(password);
                setInfo('Password updated.');
                onLogin();
            }
        } catch (err: any) {
            const msg = err.message || 'Authentication failed';
            if (msg.includes('Invalid login')) setError('Invalid username or password');
            else if (/already registered|already exists|already taken/i.test(msg)) setError(msg);
            else if (/email not confirmed/i.test(msg)) setError('Please confirm your email before signing in.');
            else setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const subtitle = {
        signin: 'Sign In',
        signup: 'Create Account',
        'forgot-password': 'Reset Password',
        'forgot-username': 'Recover Username',
        'reset-password': 'Choose a New Password',
    }[mode];

    const submitLabel = {
        signin: 'Sign In',
        signup: 'Create Account',
        'forgot-password': 'Send Reset Link',
        'forgot-username': 'Look Up Username',
        'reset-password': 'Update Password',
    }[mode];

    return (
        <div className="login-page">
            <div className="login-card">
                <h1>MLB Showdown</h1>
                <p className="login-subtitle">{subtitle}</p>

                <form onSubmit={handleSubmit}>
                    {(mode === 'signin' || mode === 'signup') && (
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    )}
                    {(mode === 'signup' || mode === 'forgot-password' || mode === 'forgot-username') && (
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    )}
                    {(mode === 'signin' || mode === 'signup' || mode === 'reset-password') && (
                        <input
                            type="password"
                            placeholder={mode === 'reset-password' ? 'New password' : 'Password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        />
                    )}
                    {(mode === 'signup' || mode === 'reset-password') && (
                        <input
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                        />
                    )}

                    {error && <div className="login-error">{error}</div>}
                    {info && <div className="login-info">{info}</div>}

                    <button className="login-btn" type="submit" disabled={loading}>
                        {loading ? '...' : submitLabel}
                    </button>
                </form>

                {mode === 'signin' && (
                    <>
                        <button className="login-toggle" onClick={() => switchMode('signup')}>
                            Don't have an account? Sign Up
                        </button>
                        <div className="login-links">
                            <button className="login-link" onClick={() => switchMode('forgot-password')}>
                                Forgot password?
                            </button>
                            <button className="login-link" onClick={() => switchMode('forgot-username')}>
                                Forgot username?
                            </button>
                        </div>
                    </>
                )}
                {mode === 'signup' && (
                    <button className="login-toggle" onClick={() => switchMode('signin')}>
                        Already have an account? Sign In
                    </button>
                )}
                {(mode === 'forgot-password' || mode === 'forgot-username') && (
                    <button className="login-toggle" onClick={() => switchMode('signin')}>
                        Back to Sign In
                    </button>
                )}
            </div>
        </div>
    );
}
