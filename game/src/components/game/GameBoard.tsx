/**
 * MLB Showdown Game Board — Rotated diamond layout with your hand-edited SVG field.
 * Layout: [Top Bar] / [Away Panel | Diamond Field | Home Panel] / [Action Area between panels]
 * viewBox: 2410 x 2100
 */
import { useState, useRef, useCallback } from 'react';
import type { GameState, GameAction, PlayerSlot } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
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
    onExit?: () => void;
}

/*
 * LAYOUT CONSTANTS (viewBox 2410 x 2100)
 *
 * Top bar:      y=0..50,   x=0..2410
 * Away panel:   x=0..290,  y=50..2100
 * Diamond:      x=290..2120, y=50..1880  (diamond SVG translated by (259, -140))
 * Home panel:   x=2120..2410, y=50..2100
 * Action area:  x=290..2120, y=1880..2100
 *
 * Base positions (after translate):
 *   HP:    (455, 1702)
 *   3B:    (477, 591)
 *   2B:    (1608, 591)
 *   1B:    (1608, 1678)
 *   Mound: (1029, 1145)
 */
const PANEL_W = 290;
const DIAMOND_X = PANEL_W;           // 290
const DIAMOND_W = 1830;
const HOME_X = DIAMOND_X + DIAMOND_W; // 2120
const VB_W = HOME_X + PANEL_W;       // 2410
const VB_H = 2100;
const TOP_H = 50;
const FIELD_BOTTOM = 1880;
const ACTION_Y = FIELD_BOTTOM;

// Diamond translate offset (maps diamond SVG origin to game board)
const DX = 259, DY = -140;

// Base centers (in game board coordinates after translate)
const HP  = { x: 196 + DX, y: 1842 + DY };   // (455, 1702)
const B3  = { x: 218 + DX, y: 731 + DY };     // (477, 591)
const B2  = { x: 1349 + DX, y: 731 + DY };    // (1608, 591)
const B1  = { x: 1349 + DX, y: 1818 + DY };   // (1608, 1678)
const MOUND = { x: 770 + DX, y: 1285 + DY };  // (1029, 1145)

// Card slot size
const CW = 90, CH = 126;

export default function GameBoard({ state, myRole, isMyTurn, onAction, homeName, awayName, onExit }: Props) {
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
        SAC: 'SAC BUNT', IBB: 'INTENTIONAL WALK',
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

    const pitcherIp = pitcher.ip || 0;
    const pitcherInningsCompleted = fieldingTeam.inningsPitched || 0;
    const pitcherInningsDisplay = pitcherInningsCompleted + 1;
    const fatigueActive = pitcherInningsDisplay > pitcherIp;
    const hasRunners = !!(state.bases.first || state.bases.second || state.bases.third);

    const rollKey = `${state.lastRollType}-${state.lastRoll}-${state.inning}-${state.halfInning}-${state.outs}-${battingTeam.currentBatterIndex}`;
    const handleDiceComplete = useCallback(() => { setDiceAnimating(false); }, []);
    if (state.lastRoll && rollKey !== prevRollKeyRef.current) {
        prevRollKeyRef.current = rollKey;
        if (!diceAnimating) setDiceAnimating(true);
    }

    // Render icons with usage tracking
    const renderIcons = (player: PlayerSlot, team: typeof state.homeTeam, xPos: number, yPos: number) => {
        if (!player.icons || player.icons.length === 0) return null;
        const usage = team.iconUsage?.[player.cardId] || {};
        const maxUses: Record<string, number> = { V: 2 };
        const items: { icon: string; used: boolean }[] = [];
        for (const icon of player.icons) {
            const max = maxUses[icon] || 1;
            const used = usage[icon] || 0;
            for (let i = 0; i < max; i++) items.push({ icon, used: i < used });
        }
        return (
            <text x={xPos} y={yPos} fontSize="14" fontFamily="Arial" fontWeight="600">
                {items.map((item, i) => (
                    <tspan key={i} fill={item.used ? '#4a3030' : '#d4a018'} textDecoration={item.used ? 'line-through' : 'none'}>
                        {item.icon}{i < items.length - 1 ? ' ' : ''}
                    </tspan>
                ))}
            </text>
        );
    };

    // Render a card slot centered on (cx, cy)
    const renderCardSlot = (cx: number, cy: number, card: PlayerSlot | null, label: string) => {
        const x = cx - CW / 2, y = cy - CH / 2;
        return (
            <g cursor={card ? 'pointer' : undefined}
               onMouseEnter={card ? (e) => handlePlayerHover(card, e.nativeEvent as any) : undefined}
               onMouseLeave={card ? handlePlayerLeave : undefined}>
                <rect x={x + 3} y={y + 3} width={CW} height={CH} rx="6" fill="rgba(0,0,0,0.5)"/>
                <rect x={x} y={y} width={CW} height={CH} rx="6" fill="rgba(0,0,0,0.25)" stroke="#f0e8c0" strokeWidth="2" strokeDasharray="8,5" opacity="0.8"/>
                {!card && (
                    <text x={cx} y={cy + 6} textAnchor="middle" fontSize="18" fill="#f0e8c038" fontWeight="bold" fontFamily="Arial Black">{label}</text>
                )}
                {card && card.imagePath && (
                    <image href={card.imagePath} x={x + 4} y={y + 4} width={CW - 8} height={CH - 8} preserveAspectRatio="xMidYMid slice"/>
                )}
            </g>
        );
    };

    // Runner info tag near a base
    const renderRunnerTag = (runner: PlayerSlot, bx: number, by: number, side: 'left' | 'right') => {
        const tx = side === 'right' ? bx + CW / 2 + 10 : bx - CW / 2 - 140;
        const ty = by - 20;
        return (
            <g>
                <rect x={tx} y={ty} width="130" height="40" rx="5" fill="rgba(0,0,0,0.85)" stroke="#22c55e" strokeWidth="1.5"/>
                <text x={tx + 65} y={ty + 16} textAnchor="middle" fontSize="13" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner.name.length > 14 ? runner.name.slice(0, 13) + '\u2026' : runner.name}</text>
                <text x={tx + 65} y={ty + 32} textAnchor="middle" fontSize="12" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner.speed}</text>
            </g>
        );
    };

    // Lineup row for a panel
    const renderLineupRow = (player: PlayerSlot, i: number, panelX: number, team: typeof state.homeTeam, isHome: boolean) => {
        const y = 200 + i * 80;
        const isAtBat = (isHome ? state.halfInning === 'bottom' : state.halfInning === 'top') && i === team.currentBatterIndex;
        const isOnDeck = (isHome ? state.halfInning === 'top' : state.halfInning === 'bottom') && i === team.currentBatterIndex;
        const posDisplay = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
        const fldDisplay = `+${posDisplay === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0)}`;
        return (
            <g key={`${isHome ? 'h' : 'a'}-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                <rect x={panelX + 8} y={y} width={PANEL_W - 16} height="72" rx="4" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2.5 : isOnDeck ? 2 : 0.5}/>
                <text x={panelX + 22} y={y + 44} fontSize="18" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                {player.imagePath && <image href={player.imagePath} x={panelX + 42} y={y + 4} width="42" height="60" preserveAspectRatio="xMidYMid slice"/>}
                <text x={panelX + 92} y={y + 26} fontSize="15" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 14 ? player.name.slice(0, 13) + '\u2026' : player.name}</text>
                <text x={panelX + 92} y={y + 44} fontSize="13" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}</text>
                {posDisplay && <text x={panelX + PANEL_W - 14} y={y + 26} textAnchor="end" fontSize="13" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{posDisplay} {fldDisplay}</text>}
                {player.icons && player.icons.length > 0 && renderIcons(player, team, panelX + 92, y + 62)}
            </g>
        );
    };

    return (
        <div className="game-board-wrap">
            {/* ====== TOOLTIP ====== */}
            {hoveredPlayer && (
                <div className="player-tooltip" style={{
                    left: hoverPos.x > window.innerWidth * 0.6
                        ? Math.max(0, hoverPos.x - 420)
                        : Math.min(hoverPos.x + 15, window.innerWidth - 420),
                    top: Math.min(hoverPos.y - 100, window.innerHeight - 400),
                }}>
                    <img src={hoveredPlayer.imagePath} alt="" className="tooltip-card-img" />
                    <div className="tooltip-info">
                        <div className="tooltip-name">{hoveredPlayer.name}</div>
                        {hoveredPlayer.type === 'hitter' ? (
                            <div className="tooltip-stats">
                                <span>OB: {hoveredPlayer.onBase}</span>
                                <span>Spd: {hoveredPlayer.speed}</span>
                                {hoveredPlayer.assignedPosition ? <span>{hoveredPlayer.assignedPosition.replace(/-\d+$/, '')} +{hoveredPlayer.assignedPosition.replace(/-\d+$/, '') === 'C' ? (hoveredPlayer.arm ?? 0) : (hoveredPlayer.fielding ?? 0)}</span> : null}
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

            {/* Bullpen panels */}
            {showAwayBullpen && <BullpenPanel team={state.awayTeam} side="away" onClose={() => setShowAwayBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
            {showHomeBullpen && <BullpenPanel team={state.homeTeam} side="home" onClose={() => setShowHomeBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}

            {/* Sub panel */}
            {showSubPanel && isMyTurn && (
                <div className="bullpen-panel" style={{ left: '50%', bottom: '80px', transform: 'translateX(-50%)', zIndex: 600 }}>
                    {state.phase === 'pre_atbat' && iAmBatting && (
                        <>
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT PINCH HITTER &#x25B2;</div>
                            <div className="bp-cards">
                                {battingTeam.bench.filter(p => {
                                    if (!p.isBackup) return true;
                                    const isHomeBatting = state.halfInning === 'bottom';
                                    return isHomeBatting ? state.inning >= 6 : state.inning >= 7;
                                }).map((p, i) => (
                                    <div key={`ph-${i}`} className="bp-card" onClick={() => { onAction({ type: 'PINCH_HIT', benchCardId: p.cardId, lineupIndex: battingTeam.currentBatterIndex }); setShowSubPanel(false); }}>
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
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT RELIEVER &#x25B2;</div>
                            <div className="bp-cards">
                                {fieldingTeam.bullpen.filter(p => p.role !== 'Starter').map((p, i) => (
                                    <div key={`pc-${i}`} className="bp-card" onClick={() => { onAction({ type: 'PITCHING_CHANGE', bullpenCardId: p.cardId }); setShowSubPanel(false); }}>
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

            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="game-board-svg">
                <defs>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f0c840"/><stop offset="45%" stopColor="#d4a018"/><stop offset="100%" stopColor="#a07808"/>
                    </linearGradient>
                    <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e42a0"/><stop offset="100%" stopColor="#060e2a"/>
                    </linearGradient>
                    <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d42020"/><stop offset="100%" stopColor="#7a0808"/>
                    </linearGradient>
                    <linearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0c1e3a"/><stop offset="100%" stopColor="#060f1e"/>
                    </linearGradient>
                    <linearGradient id="scoreBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0e2248"/><stop offset="100%" stopColor="#07101e"/>
                    </linearGradient>
                    <linearGradient id="actionBg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0a1832"/><stop offset="100%" stopColor="#050c1a"/>
                    </linearGradient>
                    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="2" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.7)"/>
                    </filter>
                    <clipPath id="fieldClip">
                        <rect x={DIAMOND_X} y={TOP_H} width={DIAMOND_W} height={FIELD_BOTTOM - TOP_H}/>
                    </clipPath>
                </defs>

                {/* Background */}
                <rect width={VB_W} height={VB_H} fill="#050c1a"/>

                {/* ====== TOP BAR ====== */}
                <rect x="0" y="0" width={VB_W} height={TOP_H} fill="url(#scoreBg)"/>
                <line x1="0" y1={TOP_H} x2={VB_W} y2={TOP_H} stroke="url(#goldGrad)" strokeWidth="2"/>

                {/* Logo */}
                <rect x="4" y="4" width="160" height="42" rx="5" fill="url(#goldGrad)"/>
                <text x="84" y="22" textAnchor="middle" fontSize="11" fill="#002868" fontWeight="900" letterSpacing="2" fontFamily="Impact,sans-serif">MLB</text>
                <text x="84" y="40" textAnchor="middle" fontSize="15" fill="#002868" fontWeight="900" letterSpacing="2" fontFamily="Impact,sans-serif">SHOWDOWN</text>

                {/* Compact scoreboard */}
                <rect x="175" y="4" width="90" height="20" rx="2" fill="#002868"/>
                <text x="220" y="18" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Arial">TEAM</text>
                <rect x="175" y="25" width="90" height="20" fill="#0c1a40"/>
                <text x="220" y="39" textAnchor="middle" fontSize="10" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{awayName.slice(0, 10).toUpperCase()}</text>

                {innings.slice(0, 9).map((inn, i) => (
                    <g key={`sb-${inn}`}>
                        <rect x={266 + i * 34} y="4" width="34" height="20" fill={i % 2 === 0 ? '#002868' : '#001e50'}/>
                        <text x={283 + i * 34} y="18" textAnchor="middle" fontSize="11" fill="#c8d8f8" fontWeight="bold" fontFamily="Arial">{inn}</text>
                        <rect x={266 + i * 34} y="25" width="34" height="20" fill={i % 2 === 0 ? '#0a1830' : '#071024'}/>
                        <text x={283 + i * 34} y="40" textAnchor="middle" fontSize="12" fill={state.awayTeam.runsPerInning[i] !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">
                            {state.awayTeam.runsPerInning[i] ?? '\u2014'}
                        </text>
                    </g>
                ))}

                {/* R / H */}
                <rect x="572" y="4" width="36" height="20" rx="2" fill="#9a0000"/>
                <text x="590" y="18" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">R</text>
                <rect x="572" y="25" width="36" height="20" fill="#3a0a0a"/>
                <text x="590" y="40" textAnchor="middle" fontSize="14" fill="white" fontWeight="bold" fontFamily="Impact">{state.score.away}</text>
                <rect x="609" y="4" width="36" height="20" rx="2" fill="#7a0000"/>
                <text x="627" y="18" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">H</text>
                <rect x="609" y="25" width="36" height="20" fill="#081222"/>
                <text x="627" y="40" textAnchor="middle" fontSize="14" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{state.awayTeam.hits || 0}</text>

                {/* Inning / Half */}
                <line x1="655" y1="6" x2="655" y2="44" stroke="#d4a01870" strokeWidth="1"/>
                <rect x="662" y="6" width="38" height="38" rx="5" fill="#040c1a" stroke="#d4a018" strokeWidth="1"/>
                <text x="681" y="32" textAnchor="middle" fontSize="26" fill="white" fontWeight="900" fontFamily="Impact">{state.inning}</text>
                <rect x="704" y="6" width="34" height="18" rx="3" fill={state.halfInning === 'top' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'top' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                <text x="721" y="19" textAnchor="middle" fontSize="9" fill={state.halfInning === 'top' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">TOP</text>
                <rect x="704" y="26" width="34" height="18" rx="3" fill={state.halfInning === 'bottom' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'bottom' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                <text x="721" y="39" textAnchor="middle" fontSize="9" fill={state.halfInning === 'bottom' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">BOT</text>

                {/* Outs */}
                <line x1="746" y1="6" x2="746" y2="44" stroke="#d4a01850" strokeWidth="1"/>
                <text x="755" y="12" fontSize="7" fill="#d4a018" fontWeight="bold" letterSpacing="1" fontFamily="Arial Black">OUTS</text>
                {[0, 1, 2].map(i => (
                    <g key={`out-${i}`}>
                        <circle cx={770 + i * 28} cy="32" r="12" fill={state.outs > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="1.5"/>
                        <circle cx={770 + i * 28} cy="32" r="7" fill={state.outs > i ? '#ff3030' : '#0e0408'}/>
                    </g>
                ))}

                {/* Log / Score / Exit buttons */}
                <g cursor="pointer" onClick={() => { setShowGameLog(!showGameLog); setShowStats(false); }}>
                    <rect x={VB_W - 240} y="6" width="60" height="18" rx="3" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x={VB_W - 210} y="19" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showGameLog ? 'CLOSE' : 'LOG'}</text>
                </g>
                <g cursor="pointer" onClick={() => { setShowStats(!showStats); setShowGameLog(false); }}>
                    <rect x={VB_W - 170} y="6" width="70" height="18" rx="3" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x={VB_W - 135} y="19" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showStats ? 'CLOSE' : 'SCORE'}</text>
                </g>
                {onExit && (
                    <g cursor="pointer" onClick={onExit}>
                        <rect x={VB_W - 90} y="6" width="80" height="18" rx="3" fill="#3a0a0a" stroke="#e94560" strokeWidth="1"/>
                        <text x={VB_W - 50} y="19" textAnchor="middle" fontSize="9" fill="#e94560" fontWeight="bold" fontFamily="Arial">EXIT GAME</text>
                    </g>
                )}

                {/* ====== LEFT PANEL — AWAY ====== */}
                <rect x="0" y={TOP_H} width={PANEL_W} height={VB_H - TOP_H} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x="4" y={TOP_H + 4} width={PANEL_W - 8} height="36" rx="4" fill="url(#navyGrad)"/>
                <text x={PANEL_W / 2} y={TOP_H + 28} textAnchor="middle" fontSize="18" fill="white" fontWeight="900" letterSpacing="5" fontFamily="Impact,sans-serif">AWAY</text>
                <rect x="4" y={TOP_H + 44} width={PANEL_W - 8} height="26" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="0.5"/>
                <text x={PANEL_W / 2} y={TOP_H + 62} textAnchor="middle" fontSize="12" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{awayName.toUpperCase()}</text>
                <text x={PANEL_W / 2} y={TOP_H + 88} textAnchor="middle" fontSize="12" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>
                {state.awayTeam.lineup.map((player, i) => renderLineupRow(player, i, 0, state.awayTeam, false))}

                {/* Away pitcher */}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.awayTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x="8" y="920" width={PANEL_W - 16} height="40" rx="4" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x="16" y="944" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.awayTeam.pitcher.imagePath && <image href={state.awayTeam.pitcher.imagePath} x="30" y="923" width="28" height="34" preserveAspectRatio="xMidYMid slice"/>}
                    <text x="66" y="940" fontSize="13" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.awayTeam.pitcher.name.length > 12 ? state.awayTeam.pitcher.name.slice(0, 11) + '\u2026' : state.awayTeam.pitcher.name}</text>
                    <text x="66" y="956" fontSize="11" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.awayTeam.pitcher.control} IP:{(state.awayTeam.inningsPitched || 0) + 1}/{state.awayTeam.pitcher.ip}</text>
                </g>
                <g cursor="pointer" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="8" y="965" width={PANEL_W - 16} height="26" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x={PANEL_W / 2} y="982" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== RIGHT PANEL — HOME ====== */}
                <rect x={HOME_X} y={TOP_H} width={PANEL_W} height={VB_H - TOP_H} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x={HOME_X + 4} y={TOP_H + 4} width={PANEL_W - 8} height="36" rx="4" fill="url(#redGrad)"/>
                <text x={HOME_X + PANEL_W / 2} y={TOP_H + 28} textAnchor="middle" fontSize="18" fill="white" fontWeight="900" letterSpacing="5" fontFamily="Impact,sans-serif">HOME</text>
                <rect x={HOME_X + 4} y={TOP_H + 44} width={PANEL_W - 8} height="26" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="0.5"/>
                <text x={HOME_X + PANEL_W / 2} y={TOP_H + 62} textAnchor="middle" fontSize="12" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{homeName.toUpperCase()}</text>
                <text x={HOME_X + PANEL_W / 2} y={TOP_H + 88} textAnchor="middle" fontSize="12" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>
                {state.homeTeam.lineup.map((player, i) => renderLineupRow(player, i, HOME_X, state.homeTeam, true))}

                {/* Home pitcher */}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.homeTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x={HOME_X + 8} y="920" width={PANEL_W - 16} height="40" rx="4" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x={HOME_X + 16} y="944" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.homeTeam.pitcher.imagePath && <image href={state.homeTeam.pitcher.imagePath} x={HOME_X + 30} y="923" width="28" height="34" preserveAspectRatio="xMidYMid slice"/>}
                    <text x={HOME_X + 66} y="940" fontSize="13" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.homeTeam.pitcher.name.length > 12 ? state.homeTeam.pitcher.name.slice(0, 11) + '\u2026' : state.homeTeam.pitcher.name}</text>
                    <text x={HOME_X + 66} y="956" fontSize="11" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.homeTeam.pitcher.control} IP:{(state.homeTeam.inningsPitched || 0) + 1}/{state.homeTeam.pitcher.ip}</text>
                </g>
                <g cursor="pointer" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x={HOME_X + 8} y="965" width={PANEL_W - 16} height="26" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x={HOME_X + PANEL_W / 2} y="982" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== DIAMOND FIELD (translated SVG paths) ====== */}
                <g transform={`translate(${DX}, ${DY})`} clipPath="url(#fieldClip)">
                    {/* Background grass rect */}
                    <rect x="31.455" y="189.888" width="1830" height="1830" fill="rgb(65,156,63)"/>
                    {/* Outfield dirt + foul territory */}
                    <path fill="rgb(203,145,77)" d="M 161.456 340.85 C 236.09 309.545 287.723 285.02 287.723 285.02 C 287.723 285.02 505.579 221.841 555.281 215.348 C 764.876 187.182 978.157 217.823 1171.37 303.857 C 1447.38 428.065 1662.63 657.132 1769.66 940.487 C 1850.9 1156.94 1864.42 1393.04 1808.36 1617.37 C 1789.75 1691.3 1765.98 1755.02 1735.16 1824.23 C 1732.48 1830.4 1729.59 1836.46 1726.52 1842.46 C 1725.34 1844.92 1722.97 1850.37 1721.71 1852.52 C 1716.9 1861.78 1711.35 1874.77 1706.86 1884.48 C 1669.04 1885.97 1623.05 1884.77 1584.73 1884.78 L 1354.07 1884.8 L 688.131 1885.69 C 617.928 1886 547.725 1885.94 477.513 1885.53 C 449.972 1885.17 422.422 1884.95 394.872 1884.92 C 378.994 1884.87 359.079 1884.3 343.639 1885.81 C 340.736 1902.65 333.319 1919.16 324.321 1933.6 C 302.428 1968.12 267.818 1992.6 228 2001.73 C 147.228 2019.72 63.434 1965.44 45.955 1884.64 C 37.097 1845.1 44.742 1803.65 67.132 1769.88 C 86.738 1739.89 126.349 1711.49 160.908 1704.11 C 159.506 1685.9 159.865 1660.47 159.745 1641.9 L 159.616 1530.49 L 160.073 1219.36 L 160.66 713.474 C 160.63 590.134 159.665 464.071 161.456 340.85 Z"/>
                    {/* Foul lines + base paths (white) */}
                    <path fill="rgb(254,254,248)" d="M 182.586 331.717 C 197.127 326.783 192.546 326.852 192.546 326.852 L 196.998 1615.42 C 197.036 1648.9 199.147 1699.41 195.916 1731.52 C 208.744 1744.53 221.448 1757.65 234.027 1770.9 C 222.647 1782.35 211.38 1793.91 200.23 1805.58 C 209.481 1813.84 223.745 1825.76 229.7 1836.43 L 231.145 1836.61 C 242.258 1826.27 256.635 1813.5 266.965 1802.61 C 276.207 1812.11 295.466 1832.58 305.604 1840.28 L 1317.96 1840.34 C 1485.32 1840.193 1730.16 1839.724 1730.16 1839.724 C 1724.311 1852.629 1724.403 1853.461 1724.348 1852.866 L 1332.49 1852.29 L 309.572 1853.41 C 285.646 1874.97 259.632 1904.34 235.45 1927.5 C 224.447 1917.57 213.56 1906.41 203.003 1895.9 C 190.128 1906.45 168.472 1928.98 156.477 1941.2 C 141.207 1928.98 109.054 1896.12 96.942 1881.26 C 105.804 1869.24 130.219 1846.6 141.913 1835.29 C 131.419 1823.22 120.271 1812.18 109.021 1800.84 C 122.32 1782.94 166.24 1742.15 183.947 1724.86 C 183.947 1724.86 184.005 1072.309 183.981 746.034 C 183.971 617.636 182.586 331.717 182.586 331.717 Z"/>
                    {/* Home plate area details */}
                    <path fill="rgb(203,145,77)" d="M 115.212 1884.39 C 123.005 1874.26 137.002 1858.82 147.632 1851.88 C 159.163 1844.35 166.909 1840.52 177.845 1831.44 C 179.782 1837.75 181.825 1844.02 183.972 1850.26 C 192.697 1858.66 198.851 1858.19 210.187 1857.73 L 211.149 1859.3 C 191.283 1875.6 199.127 1875.5 186.392 1895.1 C 182.035 1901.81 163.297 1919.23 156.85 1925.39 C 142.626 1913.41 129.596 1897.25 115.212 1884.39 z"/>
                    <path fill="rgb(221,220,214)" d="M 229.7 1838.1 L 231.145 1838.28 C 225.155 1845.58 217.608 1852.28 211.149 1859.3 L 210.187 1857.73 C 212.621 1853.54 225.639 1841.11 229.7 1838.1 z"/>
                    <path fill="rgb(203,145,77)" d="M 186.923 1742.67 C 193.876 1747.32 210.009 1765.31 216.187 1772.04 C 196.84 1791.99 177.174 1811.63 157.195 1830.95 C 147.115 1822.6 136.669 1811.42 127.648 1801.88 L 186.923 1742.67 z"/>
                    <path fill="rgb(203,145,77)" d="M 266.607 1822.88 C 276.017 1831.62 285.985 1842.19 295.06 1851.46 L 236.619 1909.92 C 229.208 1904.27 215.036 1890.07 207.626 1883.09 C 227.467 1863.16 246.402 1842.92 266.607 1822.88 z"/>
                    <path fill="rgb(221,220,214)" d="M 194.165 1813.83 L 194.503 1815.4 C 193.625 1817.92 185.292 1825.99 182.768 1828.7 L 182.538 1826.12 C 184.963 1822.06 190.567 1817.26 194.165 1813.83 z"/>
                    {/* Infield grass */}
                    <path fill="rgb(65,156,63)" d="M 1132.11 786.381 C 1145.61 786.396 1159.09 786.252 1172.57 785.949 C 1185.93 813.756 1193.33 845.101 1219.75 865.817 C 1239.86 881.588 1266.63 892.383 1291.14 900.525 L 1291.06 1651.54 C 1278.13 1654.14 1265.59 1658.27 1253.71 1663.8 C 1205.26 1686.68 1188.93 1718.8 1172.7 1764.99 L 430.362 1765.07 L 391.152 1765.1 C 364.09 1693.45 345.391 1677.54 271.255 1650.68 C 269.5 1401.31 269.463 1151.92 271.145 902.543 C 346.691 871.364 362.201 863.447 391.521 786.705 L 1132.11 786.381 Z"/>
                    {/* Pitcher's mound */}
                    <path fill="rgb(203,145,77)" d="M 762.163 1166.41 C 827.854 1162.28 884.383 1212.34 888.222 1278.05 C 892.061 1343.76 841.748 1400.07 776.023 1403.62 C 710.705 1407.15 654.823 1357.21 651.007 1291.91 C 647.192 1226.61 696.879 1170.51 762.163 1166.41 Z"/>
                    <path fill="rgb(254,254,248)" d="M 754.124 1260.5 C 759.628 1263.93 792.2 1295.65 799.286 1302.41 L 786.641 1315.18 C 777.72 1311.58 749.945 1280.99 742.113 1272.5 C 745.904 1268.52 750.2 1264.4 754.124 1260.5 Z"/>
                    {/* Base markers (2B, 3B, 1B) */}
                    <path fill="rgb(254,254,248)" d="M 1325.05 707.235 C 1339.71 706.882 1358.53 706.892 1372.97 707.506 L 1372.92 754.147 L 1325 754.037 L 1325.05 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 193.754 707.235 C 208.414 706.882 227.234 706.892 241.674 707.506 L 241.624 754.147 L 193.704 754.037 L 193.754 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 1325.05 1794.28 C 1339.71 1793.93 1358.53 1793.94 1372.97 1794.55 L 1372.92 1841.2 L 1325 1841.08 L 1325.05 1794.28 Z"/>
                </g>

                {/* ====== CARD SLOTS (centered on bases) ====== */}
                {renderCardSlot(HP.x, HP.y, batter, 'H')}
                {renderCardSlot(MOUND.x, MOUND.y, pitcher, 'P')}
                {renderCardSlot(B1.x, B1.y, runner1, '1B')}
                {renderCardSlot(B2.x, B2.y, runner2, '2B')}
                {renderCardSlot(B3.x, B3.y, runner3, '3B')}

                {/* Runner info tags */}
                {runner1 && renderRunnerTag(runner1, B1.x, B1.y, 'right')}
                {runner2 && renderRunnerTag(runner2, B2.x, B2.y, 'right')}
                {runner3 && renderRunnerTag(runner3, B3.x, B3.y, 'left')}

                {/* IP / Fatigue badge near pitcher */}
                <rect x={MOUND.x - 50} y={MOUND.y + CH / 2 + 8} width="100" height="24" rx="5" fill="rgba(0,0,0,0.8)"/>
                <text x={MOUND.x} y={MOUND.y + CH / 2 + 25} textAnchor="middle" fontSize="14" fill={fatigueActive ? '#ff6060' : '#8aade0'} fontWeight="bold" fontFamily="monospace">
                    IP: {pitcherInningsDisplay}/{pitcherIp}{fatigueActive ? ` (-${pitcherInningsDisplay - pitcherIp})` : ''}
                </text>

                {/* ====== RESULT OVERLAYS (on field) ====== */}
                {state.lastOutcome && state.phase !== 'result_icons' && (
                    <g>
                        <rect x={MOUND.x - 130} y={MOUND.y - 220} width="260" height="55" rx="8" fill={
                            ['SO','GB','FB','PU'].includes(state.lastOutcome) ? 'rgba(200,30,30,0.9)' :
                            state.lastOutcome === 'HR' ? 'rgba(233,69,96,0.95)' : 'rgba(34,180,80,0.9)'
                        }/>
                        <text x={MOUND.x} y={MOUND.y - 185} textAnchor="middle" fontSize="28" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">
                            {outcomeNames[state.lastOutcome] || state.lastOutcome}
                        </text>
                    </g>
                )}

                {state.pendingDpResult && (
                    <g>
                        <rect x={MOUND.x - 140} y={MOUND.y - 150} width="280" height="55" rx="6" fill={state.pendingDpResult.isDP ? 'rgba(200,30,30,0.9)' : 'rgba(34,180,80,0.9)'}/>
                        <text x={MOUND.x} y={MOUND.y - 125} textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">{state.pendingDpResult.isDP ? 'DOUBLE PLAY!' : 'DP AVOIDED'}</text>
                        <text x={MOUND.x} y={MOUND.y - 105} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            d20({state.pendingDpResult.roll})+IF({state.pendingDpResult.defenseTotal - state.pendingDpResult.roll})={state.pendingDpResult.defenseTotal} vs Spd {state.pendingDpResult.offenseSpeed}
                        </text>
                    </g>
                )}

                {state.pendingExtraBaseResult && (
                    <g>
                        <rect x={MOUND.x - 160} y={MOUND.y - 150} width="320" height="55" rx="6" fill={state.pendingExtraBaseResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x={MOUND.x} y={MOUND.y - 125} textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingExtraBaseResult.safe ? `${state.pendingExtraBaseResult.runnerName} SAFE!` : `${state.pendingExtraBaseResult.runnerName} OUT!`}
                        </text>
                        <text x={MOUND.x} y={MOUND.y - 105} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingExtraBaseResult.runnerSpeed} vs d20({state.pendingExtraBaseResult.roll})+OF={state.pendingExtraBaseResult.defenseTotal}
                        </text>
                    </g>
                )}

                {state.pendingStealResult && (
                    <g>
                        <rect x={MOUND.x - 170} y={MOUND.y - 150} width="340" height="55" rx="6" fill={state.pendingStealResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x={MOUND.x} y={MOUND.y - 125} textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingStealResult.safe ? `${state.pendingStealResult.runnerName} SAFE!` : `${state.pendingStealResult.runnerName} CAUGHT STEALING!`}
                        </text>
                        <text x={MOUND.x} y={MOUND.y - 105} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingStealResult.runnerSpeed} vs d20({state.pendingStealResult.roll})+Arm={state.pendingStealResult.defenseTotal}
                        </text>
                    </g>
                )}

                {/* Pitch info */}
                {state.lastPitchRoll > 0 && (
                    <g>
                        <rect x={MOUND.x + 80} y={MOUND.y - 40} width="220" height="70" rx="6" fill="rgba(0,0,0,0.8)"/>
                        <text x={MOUND.x + 190} y={MOUND.y - 18} textAnchor="middle" fontSize="13" fill="#aaa" fontFamily="monospace">
                            Pitch: {state.lastPitchRoll}+{pitcher.control || 0}{state.fatiguePenalty ? `-${state.fatiguePenalty}` : ''}{state.controlModifier ? `+${state.controlModifier}` : ''}={state.lastPitchTotal} vs OB {batter.onBase}
                        </text>
                        <text x={MOUND.x + 190} y={MOUND.y + 2} textAnchor="middle" fontSize="13" fill={state.usedPitcherChart ? '#60a5fa' : '#4ade80'} fontFamily="monospace" fontWeight="bold">
                            {'\u2192'} {state.usedPitcherChart ? "Pitcher's chart" : "Batter's chart"}
                        </text>
                        {state.lastSwingRoll > 0 && (
                            <text x={MOUND.x + 190} y={MOUND.y + 22} textAnchor="middle" fontSize="13" fill="#ddd" fontFamily="monospace">
                                Swing: {state.lastSwingRoll}
                            </text>
                        )}
                    </g>
                )}

                {/* ====== SEPARATOR ====== */}
                <line x1={DIAMOND_X} y1={FIELD_BOTTOM} x2={HOME_X} y2={FIELD_BOTTOM} stroke="url(#goldGrad)" strokeWidth="2"/>

                {/* ====== ACTION AREA ====== */}
                <rect x={DIAMOND_X} y={ACTION_Y} width={DIAMOND_W} height={VB_H - ACTION_Y} fill="url(#actionBg)"/>

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

            <DiceRoll roll={state.lastRoll} rollType={state.lastRollType} triggerKey={rollKey} onAnimationComplete={handleDiceComplete} />
            {showGameLog && <GameLogOverlay gameLog={state.gameLog} onClose={() => setShowGameLog(false)} />}
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
