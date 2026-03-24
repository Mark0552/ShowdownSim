import { signOut } from '../lib/auth';
import './MainMenu.css';

interface Props {
    userEmail: string;
    onNavigate: (page: string) => void;
    onLogout: () => void;
}

export default function MainMenu({ userEmail, onNavigate, onLogout }: Props) {
    const handleLogout = async () => {
        await signOut();
        onLogout();
    };

    return (
        <div className="main-menu">
            <div className="menu-card">
                <h1>MLB Showdown</h1>
                <p className="menu-user">{userEmail}</p>

                <div className="menu-buttons">
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
                </div>

                <button className="menu-logout" onClick={handleLogout}>Sign Out</button>
            </div>
        </div>
    );
}
