/**
 * MLB Showdown Game Board — Rotated diamond field.
 * Layout (viewBox 1400x950):
 *   Top bar:    y=0..50    [EXIT] ... centered scoreboard ... [LOG][SCORE]
 *   Main area:  y=52..748  [Away 0..360 | Diamond 360..1040 | Home 1040..1400]
 *   Bottom bar: y=750..948 [Actions 0..700 | Dice 700..1050 | Result 1050..1400]
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

// Layout constants
const PW = 360;        // panel width
const DX = PW;         // diamond area starts
const DW = 1400 - 2 * PW; // diamond area width = 680
const HX = 1400 - PW; // home panel starts = 1040
const TOP = 80;        // top bar height (taller for 3-row scoreboard)
const MAIN_TOP = 82;
const MAIN_BOT = 768;
const BOT_Y = 770;     // bottom bar starts

// Diamond transform: scale to fit field area exactly
// Field: 680 wide x 686 tall. Diamond: 1830x1830.
// scale = min(680/1830, 686/1830) = min(0.372, 0.375) = 0.372
const DS = 0.372;
const D_OFF_X = DX;
const D_OFF_Y = MAIN_TOP + ((MAIN_BOT - MAIN_TOP) - 1830 * DS) / 2; // vertically centered

// Base positions in game coords (after transform)
const basePos = (nx: number, ny: number) => ({
    x: D_OFF_X + (nx - 31.455) * DS,
    y: D_OFF_Y + (ny - 189.888) * DS,
});
const HP = basePos(196, 1842);
const B3 = basePos(218, 731);
const B2 = basePos(1349, 731);
const B1 = basePos(1349, 1818);
const MOUND = basePos(770, 1285);

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
    const handleDiceComplete = useCallback(() => { setDiceAnimating(false); }, []);

    if (!state.awayTeam?.lineup || !state.homeTeam?.lineup) {
        return <div className="game-board-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8aade0' }}>Loading game state...</div>;
    }

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
        hoverTimer.current = setTimeout(() => { setHoveredPlayer(player); setHoverPos({ x: e.clientX, y: e.clientY }); }, 300);
    };
    const handlePlayerLeave = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoveredPlayer(null); };

    const cardIp = pitcher.ip || 0;
    const pitcherRuns = fieldingTeam.pitcherStats?.[pitcher.cardId]?.r || 0;
    const cyBonus = fieldingTeam.cyBonusInnings || 0;
    const effectiveIp = Math.max(0, cardIp - Math.floor(pitcherRuns / 3) + cyBonus);
    const inningsPitching = state.inning - (fieldingTeam.pitcherEntryInning || 1) + 1;
    const fatigueActive = inningsPitching > effectiveIp;
    const fatiguePenalty = Math.max(0, inningsPitching - effectiveIp);
    const hasRunners = !!(state.bases.first || state.bases.second || state.bases.third);

    const rollKey = `${state.lastRollType}-${state.lastRoll}-${state.inning}-${state.halfInning}-${state.outs}-${battingTeam.currentBatterIndex}`;
    if (state.lastRoll && rollKey !== prevRollKeyRef.current) { prevRollKeyRef.current = rollKey; if (!diceAnimating) setDiceAnimating(true); }

    const renderIcons = (player: PlayerSlot, team: typeof state.homeTeam, xPos: number, yPos: number) => {
        if (!player.icons || player.icons.length === 0) return null;
        const usage = team.iconUsage?.[player.cardId] || {};
        const maxUses: Record<string, number> = { V: 2 };
        const items: { icon: string; used: boolean }[] = [];
        for (const icon of player.icons) { const max = maxUses[icon] || 1; const used = usage[icon] || 0; for (let i = 0; i < max; i++) items.push({ icon, used: i < used }); }
        return (
            <text x={xPos} y={yPos} fontSize="11" fontFamily="Arial" fontWeight="600">
                {items.map((item, i) => (
                    <tspan key={i} fill={item.used ? '#4a3030' : '#d4a018'} textDecoration={item.used ? 'line-through' : 'none'}>{item.icon}{i < items.length - 1 ? ' ' : ''}</tspan>
                ))}
            </text>
        );
    };

    // Lineup row renderer
    const renderLineup = (team: typeof state.homeTeam, panelX: number, isHome: boolean) => {
        const w = PW - 12;
        return team.lineup.map((player, i) => {
            const y = MAIN_TOP + 88 + i * 58;
            const isAtBat = (isHome ? state.halfInning === 'bottom' : state.halfInning === 'top') && i === team.currentBatterIndex;
            const isOnDeck = (isHome ? state.halfInning === 'top' : state.halfInning === 'bottom') && i === team.currentBatterIndex;
            const pos = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
            const fld = `+${pos === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0)}`;
            return (
                <g key={`${isHome ? 'h' : 'a'}-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x={panelX + 6} y={y} width={w} height="52" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2.5 : isOnDeck ? 1.5 : 0.5}/>
                    <text x={panelX + 20} y={y + 32} fontSize="15" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1e3a6a'} fontWeight="bold" fontFamily="Arial">{i + 1}.</text>
                    {player.imagePath && <image href={player.imagePath} x={panelX + 40} y={y + 3} width="34" height="46" preserveAspectRatio="xMidYMid slice"/>}
                    <text x={panelX + 82} y={y + 20} fontSize="13" fill={isAtBat ? 'white' : '#6a8aba'} fontWeight="bold" fontFamily="Arial">{player.name.length > 18 ? player.name.slice(0, 17) + '\u2026' : player.name}</text>
                    <text x={panelX + 82} y={y + 35} fontSize="11" fill="#4a6a90" fontFamily="Arial">OB:{player.onBase} Spd:{player.speed}</text>
                    {pos && <text x={panelX + w} y={y + 20} textAnchor="end" fontSize="11" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{pos} {fld}</text>}
                    {player.icons && player.icons.length > 0 && renderIcons(player, team, panelX + 82, y + 48)}
                </g>
            );
        });
    };

    // Pitcher row renderer
    const renderPitcher = (team: typeof state.homeTeam, panelX: number) => {
        const w = PW - 12;
        const py = MAIN_TOP + 88 + 9 * 58 + 4;
        return (
            <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(team.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                <rect x={panelX + 6} y={py} width={w} height="38" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                <text x={panelX + 16} y={py + 24} fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">P</text>
                {team.pitcher.imagePath && <image href={team.pitcher.imagePath} x={panelX + 30} y={py + 3} width="24" height="32" preserveAspectRatio="xMidYMid slice"/>}
                <text x={panelX + 62} y={py + 18} fontSize="12" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{team.pitcher.name.length > 16 ? team.pitcher.name.slice(0, 15) + '\u2026' : team.pitcher.name}</text>
                <text x={panelX + 62} y={py + 32} fontSize="10" fill="#4a6a90" fontFamily="monospace">Ctrl:{team.pitcher.control} IP:{(team.inningsPitched || 0) + 1}/{team.pitcher.ip}</text>
            </g>
        );
    };

    return (
        <div className="game-board-wrap">
            {/* ====== TOOLTIP ====== */}
            {hoveredPlayer && (
                <div className="player-tooltip" style={{
                    left: hoverPos.x > window.innerWidth * 0.6 ? Math.max(0, hoverPos.x - 420) : Math.min(hoverPos.x + 15, window.innerWidth - 420),
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
                            <div className="tooltip-stats"><span>Ctrl: {hoveredPlayer.control}</span><span>IP: {hoveredPlayer.ip}</span></div>
                        )}
                        {hoveredPlayer.icons && hoveredPlayer.icons.length > 0 && (
                            <div className="tooltip-icons">
                                {(() => {
                                    const team = [state.awayTeam, state.homeTeam].find(t => t.lineup.some(p => p.cardId === hoveredPlayer!.cardId) || t.pitcher.cardId === hoveredPlayer!.cardId);
                                    const usage = team?.iconUsage?.[hoveredPlayer!.cardId] || {};
                                    const maxUses: Record<string, number> = { V: 2 };
                                    return hoveredPlayer!.icons.map((icon, i) => {
                                        const max = maxUses[icon] || 1; const used = usage[icon] || 0;
                                        const parts = [];
                                        for (let j = 0; j < max; j++) { parts.push(<span key={`${i}-${j}`} style={{ textDecoration: j < used ? 'line-through' : 'none', color: j < used ? '#4a3030' : '#d4a018' }}>{icon}</span>); if (j < max - 1) parts.push(<span key={`${i}-${j}-sep`}> </span>); }
                                        if (i < hoveredPlayer!.icons.length - 1) parts.push(<span key={`${i}-gap`}> </span>);
                                        return parts;
                                    });
                                })()}
                            </div>
                        )}
                        <div className="tooltip-chart">
                            {(() => {
                                const po = [['PU','PU'],['SO','SO'],['GB','GB'],['FB','FB'],['W','BB'],['S','1B'],['DB','2B'],['HR','HR']];
                                const ho = [['SO','SO'],['GB','GB'],['FB','FB'],['W','BB'],['S','1B'],['SPlus','1B+'],['DB','2B'],['TR','3B'],['HR','HR']];
                                const order = hoveredPlayer!.type === 'pitcher' ? po : ho;
                                return order.filter(([f]) => hoveredPlayer!.chart[f]).map(([f, l]) => (<span key={f}>{l}: {String(hoveredPlayer!.chart[f])}</span>));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Bullpen/Sub panels (HTML overlays) */}
            {showAwayBullpen && <BullpenPanel team={state.awayTeam} side="away" onClose={() => setShowAwayBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
            {showHomeBullpen && <BullpenPanel team={state.homeTeam} side="home" onClose={() => setShowHomeBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
            {showSubPanel && isMyTurn && (
                <div className="bullpen-panel" style={{ left: '50%', bottom: '80px', transform: 'translateX(-50%)', zIndex: 600 }}>
                    {state.phase === 'pre_atbat' && iAmBatting && (
                        <>
                            <div className="bp-header" onClick={() => setShowSubPanel(false)}>SELECT PINCH HITTER &#x25B2;</div>
                            <div className="bp-cards">
                                {battingTeam.bench.filter(p => { if (!p.isBackup) return true; return (state.halfInning === 'bottom') ? state.inning >= 6 : state.inning >= 7; }).map((p, i) => (
                                    <div key={`ph-${i}`} className="bp-card" onClick={() => { onAction({ type: 'PINCH_HIT', benchCardId: p.cardId, lineupIndex: battingTeam.currentBatterIndex }); setShowSubPanel(false); }}>
                                        <img src={p.imagePath} alt="" />
                                        <div className="bp-card-info"><span className="bp-card-name">{p.name}</span><span className="bp-card-stats">OB:{p.onBase} Spd:{p.speed} {p.icons?.join(' ')}</span></div>
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
                                        <div className="bp-card-info"><span className="bp-card-name">{p.name}</span><span className="bp-card-stats">Ctrl:{p.control} IP:{p.ip} {p.role} {p.icons?.join(' ')}</span></div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            <svg viewBox="0 0 1400 950" className="game-board-svg">
                <defs>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0c840"/><stop offset="45%" stopColor="#d4a018"/><stop offset="100%" stopColor="#a07808"/></linearGradient>
                    <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1e42a0"/><stop offset="100%" stopColor="#060e2a"/></linearGradient>
                    <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d42020"/><stop offset="100%" stopColor="#7a0808"/></linearGradient>
                    <linearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0c1e3a"/><stop offset="100%" stopColor="#060f1e"/></linearGradient>
                    <linearGradient id="scoreBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0e2248"/><stop offset="100%" stopColor="#07101e"/></linearGradient>
                    <linearGradient id="botBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0a1832"/><stop offset="100%" stopColor="#050c1a"/></linearGradient>
                    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="2" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.7)"/></filter>
                    <filter id="cardGlow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="rgba(255,255,210,0.4)"/></filter>
                    <clipPath id="fieldClip"><rect x={DX} y={MAIN_TOP} width={DW} height={MAIN_BOT - MAIN_TOP}/></clipPath>
                </defs>

                <rect width="1400" height="950" fill="#050c1a"/>

                {/* ====== TOP BAR (y=0..80) ====== */}
                <rect x="0" y="0" width="1400" height={TOP} fill="url(#scoreBg)" stroke="#d4a018" strokeWidth="1"/>

                {/* Exit button — left */}
                <g cursor="pointer" className="roll-button" onClick={() => window.history.back()}>
                    <rect x="8" y="8" width="80" height="34" rx="4" fill="#3a0a0a" stroke="#e94560" strokeWidth="1"/>
                    <text x="48" y="30" textAnchor="middle" fontSize="12" fill="#e94560" fontWeight="bold" fontFamily="Arial">EXIT GAME</text>
                </g>

                {/* Centered scoreboard + inning + outs as one unit */}
                {(() => {
                    const colW = 40, teamW = 100, rhW = 44;
                    const sbTableW = teamW + 9 * colW + 2 * rhW; // scoreboard table width
                    const innW = 190; // inning + top/bot + outs section (46 + 36 + 3*28 + gaps)
                    const gapBetween = 16;
                    const unitW = sbTableW + gapBetween + innW;
                    const unitX = (1400 - unitW) / 2;
                    const hdrH = 20, rowH = 22;
                    const sbY = 6; // top padding

                    const renderRow = (team: typeof state.awayTeam, teamName: string, ry: number) => (
                        <g>
                            <rect x={unitX} y={ry} width={teamW} height={rowH} fill="#0c1a40"/>
                            <text x={unitX + teamW / 2} y={ry + 16} textAnchor="middle" fontSize="12" fill="#8aade0" fontWeight="bold" fontFamily="Arial">{teamName.slice(0, 10).toUpperCase()}</text>
                            {innings.slice(0, 9).map((inn, i) => (
                                <g key={`r-${ry}-${inn}`}>
                                    <rect x={unitX + teamW + i * colW} y={ry} width={colW} height={rowH} fill={i % 2 === 0 ? '#0a1830' : '#071024'}/>
                                    <text x={unitX + teamW + i * colW + colW / 2} y={ry + 16} textAnchor="middle" fontSize="14" fill={team.runsPerInning[i] !== undefined ? '#c8d8f8' : '#1e3a7a'} fontWeight="bold" fontFamily="Arial">{team.runsPerInning[i] ?? '\u2014'}</text>
                                </g>
                            ))}
                            <rect x={unitX + teamW + 9 * colW} y={ry} width={rhW} height={rowH} fill="#3a0a0a"/>
                            <text x={unitX + teamW + 9 * colW + rhW / 2} y={ry + 16} textAnchor="middle" fontSize="16" fill="white" fontWeight="bold" fontFamily="Impact">{team === state.awayTeam ? state.score.away : state.score.home}</text>
                            <rect x={unitX + teamW + 9 * colW + rhW} y={ry} width={rhW} height={rowH} fill="#081222"/>
                            <text x={unitX + teamW + 9 * colW + rhW + rhW / 2} y={ry + 16} textAnchor="middle" fontSize="16" fill="#c8d8f8" fontWeight="bold" fontFamily="Impact">{team.hits || 0}</text>
                        </g>
                    );

                    const innX = unitX + sbTableW + gapBetween; // inning section start
                    return (
                        <g>
                            {/* Scoreboard header */}
                            <rect x={unitX} y={sbY} width={teamW} height={hdrH} rx="2" fill="#002868"/>
                            <text x={unitX + teamW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">TEAM</text>
                            {innings.slice(0, 9).map((inn, i) => (
                                <g key={`hdr-${inn}`}>
                                    <rect x={unitX + teamW + i * colW} y={sbY} width={colW} height={hdrH} fill={i % 2 === 0 ? '#002868' : '#001e50'}/>
                                    <text x={unitX + teamW + i * colW + colW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="#c8d8f8" fontWeight="bold" fontFamily="Arial">{inn}</text>
                                </g>
                            ))}
                            <rect x={unitX + teamW + 9 * colW} y={sbY} width={rhW} height={hdrH} rx="2" fill="#9a0000"/>
                            <text x={unitX + teamW + 9 * colW + rhW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">R</text>
                            <rect x={unitX + teamW + 9 * colW + rhW} y={sbY} width={rhW} height={hdrH} rx="2" fill="#7a0000"/>
                            <text x={unitX + teamW + 9 * colW + rhW + rhW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="Arial">H</text>
                            {/* Team rows */}
                            {renderRow(state.awayTeam, awayName, sbY + hdrH + 1)}
                            {renderRow(state.homeTeam, homeName, sbY + hdrH + 1 + rowH + 1)}

                            {/* Inning indicator (right of scoreboard table) */}
                            <rect x={innX} y={sbY + 4} width="46" height="58" rx="5" fill="#040c1a" stroke="#d4a018" strokeWidth="1.5"/>
                            <text x={innX + 23} y={sbY + 42} textAnchor="middle" fontSize="32" fill="white" fontWeight="900" fontFamily="Impact">{state.inning}</text>
                            <rect x={innX + 50} y={sbY + 4} width="36" height="27" rx="3" fill={state.halfInning === 'top' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'top' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                            <text x={innX + 68} y={sbY + 22} textAnchor="middle" fontSize="11" fill={state.halfInning === 'top' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">TOP</text>
                            <rect x={innX + 50} y={sbY + 34} width="36" height="27" rx="3" fill={state.halfInning === 'bottom' ? '#002868' : '#0a1428'} stroke={state.halfInning === 'bottom' ? '#d4a018' : '#d4a01860'} strokeWidth="1"/>
                            <text x={innX + 68} y={sbY + 52} textAnchor="middle" fontSize="11" fill={state.halfInning === 'bottom' ? 'white' : '#2a4a70'} fontWeight="bold" fontFamily="Impact">BOT</text>

                            {/* Outs (right of TOP/BOT) */}
                            <text x={innX + 100} y={sbY + 12} fontSize="8" fill="#d4a018" fontWeight="bold" letterSpacing="1" fontFamily="Arial Black">OUTS</text>
                            {[0, 1, 2].map(i => (
                                <g key={`out-${i}`}>
                                    <circle cx={innX + 100 + i * 28} cy={sbY + 36} r="10" fill={state.outs > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="1.5"/>
                                    <circle cx={innX + 100 + i * 28} cy={sbY + 36} r="6" fill={state.outs > i ? '#ff3030' : '#0e0408'}/>
                                </g>
                            ))}
                        </g>
                    );
                })()}

                {/* Log / Score — top right */}
                <g cursor="pointer" onClick={() => { setShowGameLog(!showGameLog); setShowStats(false); }}>
                    <rect x="1300" y="8" width="44" height="28" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x="1322" y="26" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showGameLog ? 'CLOSE' : 'LOG'}</text>
                </g>
                <g cursor="pointer" onClick={() => { setShowStats(!showStats); setShowGameLog(false); }}>
                    <rect x="1348" y="8" width="48" height="28" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x="1372" y="26" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showStats ? 'CLOSE' : 'SCORE'}</text>
                </g>

                <line x1="0" y1={TOP} x2="1400" y2={TOP} stroke="#d4a018" strokeWidth="1.5"/>

                {/* ====== LEFT PANEL — AWAY (x=0..360, y=52..748) ====== */}
                <rect x="0" y={MAIN_TOP} width={PW} height={MAIN_BOT - MAIN_TOP} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x="4" y={MAIN_TOP + 4} width={PW - 8} height="30" rx="3" fill="url(#navyGrad)"/>
                <text x={PW / 2} y={MAIN_TOP + 24} textAnchor="middle" fontSize="16" fill="white" fontWeight="900" letterSpacing="4" fontFamily="Impact,sans-serif">AWAY</text>
                <rect x="4" y={MAIN_TOP + 38} width={PW - 8} height="22" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="0.5"/>
                <text x={PW / 2} y={MAIN_TOP + 53} textAnchor="middle" fontSize="11" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{awayName.toUpperCase()}</text>
                <text x={PW / 2} y={MAIN_TOP + 74} textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>
                {renderLineup(state.awayTeam, 0, false)}
                {renderPitcher(state.awayTeam, 0)}
                <g cursor="pointer" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="6" y={MAIN_BOT - 30} width={PW - 12} height="24" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x={PW / 2} y={MAIN_BOT - 14} textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== RIGHT PANEL — HOME (x=1040..1400, y=52..748) ====== */}
                <rect x={HX} y={MAIN_TOP} width={PW} height={MAIN_BOT - MAIN_TOP} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x={HX + 4} y={MAIN_TOP + 4} width={PW - 8} height="30" rx="3" fill="url(#redGrad)"/>
                <text x={HX + PW / 2} y={MAIN_TOP + 24} textAnchor="middle" fontSize="16" fill="white" fontWeight="900" letterSpacing="4" fontFamily="Impact,sans-serif">HOME</text>
                <rect x={HX + 4} y={MAIN_TOP + 38} width={PW - 8} height="22" rx="3" fill="#0a1428" stroke="#d4a01840" strokeWidth="0.5"/>
                <text x={HX + PW / 2} y={MAIN_TOP + 53} textAnchor="middle" fontSize="11" fill="#8aade0" letterSpacing="1" fontFamily="Arial" fontWeight="bold">{homeName.toUpperCase()}</text>
                <text x={HX + PW / 2} y={MAIN_TOP + 74} textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" letterSpacing="2" fontFamily="Arial Black">BATTING ORDER</text>
                {renderLineup(state.homeTeam, HX, true)}
                {renderPitcher(state.homeTeam, HX)}
                <g cursor="pointer" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x={HX + 6} y={MAIN_BOT - 30} width={PW - 12} height="24" rx="3" fill="#0a1830" stroke="#d4a01840" strokeWidth="1"/>
                    <text x={HX + PW / 2} y={MAIN_BOT - 14} textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="bold" fontFamily="Arial">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== DIAMOND FIELD (x=360..1040, y=52..748) ====== */}
                <g clipPath="url(#fieldClip)">
                <g transform={`translate(${D_OFF_X},${D_OFF_Y}) scale(${DS}) translate(-31.455,-189.888)`}>
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
                </g>

                {/* Panel / diamond border lines */}
                <line x1={DX} y1={MAIN_TOP} x2={DX} y2={MAIN_BOT} stroke="#d4a018" strokeWidth="1.5"/>
                <line x1={HX} y1={MAIN_TOP} x2={HX} y2={MAIN_BOT} stroke="#d4a018" strokeWidth="1.5"/>

                {/* Runner speed labels — centered above each base card */}
                {runner1 && <text x={B1.x} y={B1.y - 58} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="bold" fontFamily="monospace">Spd: {runner1.speed}</text>}
                {runner2 && <text x={B2.x} y={B2.y - 58} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="bold" fontFamily="monospace">Spd: {runner2.speed}</text>}
                {runner3 && <text x={B3.x} y={B3.y - 58} textAnchor="middle" fontSize="14" fill="#4ade80" fontWeight="bold" fontFamily="monospace">Spd: {runner3.speed}</text>}

                {/* Card slots centered on bases */}
                <CardSlot x={B2.x - 38} y={B2.y - 53} label="2B" card={runner2} labelBelow={true} labelText="2ND BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={B1.x - 38} y={B1.y - 53} label="1B" card={runner1} labelBelow={true} labelText="1ST BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={B3.x - 38} y={B3.y - 53} label="3B" card={runner3} labelBelow={true} labelText="3RD BASE" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={MOUND.x - 38} y={MOUND.y - 53} label="P" card={pitcher} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                <CardSlot x={HP.x - 38} y={HP.y - 53} label="H" card={batter} labelAbove={true} labelText="HITTER" onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>

                {/* IP / Fatigue near pitcher */}
                <rect x={MOUND.x - 42} y={MOUND.y + 56} width="84" height="20" rx="4" fill="rgba(0,0,0,0.75)"/>
                <text x={MOUND.x} y={MOUND.y + 70} textAnchor="middle" fontSize="10" fill={fatigueActive ? '#ff6060' : '#8aade0'} fontWeight="bold" fontFamily="monospace">
                    IP: {inningsPitching}/{effectiveIp}{fatigueActive ? ` (-${fatiguePenalty})` : ''}
                </text>

                {/* ====== BOTTOM BAR (y=750..948) ====== */}
                <line x1="0" y1={BOT_Y} x2="1400" y2={BOT_Y} stroke="#d4a018" strokeWidth="2"/>
                <rect x="0" y={BOT_Y} width="1400" height={948 - BOT_Y} fill="url(#botBg)"/>

                {/* Section dividers */}
                <line x1="700" y1={BOT_Y + 2} x2="700" y2="946" stroke="#d4a01840" strokeWidth="1"/>
                <line x1="1050" y1={BOT_Y + 2} x2="1050" y2="946" stroke="#d4a01840" strokeWidth="1"/>

                {/* Section labels */}
                <text x="350" y={BOT_Y + 14} textAnchor="middle" fontSize="9" fill="#d4a01860" fontWeight="bold" letterSpacing="2" fontFamily="Arial">ACTIONS</text>
                <text x="875" y={BOT_Y + 14} textAnchor="middle" fontSize="9" fill="#d4a01860" fontWeight="bold" letterSpacing="2" fontFamily="Arial">DICE</text>
                <text x="1225" y={BOT_Y + 14} textAnchor="middle" fontSize="9" fill="#d4a01860" fontWeight="bold" letterSpacing="2" fontFamily="Arial">RESULT</text>

                {/* ACTION BUTTONS (left 50%) */}
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

                {/* DICE SECTION (center 25%: x=700..1050) — centered vertically */}
                {state.lastRoll && state.lastRollType && (
                    <g>
                        <text x="875" y={BOT_Y + 30} textAnchor="middle" fontSize="16" fill={state.lastRollType === 'pitch' ? '#e94560' : state.lastRollType === 'swing' ? '#4ade80' : '#d4a018'} fontWeight="bold" fontFamily="Impact" letterSpacing="3">
                            {state.lastRollType === 'pitch' ? 'PITCH' : state.lastRollType === 'swing' ? 'SWING' : state.lastRollType?.toUpperCase()}
                        </text>
                        <rect x="830" y={BOT_Y + 38} width="90" height="64" rx="8" fill="#040c1a" stroke="#d4a018" strokeWidth="2.5"/>
                        <text x="875" y={BOT_Y + 84} textAnchor="middle" fontSize="42" fill="white" fontWeight="900" fontFamily="Impact">{state.lastRoll}</text>
                        {/* Pitch details — doubled text size */}
                        {state.lastPitchRoll > 0 && (
                            <g>
                                <text x="875" y={BOT_Y + 124} textAnchor="middle" fontSize="14" fill="#aaa" fontFamily="monospace">
                                    {state.lastPitchRoll}+{pitcher.control || 0}{state.fatiguePenalty ? `-${state.fatiguePenalty}` : ''}{state.controlModifier ? `+${state.controlModifier}` : ''}={state.lastPitchTotal} vs OB {batter.onBase}
                                </text>
                                <text x="875" y={BOT_Y + 144} textAnchor="middle" fontSize="14" fill={state.usedPitcherChart ? '#60a5fa' : '#4ade80'} fontFamily="monospace" fontWeight="bold">
                                    {'\u2192'} {state.usedPitcherChart ? "Pitcher's chart" : "Batter's chart"}{state.lastSwingRoll > 0 ? `  Swing: ${state.lastSwingRoll}` : ''}
                                </text>
                            </g>
                        )}
                    </g>
                )}

                {/* RESULT SECTION (right 25%: x=1050..1400) — centered */}
                {state.lastOutcome && (
                    <g>
                        <rect x="1070" y={BOT_Y + 24} width="310" height="54" rx="8" fill={
                            ['SO','GB','FB','PU'].includes(state.lastOutcome) ? 'rgba(200,30,30,0.9)' :
                            state.lastOutcome === 'HR' ? 'rgba(233,69,96,0.95)' : 'rgba(34,180,80,0.9)'
                        }/>
                        <text x="1225" y={BOT_Y + 60} textAnchor="middle" fontSize="28" fill="white" fontWeight="900" fontFamily="Impact,sans-serif" letterSpacing="3">
                            {outcomeNames[state.lastOutcome] || state.lastOutcome}
                        </text>
                    </g>
                )}
                {state.pendingDpResult && (
                    <g>
                        {(() => {
                            const dp = state.pendingDpResult;
                            let label = 'BATTER SAFE';
                            let color = 'rgba(34,180,80,0.85)';
                            let showRoll = true;
                            if (dp.isDP) { label = 'DOUBLE PLAY!'; color = 'rgba(200,30,30,0.85)'; }
                            else if (dp.choice === 'dp' && !dp.isDP) { label = 'DP AVOIDED — BATTER SAFE'; }
                            else if (dp.choice === 'hold' && dp.defenseTotal > dp.offenseSpeed) { label = 'OUT AT 1ST — RUNNERS HELD'; color = 'rgba(200,30,30,0.85)'; }
                            else if (dp.choice === 'hold') { label = 'BATTER SAFE — RUNNERS HELD'; }
                            else if (dp.choice === 'force_home') { label = 'FORCE OUT AT HOME'; color = 'rgba(200,30,30,0.85)'; showRoll = false; }
                            else if (dp.choice === 'advance') { label = 'RUNNERS ADVANCE — OUT AT 1ST'; color = 'rgba(200,30,30,0.85)'; showRoll = false; }
                            return (<>
                                <rect x="1070" y={BOT_Y + 84} width="310" height={showRoll ? 46 : 34} rx="6" fill={color}/>
                                <text x="1225" y={BOT_Y + 104} textAnchor="middle" fontSize="12" fill="white" fontWeight="bold" fontFamily="Impact">{label}</text>
                                {showRoll && (
                                    <text x="1225" y={BOT_Y + 122} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.8)" fontFamily="monospace">
                                        d20({dp.roll})+IF({dp.defenseTotal - dp.roll})={dp.defenseTotal} vs Spd {dp.offenseSpeed}
                                    </text>
                                )}
                            </>);
                        })()}
                    </g>
                )}
                {state.pendingExtraBaseResult && (
                    <g>
                        <rect x="1070" y={BOT_Y + 84} width="310" height="40" rx="6" fill={state.pendingExtraBaseResult.safe ? 'rgba(34,180,80,0.85)' : 'rgba(200,30,30,0.85)'}/>
                        <text x="1225" y={BOT_Y + 102} textAnchor="middle" fontSize="13" fill="white" fontWeight="bold" fontFamily="Impact">{state.pendingExtraBaseResult.safe ? `${state.pendingExtraBaseResult.runnerName} SAFE!` : `${state.pendingExtraBaseResult.runnerName} OUT!`}</text>
                        <text x="1225" y={BOT_Y + 118} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="monospace">Spd {state.pendingExtraBaseResult.runnerSpeed} vs d20({state.pendingExtraBaseResult.roll})+OF={state.pendingExtraBaseResult.defenseTotal}</text>
                    </g>
                )}
                {state.pendingStealResult && (
                    <g>
                        <rect x="1070" y={BOT_Y + 84} width="310" height="40" rx="6" fill={state.pendingStealResult.safe ? 'rgba(34,180,80,0.85)' : 'rgba(200,30,30,0.85)'}/>
                        <text x="1225" y={BOT_Y + 102} textAnchor="middle" fontSize="13" fill="white" fontWeight="bold" fontFamily="Impact">{state.pendingStealResult.safe ? `${state.pendingStealResult.runnerName} SAFE!` : `${state.pendingStealResult.runnerName} CAUGHT!`}</text>
                        <text x="1225" y={BOT_Y + 118} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="monospace">Spd {state.pendingStealResult.runnerSpeed} vs d20({state.pendingStealResult.roll})+Arm={state.pendingStealResult.defenseTotal}</text>
                    </g>
                )}
            </svg>

            {/* 3D Dice overlay — positioned over the dice section of the bottom bar */}
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
