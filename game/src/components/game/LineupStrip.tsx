import type { TeamState } from '../../engine/gameEngine';
import './LineupStrip.css';

interface Props {
    team: TeamState;
    label: string;
    isOpponent: boolean;
    currentBatterIndex: number;
    isBatting: boolean;
}

export default function LineupStrip({ team, label, isOpponent, currentBatterIndex, isBatting }: Props) {
    return (
        <div className={`lineup-strip ${isOpponent ? 'opponent' : 'mine'}`}>
            <div className="strip-label">{label}</div>
            <div className="strip-cards">
                {team.lineup.map((player, i) => (
                    <div
                        key={player.cardId + i}
                        className={`strip-card ${i === currentBatterIndex && isBatting ? 'at-bat' : ''}`}
                        title={`${i + 1}. ${player.name} (OB: ${player.onBase})`}
                    >
                        <span className="strip-order">{i + 1}</span>
                        <img src={player.imagePath} alt={player.name} className="strip-img" />
                    </div>
                ))}
            </div>
        </div>
    );
}
