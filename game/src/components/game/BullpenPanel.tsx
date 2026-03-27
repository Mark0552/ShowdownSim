import type { PlayerSlot, TeamState } from '../../engine/gameEngine';
import './GameBoard.css';

interface BullpenPanelProps {
    team: TeamState;
    side: 'home' | 'away';
    onClose: () => void;
    onHover: (player: PlayerSlot, e: React.MouseEvent) => void;
    onLeave: () => void;
}

/** Bullpen/Bench panel — shows full pitcher and bench details */
export default function BullpenPanel({ team, side, onClose, onHover, onLeave }: BullpenPanelProps) {
    const panelClass = `bullpen-panel ${side === 'away' ? 'away-panel' : 'home-panel'}`;
    const label = side === 'away' ? 'AWAY' : 'HOME';
    const activePitcher = team.pitcher;

    return (
        <div className={panelClass}>
            <div className="bp-header" onClick={onClose}>{label} BULLPEN & BENCH &#x25B2;</div>
            <div className="bp-cards">
                {/* Active pitcher info */}
                <div className="bp-section-label">ACTIVE PITCHER</div>
                <div className="bp-card" onMouseEnter={(e) => onHover(activePitcher, e)} onMouseLeave={onLeave}>
                    <img src={activePitcher.imagePath} alt="" />
                    <div className="bp-card-info">
                        <span className="bp-card-name" style={{ color: '#4ade80' }}>{activePitcher.name}</span>
                        <span className="bp-card-stats">
                            Ctrl:{activePitcher.control} IP:{team.inningsPitched || 0}/{activePitcher.ip} {activePitcher.role}
                        </span>
                        {activePitcher.icons && activePitcher.icons.length > 0 && (
                            <span className="bp-card-stats" style={{ color: '#d4a018' }}>{activePitcher.icons.join(' ')}</span>
                        )}
                    </div>
                </div>

                {/* Bullpen */}
                {team.bullpen && team.bullpen.length > 0 && (
                    <>
                        <div className="bp-section-label">BULLPEN ({team.bullpen.length})</div>
                        {team.bullpen.map((p, i) => (
                            <div key={`bp-${i}`} className="bp-card" onMouseEnter={(e) => onHover(p, e)} onMouseLeave={onLeave}>
                                <img src={p.imagePath} alt="" />
                                <div className="bp-card-info">
                                    <span className="bp-card-name">{p.name}</span>
                                    <span className="bp-card-stats">Ctrl:{p.control} IP:{p.ip} {p.role}</span>
                                    {p.icons && p.icons.length > 0 && (
                                        <span className="bp-card-stats" style={{ color: '#d4a018' }}>{p.icons.join(' ')}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Bench */}
                {team.bench && team.bench.length > 0 && (
                    <>
                        <div className="bp-section-label">BENCH ({team.bench.length})</div>
                        {team.bench.map((p, i) => (
                            <div key={`bn-${i}`} className="bp-card" onMouseEnter={(e) => onHover(p, e)} onMouseLeave={onLeave}>
                                <img src={p.imagePath} alt="" />
                                <div className="bp-card-info">
                                    <span className="bp-card-name">
                                        {p.name}
                                        {p.isBackup && <span style={{ color: '#6a8aba', fontSize: '9px' }}> (backup)</span>}
                                    </span>
                                    <span className="bp-card-stats">OB:{p.onBase} Spd:{p.speed}</span>
                                    {p.icons && p.icons.length > 0 && (
                                        <span className="bp-card-stats" style={{ color: '#d4a018' }}>{p.icons.join(' ')}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Used players */}
                {team.usedPlayers && team.usedPlayers.length > 0 && (
                    <>
                        <div className="bp-section-label" style={{ color: '#4a3030' }}>REMOVED ({team.usedPlayers.length})</div>
                        {team.usedPlayers.map((id, i) => (
                            <div key={`used-${i}`} className="bp-card" style={{ opacity: 0.4 }}>
                                <div className="bp-card-info">
                                    <span className="bp-card-name" style={{ color: '#666' }}>{id}</span>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {!team.bullpen?.length && !team.bench?.length && (
                    <div className="bp-empty">No bullpen or bench players available</div>
                )}
            </div>
        </div>
    );
}
