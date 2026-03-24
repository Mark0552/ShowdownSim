import { useState } from 'react';
import { signIn, signUp } from '../lib/auth';
import './LoginPage.css';

interface Props {
    onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [signUpSuccess, setSignUpSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignUp) {
                await signUp(email, password);
                setSignUpSuccess(true);
            } else {
                await signIn(email, password);
                onLogin();
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    if (signUpSuccess) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <h1>MLB Showdown</h1>
                    <div className="login-success">
                        Account created! Check your email to confirm, then sign in.
                    </div>
                    <button className="login-btn" onClick={() => { setIsSignUp(false); setSignUpSuccess(false); }}>
                        Back to Sign In
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <h1>MLB Showdown</h1>
                <p className="login-subtitle">{isSignUp ? 'Create Account' : 'Sign In'}</p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />

                    {error && <div className="login-error">{error}</div>}

                    <button className="login-btn" type="submit" disabled={loading}>
                        {loading ? '...' : isSignUp ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <button className="login-toggle" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    );
}
