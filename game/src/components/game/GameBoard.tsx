/**
 * MLB Showdown Game Board — Rotated diamond field with dedicated action/results area.
 * Layout: [Scoreboard Row] / [Away Panel | Diamond | Home Panel] / [Action Area between panels]
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

    // Guard: if teams aren't loaded yet (e.g. partial state from Supabase), show loading
    if (!battingTeam?.lineup || !fieldingTeam?.lineup) {
        return <div className="game-board-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8aade0' }}>Loading game state...</div>;
    }

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
            <text x={xPos} y={yPos} fontSize="8" fontFamily="Arial" fontWeight="600">
                {items.map((item, i) => (
                    <tspan key={i} fill={item.used ? '#4a3030' : '#d4a018'} textDecoration={item.used ? 'line-through' : 'none'}>
                        {item.icon}{i < items.length - 1 ? ' ' : ''}
                    </tspan>
                ))}
            </text>
        );
    };

    /*
     * LAYOUT:  viewBox 1400 x 950
     * Scoreboard:  y=3..98    (full width)
     * Panels:      y=100..778 (left x=7..287, right x=1113..1393)
     * Diamond:     y=100..778 (center x=287..1113, 826x678)
     * Action area: y=780..940 (center x=287..1113)
     *
     * Diamond transform: scale(0.370) fits 1830 into 677
     * translate(360,100) scale(0.370) translate(-31.455,-189.888)
     *
     * Base positions (game coords):
     *   HP=(421,711) 3B=(429,300) 2B=(848,300) 1B=(848,702) Mound=(633,505)
     */

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
                                            parts.push(<span key={`${i}-${j}`} style={{ textDecoration: j < used ? 'line-through' : 'none', color: j < used ? '#4a3030' : '#d4a018' }}>{icon}</span>);
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
                                return order.filter(([field]) => hoveredPlayer!.chart[field]).map(([field, label]) => (
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
                                    return (state.halfInning === 'bottom') ? state.inning >= 6 : state.inning >= 7;
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

            <svg viewBox="0 0 1400 950" className="game-board-svg">
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
                    <linearGradient id="boardBg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#101e3a"/><stop offset="100%" stopColor="#050c1a"/>
                    </linearGradient>
                    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="2" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.85)"/>
                    </filter>
                    <filter id="cardGlow" x="-80%" y="-80%" width="260%" height="260%">
                        <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="rgba(255,255,210,0.5)"/>
                    </filter>
                    <clipPath id="fieldClip">
                        <rect x="287" y="100" width="826" height="680"/>
                    </clipPath>
                </defs>

                <rect width="1400" height="950" fill="url(#boardBg)"/>
                <rect x="3" y="3" width="1394" height="944" rx="8" fill="none" stroke="url(#goldGrad)" strokeWidth="3"/>

                {/* ====== SCOREBOARD ROW (y=3..98) ====== */}
                <rect x="3" y="3" width="1394" height="95" rx="8" fill="url(#scoreBg)" stroke="#d4a018" strokeWidth="1.5"/>

                {/* Exit button (left) */}
                <g cursor="pointer" className="roll-button" onClick={() => window.history.back()}>
                    <rect x="10" y="8" width="70" height="24" rx="4" fill="#3a0a0a" stroke="#e94560" strokeWidth="1"/>
                    <text x="45" y="24" textAnchor="middle" fontSize="9" fill="#e94560" fontWeight="bold" fontFamily="Arial">EXIT GAME</text>
                </g>

                {/* Team + innings scoreboard */}
                <rect x="90" y="8" width="100" height="18" fill="#002868" rx="2"/>
                <text x="140" y="20" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" fontFamily="Arial">TEAM</text>
                <rect x="90" y="27" width="100" height="28" fill="#0c1a40"/>
                <text x="140" y="43" textAnchor="middle" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{awayName.slice(0, 10).toUpperCase()}</text>
                <rect x="90" y="56" width="100" height="28" fill="#0e0818"/>
                <text x="140" y="73" textAnchor="middle" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{homeName.slice(0, 10).toUpperCase()}</text>

                {innings.slice(0, 9).map((inn, i) => (
                    <g key={`sb-${inn}`}>
                        <rect x={191 + i * 58} y="8" width="58" height="18" fill={i % 2 === 0 ? '#002868' : '#001e50'}/>
                        <text x={220 + i * 58} y="20" textAnchor="middle" fontSize="9" fill="#c8d8f8" fontWeight="bold" fontFamily="Arial">{inn}</text>
                        <rect x={191 + i * 58} y="27" width="58" height="28" fill={i % 2 === 0 ? '#0a1830' : '#071024'} stroke="#1a306030" strokeWidth="0.5"/>
                        <text x={220 + i * 58} y="46" textAnchor="middle" fontSize="14" fill={state.awayTeam.runsPerInning[i] !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">{state.awayTeam.runsPerInning[i] ?? '\u2014'}</text>
                        <rect x={191 + i * 58} y="56" width="58" height="28" fill={i % 2 === 0 ? '#0a1830' : '#071024'} stroke="#1a306030" strokeWidth="0.5"/>
                        <text x={220 + i * 58} y="75" textAnchor="middle" fontSize="14" fill={state.homeTeam.runsPerInning[i] !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">{state.homeTeam.runsPerInning[i] ?? '\u2014'}</text>
                    </g>
                ))}

                {/* R / H */}
                <rect x="713" y="8" width="50" height="18" fill="#9a0000" rx="2"/>
                <text x="738" y="20" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" fontFamily="Arial">R</text>
                <rect x="713" y="27" width="50" height="28" fill="#3a0a0a"/>
                <text x="738" y="46" textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">{state.score.away}</text>
                <rect x="713" y="56" width="50" height="28" fill="#3a0a0a"/>
                <text x="738" y="75" textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">{state.score.home}</text>

                <rect x="764" y="8" width="50" height="18" fill="#7a0000" rx="2"/>
                <text x="789" y="20" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" fontFamily="Arial">H</text>
                <rect x="764" y="27" width="50" height="28" fill="#081222"/>
                <text x="789" y="46" textAnchor="middle" fontSize="16" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{state.awayTeam.hits || 0}</text>
                <rect x="764" y="56" width="50" height="28" fill="#081222"/>
                <text x="789" y="75" textAnchor="middle" fontSize="16" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{state.homeTeam.hits || 0}</text>

                {/* Inning / Half */}
                <line x1="824" y1="10" x2="824" y2="86" stroke="#d4a01850" strokeWidth="1"/>
                <text x="835" y="16" fontSize="7" fill="#d4a018" fontWeight="bold" letterSpacing="1" fontFamily="Arial Black">INNING</text>
                <rect x="835" y="22" width="48" height="48" rx="5" fill="#040c1a" stroke="#d4a018" strokeWidth="1.5"/>
                <text x="859" y="58" textAnchor="middle" fontSize="32" fill="white" fontWeight="900" fontFamily="Impact">{state.inning}</text>
                <rect x="888" y="22" width="50" height="22" rx="4" fill={state.halfInning === 'top' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'top' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                <text x="913" y="38" textAnchor="middle" fontSize="10" fill={state.halfInning === 'top' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">TOP</text>
                <rect x="888" y="48" width="50" height="22" rx="4" fill={state.halfInning === 'bottom' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'bottom' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                <text x="913" y="64" textAnchor="middle" fontSize="10" fill={state.halfInning === 'bottom' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">BOT</text>

                {/* Outs */}
                <line x1="944" y1="10" x2="944" y2="86" stroke="#d4a01850" strokeWidth="1"/>
                <text x="955" y="16" fontSize="7" fill="#d4a018" fontWeight="bold" letterSpacing="1" fontFamily="Arial Black">OUTS</text>
                {[0, 1, 2].map(i => (
                    <g key={`out-${i}`}>
                        <circle cx={975 + i * 40} cy="50" r="18" fill={state.outs > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="2"/>
                        <circle cx={975 + i * 40} cy="50" r="11" fill={state.outs > i ? '#ff3030' : '#0e0408'} stroke={state.outs > i ? '#ff6060' : '#3a1020'} strokeWidth="0.8"/>
                    </g>
                ))}

                {/* Log / Score buttons */}
                <g cursor="pointer" onClick={() => { setShowGameLog(!showGameLog); setShowStats(false); }}>
                    <rect x="1280" y="10" width="50" height="32" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x="1305" y="22" textAnchor="middle" fontSize="7" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showGameLog ? 'CLOSE' : 'GAME'}</text>
                    <text x="1305" y="34" textAnchor="middle" fontSize="7" fill="#d4a018" fontWeight="bold" fontFamily="Arial">LOG</text>
                </g>
                <g cursor="pointer" onClick={() => { setShowStats(!showStats); setShowGameLog(false); }}>
                    <rect x="1336" y="10" width="50" height="32" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x="1361" y="22" textAnchor="middle" fontSize="7" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showStats ? 'CLOSE' : 'BOX'}</text>
                    <text x="1361" y="34" textAnchor="middle" fontSize="7" fill="#d4a018" fontWeight="bold" fontFamily="Arial">SCORE</text>
                </g>

                {/* ====== SEPARATOR ====== */}
                <line x1="7" y1="99" x2="1393" y2="99" stroke="#d4a018" strokeWidth="2"/>

                {/* ====== LEFT PANEL — AWAY (y=100..778) ====== */}
                <rect x="7" y="100" width="280" height="678" rx="4" fill="url(#panelBg)" stroke="#d4a01840" strokeWidth="1"/>
                <rect x="10" y="103" width="274" height="32" rx="3" fill="url(#navyGrad)"/>
                <text x="147" y="124" textAnchor="middle" fontSize="14" fill="white" fontWeight="900" letterSpacing="4" fontFamily="Impact,sans-serif">AWAY</text>
                <rect x="10" y="139" width="274" height="24" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="1"/>
                <text x="147" y="156" textAnchor="middle" fontSize="10" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{awayName.toUpperCase()}</text>
                <text x="147" y="178" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>

                {state.awayTeam.lineup.map((player, i) => {
                    const y = 186 + i * 48;
                    const isAtBat = state.halfInning === 'top' && i === state.awayTeam.currentBatterIndex;
                    const isOnDeck = state.halfInning === 'bottom' && i === state.awayTeam.currentBatterIndex;
                    const posDisplay = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
                    const fldDisplay = `+${player.assignedPosition === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0)}`;
                    return (
                        <g key={`away-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="14" y={y} width="266" height="44" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2 : isOnDeck ? 1.5 : 0.5}/>
                            <text x="27" y={y + 28} fontSize="12" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="42" y={y + 2} width="28" height="40" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="76" y={y + 16} fontSize="9" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="76" y={y + 28} fontSize="8" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}</text>
                            {posDisplay && <text x="274" y={y + 16} textAnchor="end" fontSize="8" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{posDisplay} {fldDisplay}</text>}
                            {player.icons && player.icons.length > 0 && renderIcons(player, state.awayTeam, 76, y + 40)}
                        </g>
                    );
                })}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.awayTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x="14" y="618" width="266" height="32" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x="20" y="638" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.awayTeam.pitcher.imagePath && <image href={state.awayTeam.pitcher.imagePath} x="30" y="620" width="20" height="28" preserveAspectRatio="xMidYMid slice"/>}
                    <text x="56" y="634" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.awayTeam.pitcher.name.length > 14 ? state.awayTeam.pitcher.name.slice(0, 13) + '\u2026' : state.awayTeam.pitcher.name}</text>
                    <text x="56" y="646" fontSize="7" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.awayTeam.pitcher.control} IP:{(state.awayTeam.inningsPitched || 0) + 1}/{state.awayTeam.pitcher.ip}</text>
                </g>
                <g cursor="pointer" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="14" y="654" width="266" height="22" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="147" y="669" textAnchor="middle" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== RIGHT PANEL — HOME ====== */}
                <rect x="1113" y="100" width="280" height="678" rx="4" fill="url(#panelBg)" stroke="#d4a01840" strokeWidth="1"/>
                <rect x="1116" y="103" width="274" height="32" rx="3" fill="url(#redGrad)"/>
                <text x="1253" y="124" textAnchor="middle" fontSize="14" fill="white" fontWeight="900" letterSpacing="4" fontFamily="Impact,sans-serif">HOME</text>
                <rect x="1116" y="139" width="274" height="24" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="1"/>
                <text x="1253" y="156" textAnchor="middle" fontSize="10" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{homeName.toUpperCase()}</text>
                <text x="1253" y="178" textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>

                {state.homeTeam.lineup.map((player, i) => {
                    const y = 186 + i * 48;
                    const isAtBat = state.halfInning === 'bottom' && i === state.homeTeam.currentBatterIndex;
                    const isOnDeck = state.halfInning === 'top' && i === state.homeTeam.currentBatterIndex;
                    const posDisplay = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
                    const fldDisplay = `+${player.assignedPosition === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0)}`;
                    return (
                        <g key={`home-slot-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                            <rect x="1120" y={y} width="266" height="44" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2 : isOnDeck ? 1.5 : 0.5}/>
                            <text x="1133" y={y + 28} fontSize="12" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                            {player.imagePath && <image href={player.imagePath} x="1148" y={y + 2} width="28" height="40" preserveAspectRatio="xMidYMid slice"/>}
                            <text x="1182" y={y + 16} fontSize="9" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 16 ? player.name.slice(0, 15) + '\u2026' : player.name}</text>
                            <text x="1182" y={y + 28} fontSize="8" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}</text>
                            {posDisplay && <text x="1380" y={y + 16} textAnchor="end" fontSize="8" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{posDisplay} {fldDisplay}</text>}
                            {player.icons && player.icons.length > 0 && renderIcons(player, state.homeTeam, 1182, y + 40)}
                        </g>
                    );
                })}
                <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(state.homeTeam.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x="1120" y="618" width="266" height="32" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                    <text x="1126" y="638" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                    {state.homeTeam.pitcher.imagePath && <image href={state.homeTeam.pitcher.imagePath} x="1136" y="620" width="20" height="28" preserveAspectRatio="xMidYMid slice"/>}
                    <text x="1162" y="634" fontSize="9" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{state.homeTeam.pitcher.name.length > 14 ? state.homeTeam.pitcher.name.slice(0, 13) + '\u2026' : state.homeTeam.pitcher.name}</text>
                    <text x="1162" y="646" fontSize="7" fill="#4a6a90" fontFamily="monospace">Ctrl:{state.homeTeam.pitcher.control} IP:{(state.homeTeam.inningsPitched || 0) + 1}/{state.homeTeam.pitcher.ip}</text>
                </g>
                <g cursor="pointer" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x="1120" y="654" width="266" height="22" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x="1253" y="669" textAnchor="middle" fontSize="8" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== CENTER FIELD — Diamond SVG (y=100..778) ====== */}
                <line x1="287" y1="100" x2="287" y2="778" stroke="#d4a018" strokeWidth="2"/>
                <line x1="1113" y1="100" x2="1113" y2="778" stroke="#d4a018" strokeWidth="2"/>

                <g transform="translate(360,100) scale(0.370) translate(-31.455,-189.888)" clipPath="url(#fieldClip)">
                    <rect x="31.455" y="189.888" width="1830" height="1830" fill="rgb(65,156,63)"/>
                    <path fill="rgb(203,145,77)" d="M 161.456 340.85 C 236.09 309.545 287.723 285.02 287.723 285.02 C 287.723 285.02 505.579 221.841 555.281 215.348 C 764.876 187.182 978.157 217.823 1171.37 303.857 C 1447.38 428.065 1662.63 657.132 1769.66 940.487 C 1850.9 1156.94 1864.42 1393.04 1808.36 1617.37 C 1789.75 1691.3 1765.98 1755.02 1735.16 1824.23 C 1732.48 1830.4 1729.59 1836.46 1726.52 1842.46 C 1725.34 1844.92 1722.97 1850.37 1721.71 1852.52 C 1716.9 1861.78 1711.35 1874.77 1706.86 1884.48 C 1669.04 1885.97 1623.05 1884.77 1584.73 1884.78 L 1354.07 1884.8 L 688.131 1885.69 C 617.928 1886 547.725 1885.94 477.513 1885.53 C 449.972 1885.17 422.422 1884.95 394.872 1884.92 C 378.994 1884.87 359.079 1884.3 343.639 1885.81 C 340.736 1902.65 333.319 1919.16 324.321 1933.6 C 302.428 1968.12 267.818 1992.6 228 2001.73 C 147.228 2019.72 63.434 1965.44 45.955 1884.64 C 37.097 1845.1 44.742 1803.65 67.132 1769.88 C 86.738 1739.89 126.349 1711.49 160.908 1704.11 C 159.506 1685.9 159.865 1660.47 159.745 1641.9 L 159.616 1530.49 L 160.073 1219.36 L 160.66 713.474 C 160.63 590.134 159.665 464.071 161.456 340.85 Z"/>
                    <path fill="rgb(254,254,248)" d="M 182.586 331.717 C 197.127 326.783 192.546 326.852 192.546 326.852 L 196.998 1615.42 C 197.036 1648.9 199.147 1699.41 195.916 1731.52 C 208.744 1744.53 221.448 1757.65 234.027 1770.9 C 222.647 1782.35 211.38 1793.91 200.23 1805.58 C 209.481 1813.84 223.745 1825.76 229.7 1836.43 L 231.145 1836.61 C 242.258 1826.27 256.635 1813.5 266.965 1802.61 C 276.207 1812.11 295.466 1832.58 305.604 1840.28 L 1317.96 1840.34 C 1485.32 1840.193 1730.16 1839.724 1730.16 1839.724 C 1724.311 1852.629 1724.403 1853.461 1724.348 1852.866 L 1332.49 1852.29 L 309.572 1853.41 C 285.646 1874.97 259.632 1904.34 235.45 1927.5 C 224.447 1917.57 213.56 1906.41 203.003 1895.9 C 190.128 1906.45 168.472 1928.98 156.477 1941.2 C 141.207 1928.98 109.054 1896.12 96.942 1881.26 C 105.804 1869.24 130.219 1846.6 141.913 1835.29 C 131.419 1823.22 120.271 1812.18 109.021 1800.84 C 122.32 1782.94 166.24 1742.15 183.947 1724.86 C 183.947 1724.86 184.005 1072.309 183.981 746.034 C 183.971 617.636 182.586 331.717 182.586 331.717 Z"/>
                    <path fill="rgb(203,145,77)" d="M 115.212 1884.39 C 123.005 1874.26 137.002 1858.82 147.632 1851.88 C 159.163 1844.35 166.909 1840.52 177.845 1831.44 C 179.782 1837.75 181.825 1844.02 183.972 1850.26 C 192.697 1858.66 198.851 1858.19 210.187 1857.73 L 211.149 1859.3 C 191.283 1875.6 199.127 1875.5 186.392 1895.1 C 182.035 1901.81 163.297 1919.23 156.85 1925.39 C 142.626 1913.41 129.596 1897.25 115.212 1884.39 z"/>
                    <path fill="rgb(221,220,214)" d="M 229.7 1838.1 L 231.145 1838.28 C 225.155 1845.58 217.608 1852.28 211.149 1859.3 L 210.187 1857.73 C 212.621 1853.54 225.639 1841.11 229.7 1838.1 z"/>
                    <path fill="rgb(203,145,77)" d="M 186.923 1742.67 C 193.876 1747.32 210.009 1765.31 216.187 1772.04 C 196.84 1791.99 177.174 1811.63 157.195 1830.95 C 147.115 1822.6 136.669 1811.42 127.648 1801.88 L 186.923 1742.67 z"/>
                    <path fill="rgb(203,145,77)" d="M 266.607 1822.88 C 276.017 1831.62 285.985 1842.19 295.06 1851.46 L 236.619 1909.92 C 229.208 1904.27 215.036 1890.07 207.626 1883.09 C 227.467 1863.16 246.402 1842.92 266.607 1822.88 z"/>
                    <path fill="rgb(221,220,214)" d="M 194.165 1813.83 L 194.503 1815.4 C 193.625 1817.92 185.292 1825.99 182.768 1828.7 L 182.538 1826.12 C 184.963 1822.06 190.567 1817.26 194.165 1813.83 z"/>
                    <path fill="rgb(65,156,63)" d="M 1132.11 786.381 C 1145.61 786.396 1159.09 786.252 1172.57 785.949 C 1185.93 813.756 1193.33 845.101 1219.75 865.817 C 1239.86 881.588 1266.63 892.383 1291.14 900.525 L 1291.06 1651.54 C 1278.13 1654.14 1265.59 1658.27 1253.71 1663.8 C 1205.26 1686.68 1188.93 1718.8 1172.7 1764.99 L 430.362 1765.07 L 391.152 1765.1 C 364.09 1693.45 345.391 1677.54 271.255 1650.68 C 269.5 1401.31 269.463 1151.92 271.145 902.543 C 346.691 871.364 362.201 863.447 391.521 786.705 L 1132.11 786.381 Z"/>
                    <path fill="rgb(203,145,77)" d="M 762.163 1166.41 C 827.854 1162.28 884.383 1212.34 888.222 1278.05 C 892.061 1343.76 841.748 1400.07 776.023 1403.62 C 710.705 1407.15 654.823 1357.21 651.007 1291.91 C 647.192 1226.61 696.879 1170.51 762.163 1166.41 Z"/>
                    <path fill="rgb(254,254,248)" d="M 754.124 1260.5 C 759.628 1263.93 792.2 1295.65 799.286 1302.41 L 786.641 1315.18 C 777.72 1311.58 749.945 1280.99 742.113 1272.5 C 745.904 1268.52 750.2 1264.4 754.124 1260.5 Z"/>
                    <path fill="rgb(254,254,248)" d="M 1325.05 707.235 C 1339.71 706.882 1358.53 706.892 1372.97 707.506 L 1372.92 754.147 L 1325 754.037 L 1325.05 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 193.754 707.235 C 208.414 706.882 227.234 706.892 241.674 707.506 L 241.624 754.147 L 193.704 754.037 L 193.754 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 1325.05 1794.28 C 1339.71 1793.93 1358.53 1793.94 1372.97 1794.55 L 1372.92 1841.2 L 1325 1841.08 L 1325.05 1794.28 Z"/>
                </g>

                {/* Runner info tags */}
                {runner1 && (
                    <g>
                        <rect x="880" y="688" width="105" height="28" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="932" y="700" textAnchor="middle" fontSize="8" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner1.name.length > 13 ? runner1.name.slice(0, 12) + '\u2026' : runner1.name}</text>
                        <text x="932" y="712" textAnchor="middle" fontSize="8" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner1.speed}</text>
                    </g>
                )}
                {runner2 && (
                    <g>
                        <rect x="880" y="286" width="105" height="28" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="932" y="298" textAnchor="middle" fontSize="8" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner2.name.length > 13 ? runner2.name.slice(0, 12) + '\u2026' : runner2.name}</text>
                        <text x="932" y="310" textAnchor="middle" fontSize="8" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner2.speed}</text>
                    </g>
                )}
                {runner3 && (
                    <g>
                        <rect x="300" y="286" width="105" height="28" rx="4" fill="rgba(0,0,0,0.8)" stroke="#22c55e" strokeWidth="1"/>
                        <text x="352" y="298" textAnchor="middle" fontSize="8" fill="#4ade80" fontWeight="bold" fontFamily="Arial">{runner3.name.length > 13 ? runner3.name.slice(0, 12) + '\u2026' : runner3.name}</text>
                        <text x="352" y="310" textAnchor="middle" fontSize="8" fill="#8aade0" fontWeight="bold" fontFamily="monospace">Spd: {runner3.speed}</text>
                    </g>
                )}

                {/* Card slots centered on bases: HP=(421,711) 3B=(429,300) 2B=(848,300) 1B=(848,702) Mound=(633,505) */}
                <CardSlot x={848 - 38} y={300 - 53} label="2B" card={runner2} labelBelow={true} labelText="2ND BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={848 - 38} y={702 - 53} label="1B" card={runner1} labelBelow={true} labelText="1ST BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={429 - 38} y={300 - 53} label="3B" card={runner3} labelBelow={true} labelText="3RD BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={633 - 38} y={505 - 53} label="P" card={pitcher} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={421 - 38} y={711 - 53} label="H" card={batter} labelAbove={true} labelText="HITTER" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>

                {/* IP / Fatigue near pitcher */}
                <rect x="590" y="560" width="86" height="20" rx="4" fill="rgba(0,0,0,0.7)"/>
                <text x="633" y="574" textAnchor="middle" fontSize="9" fill={fatigueActive ? '#ff6060' : '#8aade0'} fontWeight="bold" fontFamily="monospace">
                    IP: {pitcherInningsDisplay}/{pitcherIp}{fatigueActive ? ` (-${pitcherInningsDisplay - pitcherIp})` : ''}
                </text>

                {/* ====== SEPARATOR ====== */}
                <line x1="287" y1="779" x2="1113" y2="779" stroke="url(#goldGrad)" strokeWidth="2"/>

                {/* ====== ACTION / RESULTS AREA (y=780..940) ====== */}
                <rect x="287" y="780" width="826" height="160" fill="url(#actionBg)"/>

                {/* Result display in action area */}
                {state.lastOutcome && state.phase !== 'result_icons' && (
                    <g>
                        <rect x="580" y="784" width="240" height="36" rx="6" fill={
                            ['SO','GB','FB','PU'].includes(state.lastOutcome) ? 'rgba(200,30,30,0.9)' :
                            state.lastOutcome === 'HR' ? 'rgba(233,69,96,0.95)' : 'rgba(34,180,80,0.9)'
                        }/>
                        <text x="700" y="809" textAnchor="middle" fontSize="20" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="2">
                            {outcomeNames[state.lastOutcome] || state.lastOutcome}
                        </text>
                    </g>
                )}

                {state.pendingDpResult && (
                    <g>
                        <rect x="540" y="784" width="320" height="36" rx="6" fill={state.pendingDpResult.isDP ? 'rgba(200,30,30,0.9)' : 'rgba(34,180,80,0.9)'}/>
                        <text x="700" y="800" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold" fontFamily="Impact">{state.pendingDpResult.isDP ? 'DOUBLE PLAY!' : 'DP AVOIDED'}</text>
                        <text x="700" y="814" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            d20({state.pendingDpResult.roll})+IF({state.pendingDpResult.defenseTotal - state.pendingDpResult.roll})={state.pendingDpResult.defenseTotal} vs Spd {state.pendingDpResult.offenseSpeed}
                        </text>
                    </g>
                )}

                {state.pendingExtraBaseResult && (
                    <g>
                        <rect x="500" y="784" width="400" height="36" rx="6" fill={state.pendingExtraBaseResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x="700" y="800" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingExtraBaseResult.safe ? `${state.pendingExtraBaseResult.runnerName} SAFE!` : `${state.pendingExtraBaseResult.runnerName} OUT!`}
                        </text>
                        <text x="700" y="814" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingExtraBaseResult.runnerSpeed} vs d20({state.pendingExtraBaseResult.roll})+OF={state.pendingExtraBaseResult.defenseTotal}
                        </text>
                    </g>
                )}

                {state.pendingStealResult && (
                    <g>
                        <rect x="480" y="784" width="440" height="36" rx="6" fill={state.pendingStealResult.safe ? 'rgba(34,180,80,0.9)' : 'rgba(200,30,30,0.9)'}/>
                        <text x="700" y="800" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold" fontFamily="Impact">
                            {state.pendingStealResult.safe ? `${state.pendingStealResult.runnerName} SAFE!` : `${state.pendingStealResult.runnerName} CAUGHT STEALING!`}
                        </text>
                        <text x="700" y="814" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                            Spd {state.pendingStealResult.runnerSpeed} vs d20({state.pendingStealResult.roll})+Arm={state.pendingStealResult.defenseTotal}
                        </text>
                    </g>
                )}

                {/* Pitch info in action area */}
                {state.lastPitchRoll > 0 && (
                    <g>
                        <rect x="300" y="784" width="230" height="36" rx="4" fill="rgba(0,0,0,0.6)"/>
                        <text x="415" y="798" textAnchor="middle" fontSize="9" fill="#aaa" fontFamily="monospace">
                            Pitch: {state.lastPitchRoll}+{pitcher.control || 0}{state.fatiguePenalty ? `-${state.fatiguePenalty}` : ''}{state.controlModifier ? `+${state.controlModifier}` : ''}={state.lastPitchTotal} vs OB {batter.onBase}
                        </text>
                        <text x="415" y="812" textAnchor="middle" fontSize="9" fill={state.usedPitcherChart ? '#60a5fa' : '#4ade80'} fontFamily="monospace" fontWeight="bold">
                            {'\u2192'} {state.usedPitcherChart ? "Pitcher's chart" : "Batter's chart"}{state.lastSwingRoll > 0 ? `  Swing: ${state.lastSwingRoll}` : ''}
                        </text>
                    </g>
                )}

                {/* Action buttons in action area */}
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
