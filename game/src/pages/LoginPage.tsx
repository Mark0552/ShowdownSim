import { useState } from 'react';
import { signIn, signUp } from '../lib/auth';
import './LoginPage.css';

interface Props {
    onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfo('');

        if (!username.trim()) {
            setError('Username is required');
            return;
        }

        if (isSignUp) {
            if (!email.trim()) {
                setError('Email is required');
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
                await signUp(username, email, password);
                setInfo('Check your email to confirm your account, then sign in.');
                setIsSignUp(false);
                setPassword('');
                setConfirmPassword('');
                setEmail('');
            } else {
                await signIn(username, password);
                onLogin();
            }
        } catch (err: any) {
            const msg = err.message || 'Authentication failed';
            if (msg.includes('Invalid login')) {
                setError('Invalid username or password');
            } else if (/already registered|already exists|already taken/i.test(msg)) {
                setError(msg);
            } else if (/email not confirmed/i.test(msg)) {
                setError('Please confirm your email before signing in.');
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
                    {isSignUp && (
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    )}
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
                    {info && <div className="login-info">{info}</div>}

                    <button className="login-btn" type="submit" disabled={loading}>
                        {loading ? '...' : isSignUp ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <button className="login-toggle" onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError('');
                    setInfo('');
                    setConfirmPassword('');
                    setEmail('');
                }}>
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    );
}
