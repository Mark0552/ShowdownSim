/**
 * MLB Showdown Game Board — SVG-based layout matching the 2005 physical board.
 * Card slots hold actual card images during gameplay.
 * Handles all Advanced rule phases: subs, icons, extra bases, DP.
 */
import { useState, useRef, useCallback } from 'react';
import type { GameState, GameAction, PlayerSlot } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
import CardSlot from './CardSlot';
import BullpenPanel from './BullpenPanel';
import BoxScore from './BoxScore';
import GameLogOverlay from './GameLogOverlay';
import ActionButtons from './ActionButtons';
import DiceRoll from './DiceRoll';
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
    const [showGameLog, setShowGameLog] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [diceAnimating, setDiceAnimating] = useState(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevRollKeyRef = useRef('');
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
        SAC: 'SAC BUNT',
        IBB: 'INTENTIONAL WALK',
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

    // Dice roll tracking — single key based on server's lastRoll
    const rollKey = `${state.lastRollType}-${state.lastRoll}-${state.inning}-${state.halfInning}-${state.outs}-${battingTeam.currentBatterIndex}`;

    // Auto-trigger dice animation when a new roll comes in
    const handleDiceComplete = useCallback(() => {
        setDiceAnimating(false);
    }, []);

    // Detect new rolls and start animation
    if (state.lastRoll && rollKey !== prevRollKeyRef.current) {
        prevRollKeyRef.current = rollKey;
        if (!diceAnimating) setDiceAnimating(true);
    }

    // Render icons with usage tracking (crossed out when used)
    const renderIcons = (player: PlayerSlot, team: typeof state.homeTeam, xPos: number, yPos: number) => {
        if (!player.icons || player.icons.length === 0) return null;
        const usage = team.iconUsage?.[player.cardId] || {};
        const maxUses: Record<string, number> = { V: 2 };
        const items: { icon: string; used: boolean }[] = [];
        for (const icon of player.icons) {
            const max = maxUses[icon] || 1;
            const used = usage[icon] || 0;
            for (let i = 0; i < max; i++) {
                items.push({ icon, used: i < used });
            }
        }
        return (
            <text x={xPos} y={yPos} fontSize="8" fontFamily="Arial" fontWeight="600">
                {items.map((item, i) => (
                    <tspan key={i} fill={item.used ? '#4a3030' : '#d4a018'} textDecoration={item.used ? 'line-through' : 'none'}>
                        {item.icon}{i < items.length - 1 ? ' ' : ''}
                    </tspan>
                ))}
            </text>
        );
    };

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
                            <div className="tooltip-icons">
                                {(() => {
                                    const team = [state.awayTeam, state.homeTeam].find(t =>
                                        t.lineup.some(p => p.cardId === hoveredPlayer!.cardId) || t.pitcher.cardId === hoveredPlayer!.cardId
                                    );
                                    const usage = team?.iconUsage?.[hoveredPlayer!.cardId] || {};
                                    const maxUses: Record<string, number> = { V: 2 };
                                    return hoveredPlayer!.icons.map((icon, i) => {
                                        const max = maxUses[icon] || 1;
                                        const used = usage[icon] || 0;
                                        const parts = [];
                                        for (let j = 0; j < max; j++) {
                                            parts.push(
                                                <span key={`${i}-${j}`} style={{ textDecoration: j < used ? 'line-through' : 'none', color: j < used ? '#4a3030' : '#d4a018' }}>
                                                    {icon}
                                                </span>
                                            );
                                            if (j < max - 1) parts.push(<span key={`${i}-${j}-sep`}> </span>);
                                        }
                                        if (i < hoveredPlayer!.icons.length - 1) parts.push(<span key={`${i}-gap`}> </span>);
                                        return parts;
                                    });
                                })()}
                            </div>
                        )}
                        <div className="tooltip-chart">
                            {(() => {
                                const pitcherOrder = [['PU','PU'],['SO','SO'],['GB','GB'],['FB','FB'],['W','BB'],['S','1B'],['DB','2B'],['HR','HR']];
                                const hitterOrder = [['SO','SO'],['GB','GB'],['FB','FB'],['W','BB'],['S','1B'],['SPlus','1B+'],['DB','2B'],['TR','3B'],['HR','HR']];
                                const order = hoveredPlayer!.type === 'pitcher' ? pitcherOrder : hitterOrder;
                                return order
                                    .filter(([field]) => hoveredPlayer!.chart[field])
                                    .map(([field, label]) => (
                                        <span key={field}>{label}: {String(hoveredPlayer!.chart[field])}</span>
                                    ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Away Bullpen/Bench expand panel */}
            {showAwayBullpen && (
                <BullpenPanel
                    team={state.awayTeam}
                    side="away"
                    onClose={() => setShowAwayBullpen(false)}
                    onHover={handlePlayerHover}
                    onLeave={handlePlayerLeave}
                />
            )}

            {/* Home Bullpen/Bench expand panel */}
            {showHomeBullpen && (
                <BullpenPanel
                    team={state.homeTeam}
                    side="home"
                    onClose={() => setShowHomeBullpen(false)}
                    onHover={handlePlayerHover}
                    onLeave={handlePlayerLeave}
                />
            )}

            {/* Substitution selection panel (overlay) */}
            {showSubPanel && isMyTurn && (
                <div className="bullpen-panel" style={{ left: '50%', bottom: '80px', transform: 'translateX(-50%)', zIndex: 600 }}>
                    {state.phase === 'pre_atbat' && iAmBatting && (
                        <>
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT PINCH HITTER ▲</div>
                            <div className="bp-cards">
                                {battingTeam.bench.filter(p => {
                                    if (!p.isBackup) return true;
                                    const isHomeBatting = state.halfInning === 'bottom';
                                    return isHomeBatting ? state.inning >= 6 : state.inning >= 7;
                                }).map((p, i) => (
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
                                {fieldingTeam.bullpen.filter(p => p.role !== 'Starter').map((p, i) => (
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
                    const isOnDeck = state.halfInning === 'bottom' && i === state.awayTeam.currentBatterIndex;
                    return (
                        <g key={`away-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="14" y={y} width="192" height="48" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2 : isOnDeck ? 1.5 : 0.5}/>
                            <text x="27" y={y + 30} fontSize="13" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="42" y={y + 2} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="78" y={y + 18} fontSize="10" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="78" y={y + 30} fontSize="9" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}{player.fielding ? ` +${player.fielding}` : ''}</text>
                            {player.icons && player.icons.length > 0 && renderIcons(player, state.awayTeam, 78, y + 42)}
                        </g>
                    );
                })}
                {/* Away pitcher */}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.awayTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x="14" y="754" width="192" height="36" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x="20" y="768" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.awayTeam.pitcher.imagePath && <image href={state.awayTeam.pitcher.imagePath} x="30" y="756" width="22" height="30" preserveAspectRatio="xMidYMid slice"/>}
                    <text x="58" y="770" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.awayTeam.pitcher.name.length > 14 ? state.awayTeam.pitcher.name.slice(0, 13) + '\u2026' : state.awayTeam.pitcher.name}</text>
                    <text x="58" y="782" fontSize="8" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.awayTeam.pitcher.control} IP:{state.awayTeam.inningsPitched}/{state.awayTeam.pitcher.ip}</text>
                </g>
                {/* Away expand button */}
                <g cursor="pointer" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="14" y="793" width="192" height="24" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="110" y="809" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
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
                    const isOnDeck = state.halfInning === 'top' && i === state.homeTeam.currentBatterIndex;
                    return (
                        <g key={`home-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="1194" y={y} width="192" height="48" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2 : isOnDeck ? 1.5 : 0.5}/>
                            <text x="1207" y={y + 30} fontSize="13" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="1222" y={y + 2} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="1258" y={y + 18} fontSize="10" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="1258" y={y + 30} fontSize="9" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}{player.fielding ? ` +${player.fielding}` : ''}</text>
                            {player.icons && player.icons.length > 0 && renderIcons(player, state.homeTeam, 1258, y + 42)}
                        </g>
                    );
                })}
                {/* Home pitcher */}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.homeTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x="1194" y="754" width="192" height="36" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x="1200" y="768" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.homeTeam.pitcher.imagePath && <image href={state.homeTeam.pitcher.imagePath} x="1210" y="756" width="22" height="30" preserveAspectRatio="xMidYMid slice"/>}
                    <text x="1238" y="770" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.homeTeam.pitcher.name.length > 14 ? state.homeTeam.pitcher.name.slice(0, 13) + '\u2026' : state.homeTeam.pitcher.name}</text>
                    <text x="1238" y="782" fontSize="8" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.homeTeam.pitcher.control} IP:{state.homeTeam.inningsPitched}/{state.homeTeam.pitcher.ip}</text>
                </g>
                {/* Home expand button */}
                <g cursor="pointer" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x="1194" y="793" width="192" height="24" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="1290" y="809" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
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

                {/* Base markers with runner info */}
                <rect x="1029" y="554" width="22" height="22" rx="3" fill={runner1 ? '#4ade80' : 'white'} stroke={runner1 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,1040,565)" filter="url(#dropShadow)"/>
                {runner1 && (
                    <g>
                        <rect x="1060" y="545" width="110" height="30" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="1115" y="558" textAnchor="middle" fontSize="9" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner1.name.length > 14 ? runner1.name.slice(0, 13) + '\u2026' : runner1.name}</text>
                        <text x="1115" y="571" textAnchor="middle" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner1.speed}</text>
                    </g>
                )}
                <rect x="689" y="214" width="22" height="22" rx="3" fill={runner2 ? '#4ade80' : 'white'} stroke={runner2 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,700,225)" filter="url(#dropShadow)"/>
                {runner2 && (
                    <g>
                        <rect x="725" y="205" width="110" height="30" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="780" y="218" textAnchor="middle" fontSize="9" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner2.name.length > 14 ? runner2.name.slice(0, 13) + '\u2026' : runner2.name}</text>
                        <text x="780" y="231" textAnchor="middle" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner2.speed}</text>
                    </g>
                )}
                <rect x="349" y="554" width="22" height="22" rx="3" fill={runner3 ? '#4ade80' : 'white'} stroke={runner3 ? '#22c55e' : '#cccccc'} strokeWidth="1.5" transform="rotate(45,360,565)" filter="url(#dropShadow)"/>
                {runner3 && (
                    <g>
                        <rect x="230" y="545" width="110" height="30" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="285" y="558" textAnchor="middle" fontSize="9" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner3.name.length > 14 ? runner3.name.slice(0, 13) + '\u2026' : runner3.name}</text>
                        <text x="285" y="571" textAnchor="middle" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner3.speed}</text>
                    </g>
                )}

                {/* ====== CARD SLOTS (hoverable) ====== */}
                <CardSlot x={662} y={178} label="2B" card={runner2} labelBelow={true} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={1006} y={512} label="1B" card={runner1} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={318} y={512} label="3B" card={runner3} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={662} y={512} label="P" card={pitcher} labelBelow={true} labelText="PITCHER" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={662} y={783} label="H" card={batter} labelAbove={true} labelText="HITTER" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>

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

                {/* ====== STEAL RESULT OVERLAY ====== */}
                {state.pendingStealResult && (
                    <g>
                        <rect x="440" y="340" width="260" height="50" rx="6" fill={state.pendingStealResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x="570" y="362" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingStealResult.safe ? `${state.pendingStealResult.runnerName} SAFE!` : `${state.pendingStealResult.runnerName} CAUGHT STEALING!`}
                        </text>
                        <text x="570" y="382" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingStealResult.runnerSpeed} vs d20({state.pendingStealResult.roll})+Arm={state.pendingStealResult.defenseTotal}
                        </text>
                    </g>
                )}

                {/* ====== ACTION BUTTONS ====== */}
                <ActionButtons
                    state={state}
                    myRole={myRole}
                    isMyTurn={isMyTurn && !diceAnimating}
                    iAmBatting={iAmBatting}
                    onAction={onAction}
                    battingTeam={battingTeam}
                    fieldingTeam={fieldingTeam}
                    hasRunners={hasRunners}
                    outcomeNames={outcomeNames}
                    onShowSubPanel={() => setShowSubPanel(true)}
                />
            </svg>

            {/* Dice roll animation — blocks interaction during roll */}
            <DiceRoll
                roll={state.lastRoll}
                rollType={state.lastRollType}
                triggerKey={rollKey}
                onAnimationComplete={handleDiceComplete}
            />

            {/* Toggle buttons — positioned in gold header area */}
            <button className="overlay-toggle" style={{ position: 'absolute', top: '8px', right: '120px', zIndex: 800 }} onClick={() => { setShowGameLog(!showGameLog); setShowStats(false); }}>
                {showGameLog ? 'CLOSE LOG' : 'GAME LOG'}
            </button>
            <button className="overlay-toggle" style={{ position: 'absolute', top: '8px', right: '16px', zIndex: 800 }} onClick={() => { setShowStats(!showStats); setShowGameLog(false); }}>
                {showStats ? 'CLOSE STATS' : 'BOX SCORE'}
            </button>

            {/* Game Log Overlay */}
            {showGameLog && (
                <GameLogOverlay gameLog={state.gameLog} onClose={() => setShowGameLog(false)} />
            )}

            {/* Box Score / Stats Overlay */}
            {showStats && (
                <div className="overlay-panel" style={{ minWidth: 650 }}>
                    <div className="overlay-panel-header">
                        <span className="overlay-panel-title">BOX SCORE</span>
                        <button className="overlay-close" onClick={() => setShowStats(false)}>CLOSE</button>
                    </div>
                    <BoxScore awayTeam={state.awayTeam} homeTeam={state.homeTeam} awayName={awayName} homeName={homeName} />
                </div>
            )}
        </div>
    );
}
