/**
 * MLB Showdown Game Board — SVG-based layout matching the 2005 physical board.
 * Card slots hold actual card images during gameplay.
 * Handles all Advanced rule phases: subs, icons, extra bases, DP.
 */
import { useState, useRef } from 'react';
import type { GameState, GameAction, PlayerSlot, TeamState } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
import './GameBoard.css';

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    isMyTurn: boolean;
    onAction: (action: GameAction) => void;
    homeName: string;
    awayName: string;
}

export default function GameBoard({ state, myRole, isMyTurn, onAction, homeName, awayName }: Props) {
    const [hoveredPlayer, setHoveredPlayer] = useState<PlayerSlot | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
    const [showAwayBullpen, setShowAwayBullpen] = useState(false);
    const [showHomeBullpen, setShowHomeBullpen] = useState(false);
    const [showSubPanel, setShowSubPanel] = useState(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const batter = getCurrentBatter(state);
    const pitcher = getCurrentPitcher(state);
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const iAmBatting = (state.halfInning === 'top' && myRole === 'away') || (state.halfInning === 'bottom' && myRole === 'home');

    const getRunner = (base: 'first' | 'second' | 'third'): PlayerSlot | null => {
        const id = state.bases[base];
        if (!id) return null;
        return battingTeam.lineup.find(p => p.cardId === id) || null;
    };

    const runner1 = getRunner('first');
    const runner2 = getRunner('second');
    const runner3 = getRunner('third');

    const outcomeNames: Record<string, string> = {
        SO: 'STRIKEOUT', GB: 'GROUND OUT', FB: 'FLY OUT', PU: 'POPUP',
        W: 'WALK', S: 'SINGLE', SPlus: 'SINGLE+', DB: 'DOUBLE', TR: 'TRIPLE', HR: 'HOME RUN!',
    };

    const innings = Array.from({ length: Math.max(9, state.inning) }, (_, i) => i + 1);

    const handlePlayerHover = (player: PlayerSlot, e: React.MouseEvent) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
            setHoveredPlayer(player);
            setHoverPos({ x: e.clientX, y: e.clientY });
        }, 300);
    };

    const handlePlayerLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoveredPlayer(null);
    };

    // Pitcher fatigue display
    const pitcherIp = pitcher.ip || 0;
    const pitcherInnings = fieldingTeam.inningsPitched || 0;
    const fatigueActive = pitcherInnings > pitcherIp;

    // Has runners (for sac bunt option)
    const hasRunners = !!(state.bases.first || state.bases.second || state.bases.third);

    return (
        <div className="game-board-wrap">
            {/* Player card tooltip overlay */}
            {hoveredPlayer && (
                <div className="player-tooltip" style={{
                    left: Math.min(hoverPos.x + 15, window.innerWidth - 280),
                    top: Math.min(hoverPos.y - 100, window.innerHeight - 400),
                }}>
                    <img src={hoveredPlayer.imagePath} alt="" className="tooltip-card-img" />
                    <div className="tooltip-info">
                        <div className="tooltip-name">{hoveredPlayer.name}</div>
                        {hoveredPlayer.type === 'hitter' ? (
                            <div className="tooltip-stats">
                                <span>OB: {hoveredPlayer.onBase}</span>
                                <span>Spd: {hoveredPlayer.speed}</span>
                                {hoveredPlayer.fielding ? <span>Fld: +{hoveredPlayer.fielding}</span> : null}
                            </div>
                        ) : (
                            <div className="tooltip-stats">
                                <span>Ctrl: {hoveredPlayer.control}</span>
                                <span>IP: {hoveredPlayer.ip}</span>
                            </div>
                        )}
                        {hoveredPlayer.icons && hoveredPlayer.icons.length > 0 && (
                            <div className="tooltip-icons">{hoveredPlayer.icons.join(' ')}</div>
                        )}
                        <div className="tooltip-chart">
                            {Object.entries(hoveredPlayer.chart).filter(([,v]) => v).map(([k, v]) => (
                                <span key={k}>{k}: {String(v)}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Away Bullpen/Bench expand panel */}
            {showAwayBullpen && (
                <div className="bullpen-panel away-panel">
                    <div className="bp-header" onClick={() => setShowAwayBullpen(false)}>
                        AWAY BULLPEN & BENCH ▲
                    </div>
                    <div className="bp-cards">
                        {(state.awayTeam.bullpen?.length > 0) && (
                            <>
                                <div className="bp-section-label">Bullpen</div>
                                {state.awayTeam.bullpen.map((p, i) => (
                                    <div key={`aw-bp-${i}`} className="bp-card" onMouseEnter={(e) => handlePlayerHover(p, e)} onMouseLeave={handlePlayerLeave}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">Ctrl:{p.control} IP:{p.ip} {p.role}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {(state.awayTeam.bench?.length > 0) && (
                            <>
                                <div className="bp-section-label">Bench</div>
                                {state.awayTeam.bench.map((p, i) => (
                                    <div key={`aw-bn-${i}`} className="bp-card" onMouseEnter={(e) => handlePlayerHover(p, e)} onMouseLeave={handlePlayerLeave}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">OB:{p.onBase} Spd:{p.speed}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {(!state.awayTeam.bullpen?.length && !state.awayTeam.bench?.length) && (
                            <div className="bp-empty">No bullpen or bench players</div>
                        )}
                    </div>
                </div>
            )}

            {/* Home Bullpen/Bench expand panel */}
            {showHomeBullpen && (
                <div className="bullpen-panel home-panel">
                    <div className="bp-header" onClick={() => setShowHomeBullpen(false)}>
                        HOME BULLPEN & BENCH ▲
                    </div>
                    <div className="bp-cards">
                        {(state.homeTeam.bullpen?.length > 0) && (
                            <>
                                <div className="bp-section-label">Bullpen</div>
                                {state.homeTeam.bullpen.map((p, i) => (
                                    <div key={`hm-bp-${i}`} className="bp-card" onMouseEnter={(e) => handlePlayerHover(p, e)} onMouseLeave={handlePlayerLeave}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">Ctrl:{p.control} IP:{p.ip} {p.role}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {(state.homeTeam.bench?.length > 0) && (
                            <>
                                <div className="bp-section-label">Bench</div>
                                {state.homeTeam.bench.map((p, i) => (
                                    <div key={`hm-bn-${i}`} className="bp-card" onMouseEnter={(e) => handlePlayerHover(p, e)} onMouseLeave={handlePlayerLeave}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">OB:{p.onBase} Spd:{p.speed}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {(!state.homeTeam.bullpen?.length && !state.homeTeam.bench?.length) && (
                            <div className="bp-empty">No bullpen or bench players</div>
                        )}
                    </div>
                </div>
            )}

            {/* Substitution selection panel (overlay) */}
            {showSubPanel && isMyTurn && (
                <div className="bullpen-panel" style={{ left: '50%', bottom: '80px', transform: 'translateX(-50%)', zIndex: 600 }}>
                    {state.phase === 'pre_atbat' && iAmBatting && (
                        <>
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT PINCH HITTER ▲</div>
                            <div className="bp-cards">
                                {battingTeam.bench.map((p, i) => (
                                    <div key={`ph-${i}`} className="bp-card" onClick={() => {
                                        onAction({ type: 'PINCH_HIT', benchCardId: p.cardId, lineupIndex: battingTeam.currentBatterIndex });
                                        setShowSubPanel(false);
                                    }}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">OB:{p.onBase} Spd:{p.speed} {p.icons?.join(' ')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {state.phase === 'defense_sub' && !iAmBatting && (
                        <>
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT RELIEVER ▲</div>
                            <div className="bp-cards">
                                {fieldingTeam.bullpen.map((p, i) => (
                                    <div key={`pc-${i}`} className="bp-card" onClick={() => {
                                        onAction({ type: 'PITCHING_CHANGE', bullpenCardId: p.cardId });
                                        setShowSubPanel(false);
                                    }}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info">
                                            <span className="bp-card-name">{p.name}</span>
                                            <span className="bp-card-stats">Ctrl:{p.control} IP:{p.ip} {p.role} {p.icons?.join(' ')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            <svg viewBox="0 0 1400 950" className="game-board-svg">
                <defs>
                    <pattern id="grassStripe" x="0" y="0" width="1" height="54" patternUnits="userSpaceOnUse">
                        <rect width="1400" height="27" fill="#1a6a10"/>
                        <rect y="27" width="1400" height="27" fill="#228716"/>
                    </pattern>
                    <radialGradient id="dirtGrad" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="#c89040"/>
                        <stop offset="55%" stopColor="#a86c28"/>
                        <stop offset="100%" stopColor="#6e4010"/>
                    </radialGradient>
                    <radialGradient id="moundGrad" cx="38%" cy="28%" r="65%">
                        <stop offset="0%" stopColor="#e2ac62"/>
                        <stop offset="100%" stopColor="#9a6022"/>
                    </radialGradient>
                    <radialGradient id="homeDirtGrad" cx="50%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="#c89040"/>
                        <stop offset="100%" stopColor="#8a5820"/>
                    </radialGradient>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f0c840"/>
                        <stop offset="45%" stopColor="#d4a018"/>
                        <stop offset="100%" stopColor="#a07808"/>
                    </linearGradient>
                    <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e42a0"/>
                        <stop offset="100%" stopColor="#060e2a"/>
                    </linearGradient>
                    <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d42020"/>
                        <stop offset="100%" stopColor="#7a0808"/>
                    </linearGradient>
                    <linearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0c1e3a"/>
                        <stop offset="100%" stopColor="#060f1e"/>
                    </linearGradient>
                    <linearGradient id="scoreBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0e2248"/>
                        <stop offset="100%" stopColor="#07101e"/>
                    </linearGradient>
                    <linearGradient id="boardBg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#101e3a"/>
                        <stop offset="100%" stopColor="#050c1a"/>
                    </linearGradient>
                    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="2" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.85)"/>
                    </filter>
                    <filter id="cardGlow" x="-80%" y="-80%" width="260%" height="260%">
                        <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="rgba(255,255,210,0.5)"/>
                    </filter>
                    <clipPath id="centerClip">
                        <rect x="215" y="173" width="970" height="769"/>
                    </clipPath>
                </defs>

                {/* Background + border */}
                <rect width="1400" height="950" fill="url(#boardBg)"/>
                <rect x="3" y="3" width="1394" height="944" rx="12" fill="none" stroke="url(#goldGrad)" strokeWidth="5"/>

                {/* ====== HEADER ====== */}
                <rect x="3" y="3" width="1394" height="72" rx="12" fill="url(#goldGrad)"/>
                <rect x="3" y="56" width="1394" height="19" fill="#b88010"/>
                <text x="700" y="50" textAnchor="middle" fontSize="40" fill="#002868" fontWeight="900" letterSpacing="7" fontFamily="Impact,Arial Black,sans-serif">MLB SHOWDOWN</text>
                <rect x="310" y="54" width="780" height="3" fill="#bf0000" opacity="0.85"/>

                {/* ====== SCOREBOARD ====== */}
                <line x1="7" y1="75" x2="1393" y2="75" stroke="#d4a018" strokeWidth="1.5"/>
                <rect x="7" y="76" width="1386" height="96" rx="4" fill="url(#scoreBg)" stroke="#d4a018" strokeWidth="1.5"/>

                {/* Scoreboard headers */}
                <rect x="10" y="80" width="130" height="20" fill="#002868" rx="2"/>
                <text x="75" y="94" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">TEAM</text>
                {innings.slice(0, 9).map((inn, i) => (
                    <g key={`hdr-${inn}`}>
                        <rect x={140 + i * 74} y="80" width="74" height="20" fill={i % 2 === 0 ? '#002868' : '#001e50'}/>
                        <text x={177 + i * 74} y="94" textAnchor="middle" fontSize="11" fill="#c8d8f8" fontWeight="bold" fontFamily="Arial">{inn}</text>
                    </g>
                ))}
                <rect x="806" y="80" width="68" height="20" fill="#9a0000" rx="2"/>
                <text x="840" y="94" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">R</text>
                <rect x="874" y="80" width="68" height="20" fill="#7a0000" rx="2"/>
                <text x="908" y="94" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">H</text>
                <rect x="942" y="80" width="64" height="20" fill="#5a0000" rx="2"/>
                <text x="974" y="94" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">E</text>

                {/* Visitor row */}
                <rect x="10" y="101" width="130" height="32" fill="#0c1a40"/>
                <text x="75" y="122" textAnchor="middle" fontSize="11" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{awayName.slice(0, 12).toUpperCase()}</text>
                {innings.slice(0, 9).map((inn, i) => {
                    const runs = state.awayTeam.runsPerInning[i];
                    return (
                        <g key={`away-${inn}`}>
                            <rect x={140 + i * 74} y="101" width="74" height="32" fill={i % 2 === 0 ? '#0a1830' : '#071024'} stroke="#1a3060" strokeWidth="0.5"/>
                            <text x={177 + i * 74} y="123" textAnchor="middle" fontSize="16" fill={runs !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">{runs ?? '\u2014'}</text>
                        </g>
                    );
                })}
                <rect x="806" y="101" width="68" height="32" fill="#3a0a0a"/>
                <text x="840" y="124" textAnchor="middle" fontSize="18" fill="white" fontWeight="bold" fontFamily="Impact">{state.score.away}</text>
                <rect x="874" y="101" width="68" height="32" fill="#081222"/>
                <text x="908" y="124" textAnchor="middle" fontSize="18" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{state.awayTeam.hits || 0}</text>
                <rect x="942" y="101" width="64" height="32" fill="#081222"/>
                <text x="974" y="124" textAnchor="middle" fontSize="18" fill="#285090" fontWeight="bold" fontFamily="Impact">0</text>

                {/* Home row */}
                <rect x="10" y="134" width="130" height="32" fill="#0e0818"/>
                <text x="75" y="155" textAnchor="middle" fontSize="11" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{homeName.slice(0, 12).toUpperCase()}</text>
                {innings.slice(0, 9).map((inn, i) => {
                    const runs = state.homeTeam.runsPerInning[i];
                    return (
                        <g key={`home-${inn}`}>
                            <rect x={140 + i * 74} y="134" width="74" height="32" fill={i % 2 === 0 ? '#0a1830' : '#071024'} stroke="#1a3060" strokeWidth="0.5"/>
                            <text x={177 + i * 74} y="156" textAnchor="middle" fontSize="16" fill={runs !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">{runs ?? '\u2014'}</text>
                        </g>
                    );
                })}
                <rect x="806" y="134" width="68" height="32" fill="#3a0a0a"/>
                <text x="840" y="157" textAnchor="middle" fontSize="18" fill="white" fontWeight="bold" fontFamily="Impact">{state.score.home}</text>
                <rect x="874" y="134" width="68" height="32" fill="#081222"/>
                <text x="908" y="157" textAnchor="middle" fontSize="18" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{state.homeTeam.hits || 0}</text>
                <rect x="942" y="134" width="64" height="32" fill="#081222"/>
                <text x="974" y="157" textAnchor="middle" fontSize="18" fill="#285090" fontWeight="bold" fontFamily="Impact">0</text>

                {/* Inning indicator */}
                <line x1="1010" y1="82" x2="1010" y2="166" stroke="#d4a01870" strokeWidth="1.5"/>
                <text x="1020" y="90" fontSize="8" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">INNING</text>
                <rect x="1020" y="96" width="56" height="56" rx="5" fill="#040c1a" stroke="#d4a018" strokeWidth="1.5"/>
                <text x="1048" y="142" textAnchor="middle" fontSize="36" fill="white" fontWeight="900" fontFamily="Impact">{state.inning}</text>
                <rect x="1082" y="96" width="62" height="26" rx="4" fill={state.halfInning === 'top' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'top' ? '#d4a018' : '#d4a01860'} strokeWidth="1.2"/>
                <text x="1113" y="117" textAnchor="middle" fontSize="11" fill={state.halfInning === 'top' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">TOP</text>
                <rect x="1082" y="126" width="62" height="26" rx="4" fill={state.halfInning === 'bottom' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'bottom' ? '#d4a018' : '#d4a01860'} strokeWidth="1.2"/>
                <text x="1113" y="147" textAnchor="middle" fontSize="11" fill={state.halfInning === 'bottom' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">BOT</text>

                {/* Outs */}
                <line x1="1150" y1="82" x2="1150" y2="166" stroke="#d4a01850" strokeWidth="1"/>
                <text x="1160" y="90" fontSize="8" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">OUTS</text>
                {[0, 1, 2].map(i => (
                    <g key={`out-${i}`}>
                        <circle cx={1214 + i * 59} cy="128" r="22" fill={state.outs > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="2"/>
                        <circle cx={1214 + i * 59} cy="128" r="14" fill={state.outs > i ? '#ff3030' : '#0e0408'} stroke={state.outs > i ? '#ff6060' : '#3a1020'} strokeWidth="0.8"/>
                        <text x={1214 + i * 59} y="133" textAnchor="middle" fontSize="10" fill={state.outs > i ? 'white' : '#4a1830'} fontWeight="bold" fontFamily="Arial Black">{i + 1}</text>
                    </g>
                ))}

                {/* ====== LEFT PANEL — AWAY ====== */}
                <line x1="7" y1="172" x2="1393" y2="172" stroke="#d4a018" strokeWidth="2"/>
                <rect x="7" y="173" width="206" height="767" rx="4" fill="url(#panelBg)" stroke="#d4a01840" strokeWidth="1"/>
                <rect x="10" y="176" width="200" height="40" rx="3" fill="url(#navyGrad)"/>
                <text x="110" y="201" textAnchor="middle" fontSize="16" fill="white" fontWeight="900" letterSpacing="5" fontFamily="Impact,sans-serif">AWAY</text>
                <rect x="10" y="223" width="200" height="34" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="1"/>
                <text x="110" y="245" textAnchor="middle" fontSize="11" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{awayName.toUpperCase()}</text>
                <text x="110" y="275" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>

                {/* Away lineup slots */}
                {state.awayTeam.lineup.map((player, i) => {
                    const y = 285 + i * 52;
                    const isAtBat = state.halfInning === 'top' && i === state.awayTeam.currentBatterIndex;
                    return (
                        <g key={`away-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="14" y={y} width="192" height="48" rx="3" fill={isAtBat ? '#1a2858' : '#081428'} stroke={isAtBat ? '#e94560' : '#1a3040'} strokeWidth={isAtBat ? 2 : 0.5}/>
                            <text x="27" y={y + 30} fontSize="13" fill={isAtBat ? '#e94560' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="42" y={y + 2} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="78" y={y + 18} fontSize="10" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="78" y={y + 30} fontSize="9" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}{player.fielding ? ` +${player.fielding}` : ''}</text>
                            {player.icons && player.icons.length > 0 && (
                                <text x="78" y={y + 42} fontSize="8" fill="#d4a018" fontFamily="Arial" fontWeight="600">{player.icons.join(' ')}</text>
                            )}
                        </g>
                    );
                })}
                {/* Away expand button */}
                <g cursor="pointer" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="14" y="755" width="192" height="28" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="110" y="774" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== RIGHT PANEL — HOME ====== */}
                <rect x="1187" y="173" width="206" height="767" rx="4" fill="url(#panelBg)" stroke="#d4a01840" strokeWidth="1"/>
                <rect x="1190" y="176" width="200" height="40" rx="3" fill="url(#redGrad)"/>
                <text x="1290" y="201" textAnchor="middle" fontSize="16" fill="white" fontWeight="900" letterSpacing="5" fontFamily="Impact,sans-serif">HOME</text>
                <rect x="1190" y="223" width="200" height="34" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="1"/>
                <text x="1290" y="245" textAnchor="middle" fontSize="11" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{homeName.toUpperCase()}</text>
                <text x="1290" y="275" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>

                {/* Home lineup slots */}
                {state.homeTeam.lineup.map((player, i) => {
                    const y = 285 + i * 52;
                    const isAtBat = state.halfInning === 'bottom' && i === state.homeTeam.currentBatterIndex;
                    return (
                        <g key={`home-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="1194" y={y} width="192" height="48" rx="3" fill={isAtBat ? '#1a2858' : '#081428'} stroke={isAtBat ? '#e94560' : '#1a3040'} strokeWidth={isAtBat ? 2 : 0.5}/>
                            <text x="1207" y={y + 30} fontSize="13" fill={isAtBat ? '#e94560' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="1222" y={y + 2} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="1258" y={y + 18} fontSize="10" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="1258" y={y + 30} fontSize="9" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}{player.fielding ? ` +${player.fielding}` : ''}</text>
                            {player.icons && player.icons.length > 0 && (
                                <text x="1258" y={y + 42} fontSize="8" fill="#d4a018" fontFamily="Arial" fontWeight="600">{player.icons.join(' ')}</text>
                            )}
                        </g>
                    );
                })}
                {/* Home expand button */}
                <g cursor="pointer" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x="1194" y="755" width="192" height="28" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="1290" y="774" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== CENTER FIELD ====== */}
                <rect x="213" y="173" width="974" height="767" fill="url(#grassStripe)"/>
                <line x1="213" y1="173" x2="213" y2="940" stroke="#d4a018" strokeWidth="2"/>
                <line x1="1187" y1="173" x2="1187" y2="940" stroke="#d4a018" strokeWidth="2"/>

                {/* Diamond dirt + base paths */}
                <path d="M 700,985 L 1120,565 L 700,145 L 280,565 Z M 700,891 L 374,565 L 700,239 L 1026,565 Z" fill="url(#dirtGrad)" fillRule="evenodd" clipPath="url(#centerClip)"/>
                <polygon points="700,891 1026,565 700,239 374,565" fill="url(#grassStripe)" opacity="0.55"/>
                <line x1="700" y1="905" x2="1040" y2="565" stroke="#e8e8e0" strokeWidth="3.5" opacity="0.55"/>
                <line x1="1040" y1="565" x2="700" y2="225" stroke="#e8e8e0" strokeWidth="3.5" opacity="0.55"/>
                <line x1="700" y1="225" x2="360" y2="565" stroke="#e8e8e0" strokeWidth="3.5" opacity="0.55"/>
                <line x1="360" y1="565" x2="700" y2="905" stroke="#e8e8e0" strokeWidth="3.5" opacity="0.55"/>

                {/* Mound */}
                <circle cx="700" cy="565" r="56" fill="url(#dirtGrad)"/>
                <ellipse cx="700" cy="565" rx="40" ry="22" fill="url(#moundGrad)" stroke="#9a6020" strokeWidth="2"/>
                <rect x="684" y="560" width="32" height="10" rx="2" fill="#e8e8e8" opacity="0.88"/>

                {/* Home plate dirt + plate */}
                <ellipse cx="700" cy="895" rx="70" ry="42" fill="url(#homeDirtGrad)" clipPath="url(#centerClip)"/>
                <polygon points="683,883 717,883 722,896 700,911 678,896" fill="white" stroke="#d0d0d0" strokeWidth="2" filter="url(#dropShadow)"/>

                {/* Base markers */}
                <rect x="1029" y="554" width="22" height="22" rx="3" fill={runner1 ? '#4ade80' : 'white'} stroke={runner1 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,1040,565)" filter="url(#dropShadow)"/>
                <rect x="689" y="214" width="22" height="22" rx="3" fill={runner2 ? '#4ade80' : 'white'} stroke={runner2 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,700,225)" filter="url(#dropShadow)"/>
                <rect x="349" y="554" width="22" height="22" rx="3" fill={runner3 ? '#4ade80' : 'white'} stroke={runner3 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,360,565)" filter="url(#dropShadow)"/>

                {/* ====== CARD SLOTS ====== */}
                <CardSlot x={662} y={178} label="2B" card={runner2} labelBelow={true}/>
                <CardSlot x={1006} y={512} label="1B" card={runner1}/>
                <CardSlot x={318} y={512} label="3B" card={runner3}/>
                <CardSlot x={662} y={512} label="P" card={pitcher} labelBelow={true} labelText="PITCHER"/>
                <CardSlot x={662} y={783} label="H" card={batter} labelAbove={true} labelText="HITTER"/>

                {/* ====== PITCHER IP / FATIGUE ====== */}
                <rect x="745" y="620" width="90" height="22" rx="4" fill="rgba(0,0,0,0.7)"/>
                <text x="790" y="636" textAnchor="middle" fontSize="10" fill={fatigueActive ? '#ff6060' : '#8aade0'} fontWeight="bold" fontFamily="monospace">
                    IP: {pitcherInnings}/{pitcherIp}{fatigueActive ? ` (-${pitcherInnings - pitcherIp})` : ''}
                </text>

                {/* ====== RESULT OVERLAY ====== */}
                {state.lastOutcome && state.phase !== 'result_icons' && (
                    <g>
                        <rect x="580" y="670" width="240" height="50" rx="8" fill={
                            ['SO','GB','FB','PU'].includes(state.lastOutcome) ? 'rgba(200,30,30,0.9)' :
                            state.lastOutcome === 'HR' ? 'rgba(233,69,96,0.95)' : 'rgba(34,180,80,0.9)'
                        }/>
                        <text x="700" y="703" textAnchor="middle" fontSize="24" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">
                            {outcomeNames[state.lastOutcome] || state.lastOutcome}
                        </text>
                    </g>
                )}

                {/* ====== DP RESULT OVERLAY ====== */}
                {state.pendingDpResult && (
                    <g>
                        <rect x="440" y="340" width="220" height="50" rx="6" fill={state.pendingDpResult.isDP ? 'rgba(200,30,30,0.9)' : 'rgba(34,180,80,0.9)'}/>
                        <text x="550" y="362" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingDpResult.isDP ? 'DOUBLE PLAY!' : 'DP AVOIDED'}
                        </text>
                        <text x="550" y="382" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            d20({state.pendingDpResult.roll})+IF({state.pendingDpResult.defenseTotal - state.pendingDpResult.roll})={state.pendingDpResult.defenseTotal} vs Spd {state.pendingDpResult.offenseSpeed}
                        </text>
                    </g>
                )}

                {/* ====== EXTRA BASE RESULT OVERLAY ====== */}
                {state.pendingExtraBaseResult && (
                    <g>
                        <rect x="440" y="340" width="260" height="50" rx="6" fill={state.pendingExtraBaseResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x="570" y="362" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingExtraBaseResult.safe ? `${state.pendingExtraBaseResult.runnerName} SAFE!` : `${state.pendingExtraBaseResult.runnerName} OUT!`}
                        </text>
                        <text x="570" y="382" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingExtraBaseResult.runnerSpeed} vs d20({state.pendingExtraBaseResult.roll})+OF={state.pendingExtraBaseResult.defenseTotal}
                        </text>
                    </g>
                )}

                {/* ====== PITCH INFO ====== */}
                {state.lastPitchRoll > 0 && (
                    <g>
                        <rect x="440" y="440" width="180" height="60" rx="6" fill="rgba(0,0,0,0.75)"/>
                        <text x="530" y="460" textAnchor="middle" fontSize="11" fill="#aaa" fontFamily="monospace">
                            Pitch: {state.lastPitchRoll}+{pitcher.control || 0}{state.fatiguePenalty ? `-${state.fatiguePenalty}` : ''}{state.controlModifier ? `+${state.controlModifier}` : ''}={state.lastPitchTotal} vs OB {batter.onBase}
                        </text>
                        <text x="530" y="478" textAnchor="middle" fontSize="11" fill={state.usedPitcherChart ? '#60a5fa' : '#4ade80'} fontFamily="monospace" fontWeight="bold">
                            {'\u2192'} {state.usedPitcherChart ? "Pitcher's chart" : "Batter's chart"}
                        </text>
                        {state.lastSwingRoll > 0 && (
                            <text x="530" y="494" textAnchor="middle" fontSize="11" fill="#ddd" fontFamily="monospace">
                                Swing: {state.lastSwingRoll}
                            </text>
                        )}
                    </g>
                )}

                {/* ====== ACTION BUTTONS ====== */}

                {/* Pre-atbat phase: offense can pinch hit, sac bunt, or skip */}
                {!state.isOver && isMyTurn && state.phase === 'pre_atbat' && (
                    <g>
                        {battingTeam.bench.length > 0 && (
                            <g className="roll-button" onClick={() => setShowSubPanel(true)} cursor="pointer">
                                <rect x="500" y="730" width="160" height="38" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                <text x="580" y="755" textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">PINCH HIT</text>
                            </g>
                        )}
                        {hasRunners && (
                            <g className="roll-button" onClick={() => onAction({ type: 'SAC_BUNT' })} cursor="pointer">
                                <rect x="670" y="730" width="120" height="38" rx="6" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1.5"/>
                                <text x="730" y="755" textAnchor="middle" fontSize="14" fill="white" fontWeight="900" fontFamily="Impact">SAC BUNT</text>
                            </g>
                        )}
                        <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                            <rect x="800" y="730" width="100" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                            <text x="850" y="755" textAnchor="middle" fontSize="14" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                        </g>
                    </g>
                )}

                {/* Defense sub phase: defense can change pitcher or skip */}
                {!state.isOver && isMyTurn && state.phase === 'defense_sub' && (
                    <g>
                        {fieldingTeam.bullpen.length > 0 && (
                            <g className="roll-button" onClick={() => setShowSubPanel(true)} cursor="pointer">
                                <rect x="520" y="730" width="200" height="38" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                <text x="620" y="755" textAnchor="middle" fontSize="14" fill="#002" fontWeight="900" fontFamily="Impact">CHANGE PITCHER</text>
                            </g>
                        )}
                        <g className="roll-button" onClick={() => onAction({ type: 'SKIP_SUB' })} cursor="pointer">
                            <rect x="730" y="730" width="100" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                            <text x="780" y="755" textAnchor="middle" fontSize="14" fill="#ccc" fontWeight="900" fontFamily="Impact">SKIP</text>
                        </g>
                    </g>
                )}

                {/* Pitch phase */}
                {!state.isOver && isMyTurn && state.phase === 'pitch' && (
                    <g className="roll-button" onClick={() => onAction({ type: 'ROLL_PITCH' })} cursor="pointer">
                        <rect x="600" y="730" width="200" height="45" rx="8" fill="#e94560" stroke="#ff6b8a" strokeWidth="2"/>
                        <text x="700" y="760" textAnchor="middle" fontSize="20" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL PITCH</text>
                    </g>
                )}

                {/* Swing phase */}
                {!state.isOver && isMyTurn && state.phase === 'swing' && (
                    <g className="roll-button" onClick={() => onAction({ type: 'ROLL_SWING' })} cursor="pointer">
                        <rect x="600" y="730" width="200" height="45" rx="8" fill="#4ade80" stroke="#6bff9a" strokeWidth="2"/>
                        <text x="700" y="760" textAnchor="middle" fontSize="20" fill="#002" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">ROLL SWING</text>
                    </g>
                )}

                {/* Result icons phase: show icon buttons */}
                {!state.isOver && isMyTurn && state.phase === 'result_icons' && state.iconPrompt && (
                    <g>
                        <rect x="480" y="670" width="440" height="40" rx="6" fill="rgba(0,0,0,0.8)"/>
                        <text x="700" y="696" textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="bold" fontFamily="Arial">
                            {state.lastOutcome ? `Result: ${outcomeNames[state.lastOutcome] || state.lastOutcome}` : 'Icon Decision'}
                        </text>
                        {state.iconPrompt.availableIcons.map((ic, i) => (
                            <g key={`icon-${i}`} className="roll-button" onClick={() => onAction({ type: 'USE_ICON', cardId: ic.cardId, icon: ic.icon })} cursor="pointer">
                                <rect x={500 + i * 150} y="720" width="140" height="38" rx="6" fill="#d4a018" stroke="#f0c840" strokeWidth="1.5"/>
                                <text x={570 + i * 150} y="744" textAnchor="middle" fontSize="12" fill="#002" fontWeight="bold" fontFamily="Arial">{ic.description.split(':')[0]}</text>
                            </g>
                        ))}
                        <g className="roll-button" onClick={() => onAction({ type: 'SKIP_ICONS' })} cursor="pointer">
                            <rect x={500 + state.iconPrompt.availableIcons.length * 150} y="720" width="100" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                            <text x={550 + state.iconPrompt.availableIcons.length * 150} y="744" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">DECLINE</text>
                        </g>
                    </g>
                )}

                {/* Extra base phase: defense chooses who to throw at */}
                {!state.isOver && isMyTurn && state.phase === 'extra_base' && state.extraBaseEligible && (
                    <g>
                        <rect x="440" y="670" width="520" height="40" rx="6" fill="rgba(0,0,0,0.8)"/>
                        <text x="700" y="696" textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="bold" fontFamily="Arial">
                            Extra Base Attempt — Choose runner to throw at:
                        </text>
                        {state.extraBaseEligible.map((runner, i) => (
                            <g key={`eb-${i}`} className="roll-button" onClick={() => onAction({ type: 'EXTRA_BASE_THROW', runnerId: runner.runnerId })} cursor="pointer">
                                <rect x={480 + i * 170} y="720" width="160" height="38" rx="6" fill="#e94560" stroke="#ff6b8a" strokeWidth="1.5"/>
                                <text x={560 + i * 170} y="738" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">THROW: {runner.runnerName}</text>
                                <text x={560 + i * 170} y="752" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)" fontFamily="monospace">{runner.fromBase}{'\u2192'}{runner.toBase} Spd:{runner.runnerSpeed}</text>
                            </g>
                        ))}
                        <g className="roll-button" onClick={() => onAction({ type: 'SKIP_EXTRA_BASE' })} cursor="pointer">
                            <rect x={480 + state.extraBaseEligible.length * 170} y="720" width="120" height="38" rx="6" fill="#334155" stroke="#64748b" strokeWidth="1.5"/>
                            <text x={540 + state.extraBaseEligible.length * 170} y="744" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold" fontFamily="Arial">NO THROW</text>
                        </g>
                    </g>
                )}

                {/* Waiting for opponent */}
                {!state.isOver && !isMyTurn && (
                    <g>
                        <rect x="580" y="730" width="240" height="40" rx="6" fill="rgba(0,0,0,0.6)"/>
                        <text x="700" y="757" textAnchor="middle" fontSize="14" fill="#888" fontStyle="italic" fontFamily="Arial">Waiting for opponent...</text>
                    </g>
                )}

                {/* Game over */}
                {state.isOver && (
                    <g>
                        <rect x="520" y="700" width="360" height="60" rx="10" fill="rgba(0,0,0,0.85)"/>
                        <text x="700" y="740" textAnchor="middle" fontSize="28" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">
                            GAME OVER  {state.score.away}{'\u2013'}{state.score.home}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}

/** Card slot with corner brackets and glow — shows card image if occupied */
function CardSlot({ x, y, label, card, labelBelow, labelAbove, labelText }: {
    x: number; y: number; label: string; card: PlayerSlot | null;
    labelBelow?: boolean; labelAbove?: boolean; labelText?: string;
}) {
    const w = 76, h = 106;
    return (
        <g>
            <rect x={x + 3} y={y + 3} width={w} height={h} rx="6" fill="rgba(0,0,0,0.55)"/>
            <rect x={x} y={y} width={w} height={h} rx="6" fill="rgba(0,0,0,0.30)" stroke="#f0e8c0" strokeWidth="2.2" strokeDasharray="6,4" opacity="0.88" filter="url(#cardGlow)"/>
            <path d={`M ${x} ${y} l 10 0 M ${x} ${y} l 0 10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x+w} ${y} l -10 0 M ${x+w} ${y} l 0 10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x} ${y+h} l 10 0 M ${x} ${y+h} l 0 -10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            <path d={`M ${x+w} ${y+h} l -10 0 M ${x+w} ${y+h} l 0 -10`} stroke="#f0e8c0" strokeWidth="2.5" opacity="0.7"/>
            {!card && (
                <text x={x + w/2} y={y + h/2 + 5} textAnchor="middle" fontSize="14" fill="#f0e8c038" fontWeight="bold" fontFamily="Arial Black">{label}</text>
            )}
            {card && card.imagePath && (
                <image href={card.imagePath} x={x + 3} y={y + 3} width={w - 6} height={h - 6} preserveAspectRatio="xMidYMid slice"/>
            )}
            {labelText && labelBelow && (
                <text x={x + w/2} y={y + h + 18} textAnchor="middle" fontSize="11" fill="#ffffffaa" fontWeight="bold" fontFamily="Arial Black">{labelText}</text>
            )}
            {labelText && labelAbove && (
                <text x={x + w/2} y={y - 8} textAnchor="middle" fontSize="11" fill="#ffffffaa" fontWeight="bold" fontFamily="Arial Black">{labelText}</text>
            )}
        </g>
    );
}
