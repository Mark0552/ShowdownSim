import { signOut } from '../lib/auth';
import './MainMenu.css';

interface Props {
    username: string;
    onNavigate: (page: string) => void;
    onLogout: () => void;
}

export default function MainMenu({ username, onNavigate, onLogout }: Props) {
    const handleLogout = async () => {
        await signOut();
        onLogout();
    };

    return (
        <div className="main-menu">
            <div className="menu-card">
                <h1>MLB Showdown</h1>
                <p className="menu-user">{username}</p>

                <div className="menu-buttons">
                    <button className="menu-btn" onClick={() => onNavigate('rules')}>
                        <span className="menu-btn-icon">&#167;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Showdown Rules</span>
                            <span className="menu-btn-desc">New here? Start here. How to play, card reference, and full rule details</span>
                        </span>
                    </button>

                    <button className="menu-btn" onClick={() => onNavigate('lineups')}>
                        <span className="menu-btn-icon">&#9776;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Lineups</span>
                            <span className="menu-btn-desc">Build and manage your team rosters</span>
                        </span>
                    </button>

                    <button className="menu-btn" onClick={() => onNavigate('lobby')}>
                        <span className="menu-btn-icon">&#9878;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Play Game</span>
                            <span className="menu-btn-desc">Create or join a game</span>
                        </span>
                    </button>

                    <button className="menu-btn" onClick={() => onNavigate('stats')}>
                        <span className="menu-btn-icon">&#9733;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Stats</span>
                            <span className="menu-btn-desc">View game history and career statistics</span>
                        </span>
                    </button>

                    <button className="menu-btn" onClick={() => onNavigate('simulation')}>
                        <span className="menu-btn-icon">&#9881;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Simulation</span>
                            <span className="menu-btn-desc">Run matchup simulations and export the full report</span>
                        </span>
                    </button>

                    <button className="menu-btn" onClick={() => onNavigate('pricing')}>
                        <span className="menu-btn-icon">&#36;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Pricing Analysis</span>
                            <span className="menu-btn-desc">Reverse-engineer the point formula and find under/overpriced cards</span>
                        </span>
                    </button>

                    {/* Standalone HTML viewer in game/public/. Opens in a
                        new tab so the user can keep the app session alive
                        and refer to cards while playing. BASE_URL resolves
                        to the GH Pages prefix in production (/ShowdownSim/)
                        and '/' in dev. */}
                    <button
                        className="menu-btn"
                        onClick={() => window.open(`${import.meta.env.BASE_URL || '/'}strategy-cards.html`, '_blank', 'noopener')}
                    >
                        <span className="menu-btn-icon">&#9827;</span>
                        <span className="menu-btn-text">
                            <span className="menu-btn-title">Strategy Cards</span>
                            <span className="menu-btn-desc">For Expert rules (not supported... yet)</span>
                        </span>
                    </button>
                </div>

                <button className="menu-logout" onClick={handleLogout}>Sign Out</button>
            </div>
        </div>
    );
}
