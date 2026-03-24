import type { BaseState, GameState, TeamState } from '../../types/gameState';
import './Diamond.css';

interface Props {
    bases: BaseState;
    outs: number;
    battingTeam: TeamState;
}

export default function Diamond({ bases, outs, battingTeam }: Props) {
    const getRunnerName = (cardId: string | null) => {
        if (!cardId) return null;
        const player = battingTeam.lineup.find(p => p.cardId === cardId);
        return player?.card.name.split(' ').pop() || '?';
    };

    return (
        <div className="diamond">
            <svg viewBox="0 0 300 260" className="diamond-svg">
                {/* Grass */}
                <polygon points="150,30 270,150 150,270 30,150" fill="#2d5a27" stroke="#3a7a32" strokeWidth="2" />

                {/* Base paths */}
                <line x1="150" y1="230" x2="240" y2="140" stroke="#c4a57b" strokeWidth="3" />
                <line x1="240" y1="140" x2="150" y2="50" stroke="#c4a57b" strokeWidth="3" />
                <line x1="150" y1="50" x2="60" y2="140" stroke="#c4a57b" strokeWidth="3" />
                <line x1="60" y1="140" x2="150" y2="230" stroke="#c4a57b" strokeWidth="3" />

                {/* Infield dirt */}
                <circle cx="150" cy="160" r="55" fill="#c4a57b" opacity="0.3" />

                {/* Pitcher's mound */}
                <circle cx="150" cy="140" r="8" fill="#c4a57b" />

                {/* Home plate */}
                <polygon points="150,230 143,223 143,218 157,218 157,223" fill="white" />

                {/* First base */}
                <rect x="232" y="132" width="16" height="16" transform="rotate(45,240,140)"
                    fill={bases.first ? '#4ade80' : 'white'} stroke="#333" strokeWidth="1" />

                {/* Second base */}
                <rect x="142" y="42" width="16" height="16" transform="rotate(45,150,50)"
                    fill={bases.second ? '#4ade80' : 'white'} stroke="#333" strokeWidth="1" />

                {/* Third base */}
                <rect x="52" y="132" width="16" height="16" transform="rotate(45,60,140)"
                    fill={bases.third ? '#4ade80' : 'white'} stroke="#333" strokeWidth="1" />

                {/* Runner names */}
                {bases.first && (
                    <text x="240" y="120" textAnchor="middle" className="runner-label">{getRunnerName(bases.first)}</text>
                )}
                {bases.second && (
                    <text x="150" y="35" textAnchor="middle" className="runner-label">{getRunnerName(bases.second)}</text>
                )}
                {bases.third && (
                    <text x="60" y="120" textAnchor="middle" className="runner-label">{getRunnerName(bases.third)}</text>
                )}
            </svg>

            {/* Outs display */}
            <div className="diamond-outs">
                {[0, 1, 2].map(i => (
                    <div key={i} className={`out-dot ${i < outs ? 'active' : ''}`} />
                ))}
                <span className="outs-label">{outs} out{outs !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
}
