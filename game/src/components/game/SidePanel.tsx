import type { TeamState } from '../../engine/gameEngine';
import './SidePanel.css';

interface Props {
    team: TeamState;
    type: 'bullpen' | 'bench';
}

export default function SidePanel({ team, type }: Props) {
    // For now just show the pitcher as bullpen
    // In the future this would show available relievers/closers and bench players
    if (type === 'bullpen') {
        return (
            <div className="side-panel">
                <div className="side-label">BP</div>
                <div className="side-card">
                    <img src={team.pitcher.imagePath} alt={team.pitcher.name} className="side-img" title={team.pitcher.name} />
                </div>
            </div>
        );
    }

    return (
        <div className="side-panel">
            <div className="side-label">BN</div>
        </div>
    );
}
