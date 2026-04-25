import { useState } from 'react';
import { signIn, signUp } from '../lib/auth';
import './LoginPage.css';

interface Props {
    onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username.trim()) {
            setError('Username is required');
            return;
        }

        if (isSignUp) {
            // Username doubles as the local part of a fake email
            // (username@showdown.game) for Supabase auth, so keep it to
            // email-safe characters. Spaces and most punctuation break it.
            if (!/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
                setError('Username can only contain letters, numbers, periods, hyphens, and underscores.');
                return;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
            }
            if (password.length < 6) {
                setError('Password must be at least 6 characters');
                return;
            }
        }

        setLoading(true);
        try {
            if (isSignUp) {
                await signUp(username, password);
                // No confirmation needed — sign in immediately
                await signIn(username, password);
                onLogin();
            } else {
                await signIn(username, password);
                onLogin();
            }
        } catch (err: any) {
            const msg = err.message || 'Authentication failed';
            if (msg.includes('Invalid login')) {
                setError('Invalid username or password');
            } else if (msg.includes('already registered')) {
                setError('Username already taken');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <h1>MLB Showdown</h1>
                <p className="login-subtitle">{isSignUp ? 'Create Account' : 'Sign In'}</p>

                <form onSubmit={handleSubmit}>
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
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    />
                    {isSignUp && (
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

                    <button className="login-btn" type="submit" disabled={loading}>
                        {loading ? '...' : isSignUp ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <button className="login-toggle" onClick={() => { setIsSignUp(!isSignUp); setError(''); setConfirmPassword(''); }}>
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    );
}
