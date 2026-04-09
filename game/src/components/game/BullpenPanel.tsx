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
    const activePitcherId = team.pitcher.cardId;

    // Available bullpen: relievers/closers not currently pitching and not starters
    const availableBullpen = (team.bullpen || []).filter(p => p.role !== 'Starter' && p.cardId !== activePitcherId);

    // Available bench: hitters from bench
    const availableBench = (team.bench || []);

    // Starting rotation: all starters (including active pitcher if they're a starter),
    // sorted SP1 → SP4 by their assignedPosition (Starter-1, Starter-2, etc.)
    const inactiveStarters = (team.bullpen || []).filter(p => p.role === 'Starter');
    const activeIsStarter = team.pitcher.role === 'Starter';
    const allStarters = activeIsStarter
        ? [team.pitcher, ...inactiveStarters]
        : inactiveStarters;
    const getSpNum = (p: PlayerSlot) => {
        const match = p.assignedPosition?.match(/Starter-(\d+)/);
        return match ? parseInt(match[1]) : 99;
    };
    const startingRotation = [...allStarters].sort((a, b) => getSpNum(a) - getSpNum(b));

    // Used players — try to find names by searching lineup, bullpen, bench
    const allKnownPlayers = [
        ...team.lineup,
        ...(team.bullpen || []),
        ...(team.bench || []),
        team.pitcher,
    ];
    const usedPlayerIds = team.usedPlayers || [];

    // Separate used players into pitchers and hitters based on known player data
    const usedWithInfo = usedPlayerIds.map(id => {
        const found = allKnownPlayers.find(p => p.cardId === id);
        return { id, player: found || null };
    });
    const usedBullpen = usedWithInfo.filter(u => u.player?.type === 'pitcher' || (!u.player && !team.lineup.some(p => p.cardId === u.id)));
    const usedBench = usedWithInfo.filter(u => u.player?.type === 'hitter' || (!u.player && team.lineup.some(p => p.cardId === u.id)));
    // Any that couldn't be classified go into bullpen section
    const usedUnknown = usedWithInfo.filter(u => !usedBullpen.includes(u) && !usedBench.includes(u));

    return (
        <div className={panelClass}>
            <div className="bp-header" onClick={onClose}>{label} BULLPEN & BENCH &#x25B2;</div>
            <div className="bp-cards">
                {/* Available Bullpen */}
                {availableBullpen.length > 0 && (
                    <>
                        <div className="bp-section-label">AVAILABLE BULLPEN ({availableBullpen.length})</div>
                        {availableBullpen.map((p, i) => (
                            <div key={`bp-${i}`} className="bp-card" onMouseEnter={(e) => onHover(p, e)} onMouseLeave={onLeave}>
                                <img src={p.imagePath} alt="" />
                                <div className="bp-card-info">
                                    <span className="bp-card-name">{p.name}</span>
                                    {p.icons && p.icons.length > 0 && (
                                        <span className="bp-card-icons">{p.icons.join(' ')}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Available Bench */}
                {availableBench.length > 0 && (
                    <>
                        <div className="bp-section-label">AVAILABLE BENCH ({availableBench.length})</div>
                        {availableBench.map((p, i) => (
                            <div key={`bn-${i}`} className="bp-card" onMouseEnter={(e) => onHover(p, e)} onMouseLeave={onLeave}>
                                <img src={p.imagePath} alt="" />
                                <div className="bp-card-info">
                                    <span className="bp-card-name">{p.name}</span>
                                    {p.icons && p.icons.length > 0 && (
                                        <span className="bp-card-icons">{p.icons.join(' ')}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Starting Rotation */}
                {startingRotation.length > 0 && (
                    <>
                        <div className="bp-section-label" style={{ color: '#4a7a9a' }}>STARTING ROTATION ({startingRotation.length})</div>
                        {startingRotation.map((p, i) => {
                            const isActive = p.cardId === activePitcherId;
                            const spNum = getSpNum(p);
                            return (
                                <div key={`sp-${i}`} className="bp-card" style={{
                                    opacity: isActive ? 1 : 0.6,
                                    border: isActive ? '1px solid #4ade80' : 'none',
                                    borderRadius: isActive ? '4px' : undefined,
                                    background: isActive ? 'rgba(74, 222, 128, 0.08)' : undefined,
                                }} onMouseEnter={(e) => onHover(p, e)} onMouseLeave={onLeave}>
                                    <img src={p.imagePath} alt="" />
                                    <div className="bp-card-info">
                                        <span className="bp-card-name" style={{ color: isActive ? '#4ade80' : '#4a7a9a' }}>
                                            SP{spNum} — {p.name}{isActive ? ' ★' : ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}

                {/* Not Available Bullpen */}
                {(usedBullpen.length > 0 || usedUnknown.length > 0) && (
                    <>
                        <div className="bp-section-label" style={{ color: '#4a3030' }}>NOT AVAILABLE BULLPEN ({usedBullpen.length + usedUnknown.length})</div>
                        {[...usedBullpen, ...usedUnknown].map((u, i) => (
                            <div key={`ubp-${i}`} className="bp-card" style={{ opacity: 0.4 }}>
                                {u.player?.imagePath && <img src={u.player.imagePath} alt="" />}
                                <div className="bp-card-info">
                                    <span className="bp-card-name" style={{ color: '#666' }}>{u.player?.name || u.id}</span>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Not Available Bench */}
                {usedBench.length > 0 && (
                    <>
                        <div className="bp-section-label" style={{ color: '#4a3030' }}>NOT AVAILABLE BENCH ({usedBench.length})</div>
                        {usedBench.map((u, i) => (
                            <div key={`ubn-${i}`} className="bp-card" style={{ opacity: 0.4 }}>
                                {u.player?.imagePath && <img src={u.player.imagePath} alt="" />}
                                <div className="bp-card-info">
                                    <span className="bp-card-name" style={{ color: '#666' }}>{u.player?.name || u.id}</span>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {availableBullpen.length === 0 && availableBench.length === 0 && startingRotation.length === 0 && usedPlayerIds.length === 0 && (
                    <div className="bp-empty">No bullpen or bench players available</div>
                )}
            </div>
        </div>
    );
}
