/**
 * MLB Showdown Game Board — Rotated diamond field.
 * Layout (viewBox 1400x950):
 *   Top bar:    y=0..50    [EXIT] ... centered scoreboard ... [LOG][SCORE]
 *   Main area:  y=52..748  [Away 0..360 | Diamond 360..1040 | Home 1040..1400]
 *   Bottom bar: y=750..948 [Actions 0..820 (59%) | Dice 820..1180 (26%) | Result 1180..1400 (16%)]
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { GameState, GameAction, PlayerSlot } from '../../engine/gameEngine';
import { getCurrentBatter, getCurrentPitcher } from '../../engine/gameEngine';
import { playSound, playSoundDelayed, queueSound, preloadSounds } from '../../lib/sounds';
import GameToast from './GameToast';
import GameLogOverlay from './GameLogOverlay';
import DiceRollsOverlay from './DiceRollsOverlay';
import BullpenPanel from './BullpenPanel';
import SubstitutionModal from './SubstitutionModal';
import DefenseSetupModal from './DefenseSetupModal';
import BoxScore from './BoxScore';
import ActionButtons from './ActionButtons';
import DiceSpinner from './DiceSpinner';
import Scoreboard from './Scoreboard';
import LineupPanel, { buildIconItems } from './LineupPanel';
import TopBarControls from './TopBarControls';
import GameLogFooter from './GameLogFooter';
import Diamond, { BASE_COORDS } from './Diamond';
import { PW, DX, DW, HX, TOP, MAIN_TOP, MAIN_BOT, BOT_Y } from './gameBoardLayout';
import CardTooltip from '../cards/CardTooltip';
import { playerSlotToCard } from '../cards/cardAdapters';
import './GameBoard.css';
import './gameBoardMobile.css';

interface RunnerMovement {
    cardId: string;
    imagePath: string;
    fromBase: string;
    toBase: string;
    outTarget?: string;
    segments: number;
}

interface Props {
    state: GameState;
    myRole: 'home' | 'away';
    isMyTurn: boolean;
    onAction: (action: GameAction) => void;
    homeName: string;
    awayName: string;
    pendingMovements?: RunnerMovement[];
    onMovementsConsumed?: () => void;
    /** Series context (when game is part of a multi-game series) */
    seriesInfo?: {
        gameNumber: number;
        bestOf: number;
        homeWins: number;
        awayWins: number;
    };
    /** Click handler to advance to the next game in the series; only used when isOver. */
    onNextSeriesGame?: () => void;
    /** Exit-to-lobby handler. Used by the EXIT GAME button in the top bar
     *  so users always land on the lobby instead of whatever was last in
     *  browser history (which could be the "waiting for opponent" screen). */
    onExit?: () => void;
    /** Ready-up-for-next-game state (series, post game-over). Clicking the
     *  Ready button toggles the current player's flag; when both flags are
     *  true, GamePage auto-advances. Users can browse box score / logs /
     *  dice rolls freely while waiting. */
    myReadyForNext?: boolean;
    oppReadyForNext?: boolean;
    onToggleReadyForNext?: () => void;
}

/** Animated runner card — pure SVG with requestAnimationFrame interpolation */
function RunnerAnimOverlay({ anim, baseCoords, baseAnimMs }: {
    anim: RunnerMovement; baseCoords: Record<string, { x: number; y: number }>; baseAnimMs: number;
}) {
    const PATH_ORDER = ['home', 'first', 'second', 'third', 'scored'];
    const isOut = anim.toBase === 'out';
    const scoring = anim.toBase === 'scored';
    const from = baseCoords[anim.fromBase];

    // Build waypoint positions in SVG coordinates
    const positions: { x: number; y: number }[] = [{ x: from?.x || 0, y: from?.y || 0 }];
    if (isOut) {
        const target = baseCoords[anim.outTarget || 'home'];
        if (from && target) {
            positions.push({ x: from.x + (target.x - from.x) * 0.6, y: from.y + (target.y - from.y) * 0.6 });
        }
    } else if (from) {
        const fromIdx = PATH_ORDER.indexOf(anim.fromBase);
        const toIdx = PATH_ORDER.indexOf(anim.toBase);
        if (fromIdx >= 0 && toIdx > fromIdx) {
            for (let i = fromIdx + 1; i <= toIdx; i++) {
                const wp = baseCoords[PATH_ORDER[i]];
                if (wp) positions.push({ x: wp.x, y: wp.y });
            }
        }
    }

    const totalSegs = positions.length - 1;
    const segMs = Math.max(baseAnimMs, 400);
    const [pos, setPos] = useState(positions[0]);
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        if (totalSegs <= 0) return;
        const totalDur = totalSegs * segMs;
        const startTime = performance.now();
        let raf: number;

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / totalDur, 1);

            // Find which segment we're in and how far along it
            const segFloat = progress * totalSegs;
            const segIdx = Math.min(Math.floor(segFloat), totalSegs - 1);
            const segProgress = segFloat - segIdx;

            // Ease in-out per segment
            const eased = segProgress < 0.5
                ? 2 * segProgress * segProgress
                : 1 - Math.pow(-2 * segProgress + 2, 2) / 2;

            const p0 = positions[segIdx];
            const p1 = positions[segIdx + 1];
            setPos({ x: p0.x + (p1.x - p0.x) * eased, y: p0.y + (p1.y - p0.y) * eased });

            // Out animations fade out on last 30% (visual feedback for the throw).
            // Scoring runners disappear instantly when they touch home — no fade.
            if (isOut && progress > 0.7) {
                setOpacity(1 - (progress - 0.7) / 0.3);
            }
            if (scoring && progress >= 1) {
                setOpacity(0);
            }

            if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!from || totalSegs <= 0) return null;

    return (
        <g opacity={opacity} style={{ pointerEvents: 'none' }}>
            {/* Placeholder card behind the image: guarantees the animation is
                visible even if imagePath is missing / fails to load. Matches
                the CardSlot corner-bracket styling so it looks intentional. */}
            <rect x={pos.x} y={pos.y} width={70} height={100} rx="6"
                fill="rgba(0,0,0,0.55)" stroke="#f0e8c0" strokeWidth="2" strokeDasharray="6,4" opacity="0.88" />
            {anim.imagePath && (
                <image href={anim.imagePath} x={pos.x + 3} y={pos.y + 3} width={64} height={94}
                    preserveAspectRatio="xMidYMid slice" />
            )}
            {isOut && (
                <rect x={pos.x} y={pos.y} width={70} height={100} rx="4"
                    fill="rgba(200, 20, 20, 0.7)" stroke="rgba(255, 30, 30, 0.9)" strokeWidth="3" />
            )}
        </g>
    );
}

/** Roll info displayed in the mobile sidebar's per-side roll box. */
interface SideRoll {
    label: string;
    value: number;
    color: 'red' | 'green' | 'blue' | 'gold';
    /** Bumped each time a new roll lands so the box can pulse. */
    triggerKey: string;
}

/** Compact d20-roll readout in the mobile sidebar — label above big value.
 *  When triggerKey changes, the value flickers briefly to mimic the dice
 *  spin animation the bottom-row DiceSpinner used to provide. Calls
 *  onSpinComplete after the flicker so the parent's diceAnimating state
 *  clears (the desktop DiceSpinner's role; on mobile the per-side boxes
 *  drive it instead). */
function MobileRollBox({ roll, onSpinComplete }: {
    roll: SideRoll | null;
    onSpinComplete?: () => void;
}) {
    const [spinning, setSpinning] = useState(false);
    const [display, setDisplay] = useState<number | null>(null);
    const lastKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (!roll) { setDisplay(null); return; }
        if (roll.triggerKey === lastKeyRef.current) {
            setDisplay(roll.value);
            return;
        }
        lastKeyRef.current = roll.triggerKey;
        setSpinning(true);
        const interval = setInterval(() => setDisplay(1 + Math.floor(Math.random() * 20)), 60);
        const timeout = setTimeout(() => {
            clearInterval(interval);
            setSpinning(false);
            setDisplay(roll.value);
            onSpinComplete?.();
        }, 600);
        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [roll, onSpinComplete]);
    if (!roll) return <div className="gb-m-sb-roll empty"/>;
    return (
        <div className={`gb-m-sb-roll ${roll.color}${spinning ? ' spinning' : ''}`}>
            <div className="label">{roll.label}</div>
            <div className="value">{display ?? '–'}</div>
        </div>
    );
}

/** Pitch/Swing advantage indicator in the middle of the sidebar, between
 *  the two pitcher cards. Background tint reads from the user's
 *  perspective — green when the result favors me, red when it doesn't. */
function MobileResultBox({ text, goodForMe }: { text: string | null; goodForMe: boolean }) {
    if (!text) return <div className="gb-m-sb-result empty"/>;
    return (
        <div className={`gb-m-sb-result ${goodForMe ? 'good' : 'bad'}`}>
            {text}
        </div>
    );
}

/** One pitcher card for the mobile right-sidebar — image, last name, IP,
 *  and icons line. Highlights gold when this team's pitcher is currently
 *  on the mound (their team is fielding). */
function SidebarPitcher({ team, isFielding, displayInning, displayIcon20Used, onHover, onLeave }: {
    team: import('../../engine/gameEngine').TeamState;
    isFielding: boolean;
    displayInning: number;
    displayIcon20Used: boolean;
    onHover: (player: PlayerSlot, e: React.MouseEvent) => void;
    onLeave: () => void;
}) {
    const pitcher = team.pitcher;
    const cardIp = pitcher.ip || 0;
    const runs = team.pitcherStats?.[pitcher.cardId]?.r || 0;
    const cyBonus = team.cyBonusInnings || 0;
    const effIp = Math.max(0, cardIp - Math.floor(runs / 3) + cyBonus);
    const curInn = displayInning - (team.pitcherEntryInning || 1) + 1;
    const icons = buildIconItems(pitcher, team, isFielding, displayIcon20Used);
    const shortName = pitcher.name.includes(' ')
        ? pitcher.name.slice(pitcher.name.lastIndexOf(' ') + 1)
        : pitcher.name;
    return (
        <div className={`gb-m-sb-pitcher${isFielding ? ' active' : ''}`}
            onMouseEnter={(e) => onHover(pitcher, e)} onMouseLeave={onLeave}>
            {pitcher.imagePath && <img src={pitcher.imagePath} alt=""/>}
            <div className="name">{shortName}</div>
            <div className="ip">IP {curInn}/{effIp}</div>
            {icons.length > 0 && (
                <div className="icons">
                    {icons.map((item, idx) => (
                        <span key={idx} className={item.used ? 'used' : ''}>{item.icon}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function GameBoard({ state, myRole, isMyTurn, onAction, homeName, awayName, pendingMovements = [], onMovementsConsumed, seriesInfo, onNextSeriesGame, onExit, myReadyForNext, oppReadyForNext, onToggleReadyForNext }: Props) {
    const [hoveredPlayer, setHoveredPlayer] = useState<PlayerSlot | null>(null);
    const [showAwayBullpen, setShowAwayBullpen] = useState(false);
    const [showHomeBullpen, setShowHomeBullpen] = useState(false);
    const [showSubPanel, setShowSubPanel] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showFullLog, setShowFullLog] = useState(false);
    const [showDiceRolls, setShowDiceRolls] = useState(false);
    const [diceAnimating, setDiceAnimating] = useState(false);

    // Mobile sidebar's per-side roll boxes — opponent's most recent roll
    // pinned to the top half, mine pinned to the bottom half. Each persists
    // until that side rolls again, so e.g. the opponent's pitch stays
    // visible while I'm swinging. SVG (desktop) layout doesn't read these.
    const [oppRoll, setOppRoll] = useState<SideRoll | null>(null);
    const [myRoll, setMyRoll] = useState<SideRoll | null>(null);
    // Mobile breakpoint — narrow viewports get a stacked HTML/grid layout
    // instead of the desktop 1400×950 SVG. Updates live on rotate / resize.
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches
    );
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 899px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    // Mobile-only: top bar is gone; this is the popup behind the menu button
    // in the scoreboard row, holding the BOX SCORE / LOG / DICE ROLLS / EXIT
    // affordances that used to live up top.
    const [menuOpen, setMenuOpen] = useState(false);
    // Soft freeze for icon-driven outcome changes (no dice spin) — locks the
    // lineup highlight + frozenRef long enough for the user to see the change.
    const [iconFreezeActive, setIconFreezeActive] = useState(false);
    const prevIconChangeSeqRef = useRef(state.iconChangeSequence ?? 0);
    const iconFreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevRollKeyRef = useRef('');
    // Ref-based animation tracking — avoids useEffect timing race with setState
    const animatingRef = useRef(false);
    const frozenRef = useRef({
        bases: state.bases, outs: state.outs, score: state.score,
        battingTeam: state.halfInning === 'top' ? state.awayTeam : state.homeTeam,
        fieldingTeam: state.halfInning === 'top' ? state.homeTeam : state.awayTeam,
        homeTeam: state.homeTeam,
        awayTeam: state.awayTeam,
        icon20UsedThisInning: !!state.icon20UsedThisInning,
        halfInning: state.halfInning as string,
        inning: state.inning,
        phase: state.phase as string,
    });
    const handleDiceComplete = useCallback(() => {
        animatingRef.current = false;
        setDiceAnimating(false);
    }, []);

    if (!state.awayTeam?.lineup || !state.homeTeam?.lineup) {
        return <div className="game-board-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8aade0' }}>Loading game state...</div>;
    }

    const batter = getCurrentBatter(state);
    const pitcher = getCurrentPitcher(state);
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const iAmBatting = (state.halfInning === 'top' && myRole === 'away') || (state.halfInning === 'bottom' && myRole === 'home');

    const outcomeNames: Record<string, string> = {
        SO: 'STRIKEOUT', GB: 'GROUND OUT', FB: 'FLY OUT', PU: 'POPUP',
        W: 'WALK', S: 'SINGLE', SPlus: 'SINGLE+', DB: 'DOUBLE', TR: 'TRIPLE', HR: 'HOME RUN!',
        SAC: 'SAC BUNT', IBB: 'INTENTIONAL WALK',
    };
    const innings = Array.from({ length: Math.max(9, state.inning) }, (_, i) => i + 1);

    const handlePlayerHover = (player: PlayerSlot, _e: React.MouseEvent) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoveredPlayer(player), 300);
    };
    const handlePlayerLeave = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoveredPlayer(null); };

    // Series-fatigue ipPenalty (set on the player at init for relievers/closers
    // who pitched in consecutive prior series games) reduces the card's base IP.
    const cardIp = Math.max(0, (pitcher.ip || 0) - ((pitcher as any).ipPenalty || 0));
    const pitcherRuns = fieldingTeam.pitcherStats?.[pitcher.cardId]?.r || 0;
    const cyBonus = fieldingTeam.cyBonusInnings || 0;
    const effectiveIp = Math.max(0, cardIp - Math.floor(pitcherRuns / 3) + cyBonus);
    const inningsPitching = state.inning - (fieldingTeam.pitcherEntryInning || 1) + 1;
    const fatigueActive = inningsPitching > effectiveIp;
    const fatiguePenalty = Math.max(0, inningsPitching - effectiveIp);
    const hasRunners = !!(state.bases.first || state.bases.second || state.bases.third);

    // Roll detection + freeze logic (ref-based to avoid useEffect timing race)
    const rollKey = state.rollSequence !== undefined
        ? `seq-${state.rollSequence}`
        : `${state.lastRollType}-${state.lastRoll}-${state.inning}-${state.halfInning}-${state.outs}-${battingTeam.currentBatterIndex}`;
    if (state.lastRoll && rollKey !== prevRollKeyRef.current) {
        prevRollKeyRef.current = rollKey;
        if (!animatingRef.current) {
            animatingRef.current = true;
            setDiceAnimating(true);
            // frozenRef keeps its current (old) values — this is the freeze point
        }
    }

    // Route the latest roll into the per-side sidebar boxes (mobile only;
    // SVG layout doesn't read these). Pitch/fielding/extra-base/steal go
    // to the fielding team; swing/bunt go to the batting team.
    useEffect(() => {
        if (state.lastRoll == null || !state.lastRollType) return;
        const t = state.lastRollType;
        const fieldingSide: 'home' | 'away' = state.halfInning === 'top' ? 'home' : 'away';
        const battingSide: 'home' | 'away' = state.halfInning === 'top' ? 'away' : 'home';
        let side: 'home' | 'away' | null = null;
        let label = '';
        let color: SideRoll['color'] = 'gold';
        if (t === 'pitch') { side = fieldingSide; label = 'PITCH'; color = 'red'; }
        else if (t === 'swing') { side = battingSide; label = 'SWING'; color = 'green'; }
        else if (t === 'fielding') { side = fieldingSide; label = 'FIELD'; color = 'blue'; }
        else if (t === 'extra_base') { side = fieldingSide; label = 'THROW'; color = 'blue'; }
        else if (t.startsWith('steal')) { side = fieldingSide; label = 'CATCH'; color = 'blue'; }
        else if (t === 'bunt') { side = battingSide; label = 'BUNT'; color = 'green'; }
        if (!side) return;
        const next: SideRoll = { label, value: state.lastRoll, color, triggerKey: rollKey };
        if (side === myRole) setMyRoll(next);
        else setOppRoll(next);
    }, [rollKey, state.lastRoll, state.lastRollType, state.halfInning, myRole]);
    // Icon-change soft freeze: when iconChangeSequence increments, freeze the
    // lineup/state for ~700ms so the user sees the icon-driven change before
    // the highlight jumps to the next batter. No dice re-spin.
    const curIconSeq = state.iconChangeSequence ?? 0;
    if (curIconSeq !== prevIconChangeSeqRef.current) {
        prevIconChangeSeqRef.current = curIconSeq;
        if (!animatingRef.current) {
            animatingRef.current = true;
            setIconFreezeActive(true);
            if (iconFreezeTimerRef.current) clearTimeout(iconFreezeTimerRef.current);
            iconFreezeTimerRef.current = setTimeout(() => {
                animatingRef.current = false;
                setIconFreezeActive(false);
            }, 700);
        }
    }
    // Runner animation — driven by server-computed movements
    const BASE_ANIM_MS = 1600;
    const [runnerAnims, setRunnerAnims] = useState<RunnerMovement[]>([]);
    const runnerAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Update frozen display values when NOT animating
    if (!animatingRef.current) {
        frozenRef.current = {
            bases: state.bases, outs: state.outs, score: state.score,
            battingTeam, fieldingTeam,
            homeTeam: state.homeTeam, awayTeam: state.awayTeam,
            icon20UsedThisInning: !!state.icon20UsedThisInning,
            halfInning: state.halfInning, inning: state.inning, phase: state.phase,
        };
    }

    // Consume server-driven movements: wait for dice to finish, then animate
    useEffect(() => {
        if (diceAnimating || pendingMovements.length === 0) return;
        // Start animations from server-computed movements
        const anims = pendingMovements;
        const maxSegments = Math.max(...anims.map(a => a.segments || 1));
        const totalMs = maxSegments * BASE_ANIM_MS;
        setRunnerAnims(anims);
        onMovementsConsumed?.();
        if (runnerAnimTimerRef.current) clearTimeout(runnerAnimTimerRef.current);
        runnerAnimTimerRef.current = setTimeout(() => setRunnerAnims([]), totalMs + 100);
    }, [diceAnimating, pendingMovements]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sound effects — all gated behind !diceAnimating so sounds play after dice settles
    const prevOutcomeRef = useRef(state.lastOutcome);
    // Use content-based keys to avoid re-triggering on new object references
    const dpKey = (d: any) => d ? `${d.choice}-${d.roll}-${d.isDP}` : '';
    const ebKey = (e: any) => e ? `${e.runnerId}-${e.roll}-${e.safe}` : '';
    const stKey = (s: any) => s ? `${s.runnerId}-${s.roll}-${s.safe}` : '';
    const prevDpKeyRef = useRef(dpKey(state.pendingDpResult));
    const prevEbKeyRef = useRef(ebKey(state.pendingExtraBaseResult));
    const prevStealKeyRef = useRef(stKey(state.pendingStealResult));
    const prevTotalRunsRef = useRef(state.score.home + state.score.away);
    const prevGameLogLenRef = useRef(state.gameLog?.length || 0);
    const prevRunIpLossRef = useRef<{ pitcherId: string; loss: number }>({
        pitcherId: pitcher.cardId,
        loss: Math.floor((fieldingTeam.pitcherStats?.[pitcher.cardId]?.r || 0) / 3),
    });
    const prevHalfRef = useRef(state.halfInning);
    const prevInningRef = useRef(state.inning);
    const gameStartedRef = useRef(false);
    useEffect(() => {
        preloadSounds();
        if (!gameStartedRef.current && state.inning >= 1) gameStartedRef.current = true;

        // Everything below waits for dice to finish
        if (diceAnimating) return;


        // At-bat outcome sounds
        if (state.lastOutcome && state.lastOutcome !== prevOutcomeRef.current) {
            const o = state.lastOutcome;
            const wasHit = prevOutcomeRef.current && ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(prevOutcomeRef.current);
            const isUpgrade = wasHit && ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(o);
            if (isUpgrade) {
                if (o === 'HR') { playSound('ssbhomerun'); }
            } else {
                if (o === 'HR') { playSound('ssbhomerun'); }
                else if (['S', 'SPlus', 'DB', 'TR'].includes(o)) playSound('bathitball');
                else if (o === 'SO') playSound('strike-three');
                else if (o === 'GB' || o === 'FB' || o === 'PU') playSound('glove-pop');
                else if (o === 'W') {
                    playSound(state.usedPitcherChart ? 'pitches-that-close' : 'just-a-bit-outside');
                }
            }
        }
        prevOutcomeRef.current = state.lastOutcome;

        // DP / fielding result sounds
        const curDpKey = dpKey(state.pendingDpResult);
        if (state.pendingDpResult && curDpKey !== prevDpKeyRef.current) {
            if (state.pendingDpResult.isDP) playSound('out');
            else if (state.pendingDpResult.choice === 'dp' && !state.pendingDpResult.isDP) playSound('safe');
            else if (state.pendingDpResult.choice === 'hold' && state.pendingDpResult.defenseTotal > state.pendingDpResult.offenseSpeed) playSound('out');
            else if (state.pendingDpResult.choice === 'hold') playSound('safe');
        }
        prevDpKeyRef.current = curDpKey;

        // Extra base result sounds
        const curEbKey = ebKey(state.pendingExtraBaseResult);
        if (state.pendingExtraBaseResult && curEbKey !== prevEbKeyRef.current) {
            playSound(state.pendingExtraBaseResult.safe ? 'safe' : 'out');
        }
        prevEbKeyRef.current = curEbKey;

        // Steal result sounds
        const curStKey = stKey(state.pendingStealResult);
        if (state.pendingStealResult && curStKey !== prevStealKeyRef.current) {
            playSound(state.pendingStealResult.safe ? 'safe' : 'out');
        }
        prevStealKeyRef.current = curStKey;

        prevGameLogLenRef.current = state.gameLog?.length || 0;

        // Rack-discipline sound — every 3 runs allowed by current pitcher (-1 effective IP)
        const curRuns = fieldingTeam.pitcherStats?.[pitcher.cardId]?.r || 0;
        const curRunIpLoss = Math.floor(curRuns / 3);
        const prev = prevRunIpLossRef.current;
        if (prev.pitcherId === pitcher.cardId && curRunIpLoss > prev.loss) {
            queueSound('rack-discipline', 300);
        }
        prevRunIpLossRef.current = { pitcherId: pitcher.cardId, loss: curRunIpLoss };

        // Run scored — queue one 'run-scored' per run so grand slams cascade
        const totalRuns = state.score.home + state.score.away;
        const runsDelta = totalRuns - prevTotalRunsRef.current;
        if (runsDelta > 0 && gameStartedRef.current) {
            for (let i = 0; i < runsDelta; i++) {
                queueSound('run-scored', i === 0 ? 200 : 0);
            }
        }
        prevTotalRunsRef.current = totalRuns;
    });

    // Half-inning switch — separate effect runs after main sound effect so queueSound appends
    useEffect(() => {
        if (diceAnimating) return;
        if (prevHalfRef.current !== state.halfInning || prevInningRef.current !== state.inning) {
            if (gameStartedRef.current && !state.isOver) {
                queueSound('switch-sides', 400);
            }
            prevHalfRef.current = state.halfInning;
            prevInningRef.current = state.inning;
        }
    }, [state.halfInning, state.inning, diceAnimating, state.isOver]);

    // Brad Radke entrance — plays once per half-inning he's the active fielder.
    // Fires after switch-sides (queued; FIFO) and on the very first inning after
    // the SP roll if he's the home team's chosen starter.
    const RADKE_CARD_ID = "Brad Radke|'04|UL|204|Twins";
    const radkePlayedRef = useRef<string>('');
    useEffect(() => {
        if (diceAnimating) return;
        if (state.isOver) return;
        if (state.phase === 'sp_roll') return;
        const fieldingPitcher = state.halfInning === 'top' ? state.homeTeam.pitcher : state.awayTeam.pitcher;
        if (!fieldingPitcher || fieldingPitcher.cardId !== RADKE_CARD_ID) return;
        const key = `${state.inning}-${state.halfInning}`;
        if (radkePlayedRef.current === key) return;
        radkePlayedRef.current = key;
        // Queue after switch-sides; first inning has no transition sound to wait for
        queueSound('radke-alert', 1500);
    }, [state.inning, state.halfInning, state.phase, state.homeTeam.pitcher.cardId, state.awayTeam.pitcher.cardId, diceAnimating, state.isOver]);

    // Frozen display values for field visuals during dice animation
    const displayBases = frozenRef.current.bases;
    const displayOuts = frozenRef.current.outs;
    const displayScore = frozenRef.current.score;
    const displayTeam = frozenRef.current.battingTeam;
    const displayFieldingTeam = frozenRef.current.fieldingTeam;
    const displayHomeTeam = frozenRef.current.homeTeam;
    const displayAwayTeam = frozenRef.current.awayTeam;
    const displayIcon20Used = frozenRef.current.icon20UsedThisInning;
    const displayHalfInning = frozenRef.current.halfInning;
    const displayInning = frozenRef.current.inning;
    const displayPhase = frozenRef.current.phase;
    // Treat the game as "over for display purposes" only once the final
    // dice roll has settled — otherwise the field clears before the last
    // play's animation plays out. Controls (buttons etc.) still use
    // state.isOver directly; they're gated by diceAnimating elsewhere.
    const displayIsOver = state.isOver && !diceAnimating && !iconFreezeActive;

    // Freeze the running game log while dice is animating or icon-soft-freeze
    // is active so new log entries don't spoil the result before the dice
    // settles. Uses animatingRef (set synchronously in the same render the
    // freeze begins) instead of React state which lags one render behind.
    const displayedLogLenRef = useRef(state.gameLog?.length || 0);
    if (!animatingRef.current) {
        displayedLogLenRef.current = state.gameLog?.length || 0;
    }
    const displayedGameLog = (state.gameLog || []).slice(0, displayedLogLenRef.current);
    // Batter and pitcher use frozen teams so they don't swap during animation
    const displayBatter = displayTeam.lineup[displayTeam.currentBatterIndex] || batter;
    const displayPitcher = displayFieldingTeam.pitcher || pitcher;
    // Frozen IP/fatigue display — uses frozen fielding team and inning
    const dPitcher = displayPitcher;
    const dCardIp = Math.max(0, (dPitcher.ip || 0) - ((dPitcher as any).ipPenalty || 0));
    const dPitcherRuns = displayFieldingTeam.pitcherStats?.[dPitcher.cardId]?.r || 0;
    const dCyBonus = displayFieldingTeam.cyBonusInnings || 0;
    const dEffectiveIp = Math.max(0, dCardIp - Math.floor(dPitcherRuns / 3) + dCyBonus);
    const dInningsPitching = displayInning - (displayFieldingTeam.pitcherEntryInning || 1) + 1;
    const dFatigueActive = dInningsPitching > dEffectiveIp;
    const dFatiguePenalty = Math.max(0, dInningsPitching - dEffectiveIp);
    const animTargets = new Set(runnerAnims.map(a => a.toBase));
    const animSources = new Set(runnerAnims.map(a => a.fromBase));
    const getRunner = (base: 'first' | 'second' | 'third'): PlayerSlot | null => {
        // Hide card at destination during animation, and at source for out animations
        if (animTargets.has(base) || animSources.has(base)) return null;
        const id = displayBases[base];
        if (!id) return null;
        return displayTeam.lineup.find(p => p.cardId === id) || null;
    };
    const runner1 = getRunner('first');
    const runner2 = getRunner('second');
    const runner3 = getRunner('third');




    if (isMobile) {
        return (
            <div className="game-board-wrap gb-m-wrap">
                {/* Modals + tooltips + overlays — same content as desktop, all
                    use position: fixed/absolute with explicit z-index so DOM
                    order doesn't affect stacking. */}
                {hoveredPlayer && <CardTooltip card={playerSlotToCard(hoveredPlayer)} onClose={handlePlayerLeave} />}
                {showAwayBullpen && <BullpenPanel team={state.awayTeam} side="away" onClose={() => setShowAwayBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
                {showHomeBullpen && <BullpenPanel team={state.homeTeam} side="home" onClose={() => setShowHomeBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
                {showSubPanel && isMyTurn && (
                    <SubstitutionModal state={state} myRole={myRole} onAction={onAction} onClose={() => setShowSubPanel(false)} />
                )}
                {displayPhase === 'defense_setup' && state.phase === 'defense_setup' && (
                    <DefenseSetupModal state={state} myRole={myRole} isMyTurn={isMyTurn} onAction={onAction}
                        onToggleBoxScore={() => setShowStats(s => !s)} onToggleLog={() => setShowFullLog(s => !s)}
                        onToggleDiceRolls={() => setShowDiceRolls(s => !s)} onExit={onExit} />
                )}
                <GameToast gameLog={state.gameLog} diceAnimating={diceAnimating} />
                {showFullLog && <GameLogOverlay gameLog={state.gameLog} onClose={() => setShowFullLog(false)} />}
                {showDiceRolls && <DiceRollsOverlay gameLog={state.gameLog} homeName={homeName} awayName={awayName} onClose={() => setShowDiceRolls(false)} />}
                {showStats && (
                    <div className="overlay-panel" style={{ minWidth: 'min(1200px, 95vw)', maxWidth: '95vw', maxHeight: '90vh' }}>
                        <div className="overlay-panel-header">
                            <span className="overlay-panel-title">BOX SCORE</span>
                            <button className="overlay-close" onClick={() => setShowStats(false)}>CLOSE</button>
                        </div>
                        <div className="overlay-panel-body" style={{ overflowX: 'auto' }}>
                            <BoxScore awayTeam={state.awayTeam} homeTeam={state.homeTeam} awayName={awayName} homeName={homeName} />
                        </div>
                    </div>
                )}

                {/* Mobile menu popup — the four affordances that used to live
                    in the top bar (BOX SCORE / LOG / DICE ROLLS / EXIT GAME).
                    Tap the menu button in the scoreboard row to open. */}
                {menuOpen && (
                    <div className="gb-m-menu-overlay" onClick={() => setMenuOpen(false)}>
                        <div className="gb-m-menu-sheet" onClick={(e) => e.stopPropagation()}>
                            <button className="gb-m-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close">&#x2715;</button>
                            {seriesInfo && (
                                <div className="gb-m-menu-series">
                                    <div className="gb-m-menu-series-game">Game {seriesInfo.gameNumber}/{seriesInfo.bestOf}</div>
                                    <div className="gb-m-menu-series-score">
                                        <span title={homeName}>{homeName}</span>
                                        <span> {seriesInfo.homeWins}{'–'}{seriesInfo.awayWins} </span>
                                        <span title={awayName}>{awayName}</span>
                                    </div>
                                </div>
                            )}
                            <button className="gb-m-menu-btn" onClick={() => { setShowStats(true); setMenuOpen(false); }}>BOX SCORE</button>
                            <button className="gb-m-menu-btn" onClick={() => { setShowFullLog(true); setMenuOpen(false); }}>GAME LOG</button>
                            <button className="gb-m-menu-btn" onClick={() => { setShowDiceRolls(true); setMenuOpen(false); }}>DICE ROLLS</button>
                            <button className="gb-m-menu-btn gb-m-menu-btn-exit" onClick={() => { setMenuOpen(false); onExit?.(); }}>EXIT GAME</button>
                        </div>
                    </div>
                )}

                <Scoreboard
                    layout="html"
                    awayTeam={state.awayTeam}
                    homeTeam={state.homeTeam}
                    awayName={awayName}
                    homeName={homeName}
                    innings={innings}
                    displayInning={displayInning}
                    displayHalfInning={displayHalfInning}
                    displayScore={displayScore}
                    displayOuts={displayOuts}
                    isOver={state.isOver}
                    onMenuClick={() => setMenuOpen(true)}
                />

                {/* Opponent strip — above the diamond. Sandwiches the diamond
                    between the two teams so the on-field perspective matches:
                    opponent's hitters at top, my hitters at bottom. */}
                <LineupPanel
                    layout="html"
                    team={myRole === 'home' ? displayAwayTeam : displayHomeTeam}
                    panelX={0}
                    isHome={myRole !== 'home'}
                    teamName={myRole === 'home' ? awayName : homeName}
                    displayHalfInning={displayHalfInning}
                    displayInning={displayInning}
                    displayIcon20Used={displayIcon20Used}
                    onPlayerHover={handlePlayerHover}
                    onPlayerLeave={handlePlayerLeave}
                    bullpenOpen={myRole === 'home' ? showAwayBullpen : showHomeBullpen}
                    onToggleBullpen={() => myRole === 'home' ? setShowAwayBullpen(!showAwayBullpen) : setShowHomeBullpen(!showHomeBullpen)}
                />

                {/* Diamond + right sidebar (opp bench btn / opp pitcher /
                    my pitcher / my bench btn) — sandwiched between the two
                    lineup strips. The sidebar holds the per-team pitcher
                    cards and bullpen toggles, freeing up the strips to use
                    full row width for 9 batter cells. */}
                <div className="gb-m-diamond-row">
                    <div className="gb-m-diamond-svg-wrap">
                        <svg className="gb-m-diamond-svg" viewBox="360 145 680 620" preserveAspectRatio="xMidYMid meet">
                            <Diamond
                                runner1={runner1}
                                runner2={runner2}
                                runner3={runner3}
                                pitcher={displayPitcher}
                                batter={
                                    diceAnimating ? displayBatter :
                                    (runnerAnims.length === 0 &&
                                     pendingMovements.length === 0 &&
                                     !["extra_base_offer","extra_base"].includes(state.phase))
                                        ? displayBatter : null
                                }
                                displayPhase={displayPhase}
                                displayIsOver={displayIsOver}
                                inningsPitching={dInningsPitching}
                                effectiveIp={dEffectiveIp}
                                fatigueActive={dFatigueActive}
                                fatiguePenalty={dFatiguePenalty}
                                onPlayerHover={handlePlayerHover}
                                onPlayerLeave={handlePlayerLeave}
                            />
                            {runnerAnims.map(anim => (
                                <RunnerAnimOverlay key={`ra-${anim.cardId}`} anim={anim} baseCoords={BASE_COORDS} baseAnimMs={BASE_ANIM_MS} />
                            ))}
                        </svg>
                    </div>
                    <aside className="gb-m-side">
                        {/* Top row: opp roll on the left, opp pitcher column
                            (BENCH/PEN button + opp pitcher card) on the right. */}
                        <div className="gb-m-side-top">
                            <MobileRollBox roll={oppRoll} onSpinComplete={handleDiceComplete}/>
                            <div className="gb-m-side-pcol">
                                <button className="gb-m-sb-btn" onClick={() => myRole === 'home' ? setShowAwayBullpen(!showAwayBullpen) : setShowHomeBullpen(!showHomeBullpen)}>
                                    <span>BENCH</span>
                                    <span>PEN</span>
                                </button>
                                <SidebarPitcher
                                    team={myRole === 'home' ? displayAwayTeam : displayHomeTeam}
                                    isFielding={myRole === 'home' ? displayHalfInning === 'bottom' : displayHalfInning === 'top'}
                                    displayInning={displayInning}
                                    displayIcon20Used={displayIcon20Used}
                                    onHover={handlePlayerHover}
                                    onLeave={handlePlayerLeave}
                                />
                            </div>
                        </div>
                        {/* Middle row spans both columns — pitch/swing
                            advantage indicator from my perspective. Green when
                            it favors me, red when it doesn't. */}
                        {(() => {
                            const haveAdv = state.lastSwingRoll != null && state.usedPitcherChart != null;
                            if (!haveAdv) return <MobileResultBox text={null} goodForMe={false}/>;
                            const pitcherAdv = !!state.usedPitcherChart;
                            return (
                                <MobileResultBox
                                    text={pitcherAdv ? 'PITCHER ADV' : 'BATTER ADV'}
                                    goodForMe={pitcherAdv === !iAmBatting}
                                />
                            );
                        })()}
                        {/* Bottom row: my roll on the left, my pitcher column
                            (my pitcher card + BENCH/PEN button) on the right. */}
                        <div className="gb-m-side-bot">
                            <MobileRollBox roll={myRoll} onSpinComplete={handleDiceComplete}/>
                            <div className="gb-m-side-pcol">
                                <SidebarPitcher
                                    team={myRole === 'home' ? displayHomeTeam : displayAwayTeam}
                                    isFielding={myRole === 'home' ? displayHalfInning === 'top' : displayHalfInning === 'bottom'}
                                    displayInning={displayInning}
                                    displayIcon20Used={displayIcon20Used}
                                    onHover={handlePlayerHover}
                                    onLeave={handlePlayerLeave}
                                />
                                <button className="gb-m-sb-btn" onClick={() => myRole === 'home' ? setShowHomeBullpen(!showHomeBullpen) : setShowAwayBullpen(!showAwayBullpen)}>
                                    <span>BENCH</span>
                                    <span>PEN</span>
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>

                {/* My team strip — below the diamond. */}
                <LineupPanel
                    layout="html"
                    team={myRole === 'home' ? displayHomeTeam : displayAwayTeam}
                    panelX={0}
                    isHome={myRole === 'home'}
                    teamName={myRole === 'home' ? homeName : awayName}
                    displayHalfInning={displayHalfInning}
                    displayInning={displayInning}
                    displayIcon20Used={displayIcon20Used}
                    onPlayerHover={handlePlayerHover}
                    onPlayerLeave={handlePlayerLeave}
                    bullpenOpen={myRole === 'home' ? showHomeBullpen : showAwayBullpen}
                    onToggleBullpen={() => myRole === 'home' ? setShowHomeBullpen(!showHomeBullpen) : setShowAwayBullpen(!showAwayBullpen)}
                />

                {/* Bottom action bar — full-width, fixed height. Dice and
                    advantage indicator moved into the sidebar; this bar is
                    now action buttons only, big tap targets. */}
                <div className="gb-m-action-bar">
                    <div className="gb-m-action-bar-actions">
                        <ActionButtons
                            layout="html"
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
                            onNextSeriesGame={onNextSeriesGame}
                            seriesStatus={seriesInfo
                                ? (Math.max(seriesInfo.homeWins, seriesInfo.awayWins) > seriesInfo.bestOf / 2
                                   ? 'complete' : 'in-progress')
                                : undefined}
                            diceAnimating={diceAnimating}
                            myReadyForNext={myReadyForNext}
                            oppReadyForNext={oppReadyForNext}
                            onToggleReadyForNext={onToggleReadyForNext}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="game-board-wrap">
            {/* ====== TOOLTIP ====== */}
            {hoveredPlayer && <CardTooltip card={playerSlotToCard(hoveredPlayer)} />}

            {/* Bullpen/Sub panels (HTML overlays) */}
            {showAwayBullpen && <BullpenPanel team={state.awayTeam} side="away" onClose={() => setShowAwayBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
            {showHomeBullpen && <BullpenPanel team={state.homeTeam} side="home" onClose={() => setShowHomeBullpen(false)} onHover={handlePlayerHover} onLeave={handlePlayerLeave} />}
            {showSubPanel && isMyTurn && (
                <SubstitutionModal
                    state={state}
                    myRole={myRole}
                    onAction={onAction}
                    onClose={() => setShowSubPanel(false)}
                />
            )}
            {/* Wait for the play animation to finish before opening the half-
                inning defense modal — gating on displayPhase (frozen) instead
                of state.phase keeps the modal from popping up while the 3rd
                out is still being animated. */}
            {displayPhase === 'defense_setup' && state.phase === 'defense_setup' && (
                <DefenseSetupModal
                    state={state}
                    myRole={myRole}
                    isMyTurn={isMyTurn}
                    onAction={onAction}
                    onToggleBoxScore={() => setShowStats(s => !s)}
                    onToggleLog={() => setShowFullLog(s => !s)}
                    onToggleDiceRolls={() => setShowDiceRolls(s => !s)}
                    onExit={onExit}
                />
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
                </defs>

                <rect width="1400" height="950" fill="#050c1a"/>
                {/* Gold border around entire game board */}
                <rect x="0" y="0" width="1400" height="950" fill="none" stroke="#d4a018" strokeWidth="3"/>

                {/* ====== TOP BAR (y=0..80) ====== */}
                <rect x="0" y="0" width="1400" height={TOP} fill="url(#scoreBg)" stroke="#d4a018" strokeWidth="2" rx="0"/>

                {/* Top-bar controls: EXIT, series indicator, BOX SCORE toggle */}
                <TopBarControls
                    seriesInfo={seriesInfo}
                    homeName={homeName}
                    awayName={awayName}
                    showStats={showStats}
                    onToggleStats={() => setShowStats(!showStats)}
                    onExit={onExit}
                />

                {/* Centered scoreboard + outs */}
                <Scoreboard
                    awayTeam={state.awayTeam}
                    homeTeam={state.homeTeam}
                    awayName={awayName}
                    homeName={homeName}
                    innings={innings}
                    displayInning={displayInning}
                    displayHalfInning={displayHalfInning}
                    displayScore={displayScore}
                    displayOuts={displayOuts}
                    isOver={state.isOver}
                />


                <line x1="0" y1={TOP} x2="1400" y2={TOP} stroke="#d4a018" strokeWidth="1.5"/>

                {/* ====== LEFT PANEL — AWAY (x=0..360, y=52..748) ====== */}
                <LineupPanel
                    team={displayAwayTeam}
                    panelX={0}
                    isHome={false}
                    teamName={awayName}
                    displayHalfInning={displayHalfInning}
                    displayInning={displayInning}
                    displayIcon20Used={displayIcon20Used}
                    onPlayerHover={handlePlayerHover}
                    onPlayerLeave={handlePlayerLeave}
                    bullpenOpen={showAwayBullpen}
                    onToggleBullpen={() => setShowAwayBullpen(!showAwayBullpen)}
                />

                {/* ====== RIGHT PANEL — HOME (x=1040..1400, y=52..748) ====== */}
                <LineupPanel
                    team={displayHomeTeam}
                    panelX={HX}
                    isHome={true}
                    teamName={homeName}
                    displayHalfInning={displayHalfInning}
                    displayInning={displayInning}
                    displayIcon20Used={displayIcon20Used}
                    onPlayerHover={handlePlayerHover}
                    onPlayerLeave={handlePlayerLeave}
                    bullpenOpen={showHomeBullpen}
                    onToggleBullpen={() => setShowHomeBullpen(!showHomeBullpen)}
                />

                <Diamond
                    runner1={runner1}
                    runner2={runner2}
                    runner3={runner3}
                    pitcher={displayPitcher}
                    batter={
                        diceAnimating ? displayBatter :
                        (runnerAnims.length === 0 &&
                         pendingMovements.length === 0 &&
                         !["extra_base_offer","extra_base"].includes(state.phase))
                            ? displayBatter : null
                    }
                    displayPhase={displayPhase}
                    displayIsOver={displayIsOver}
                    inningsPitching={dInningsPitching}
                    effectiveIp={dEffectiveIp}
                    fatigueActive={dFatigueActive}
                    fatiguePenalty={dFatiguePenalty}
                    onPlayerHover={handlePlayerHover}
                    onPlayerLeave={handlePlayerLeave}
                />

                {/* Panel / diamond border lines */}
                <line x1={DX} y1={MAIN_TOP} x2={DX} y2={MAIN_BOT} stroke="#d4a018" strokeWidth="1.5"/>
                <line x1={HX} y1={MAIN_TOP} x2={HX} y2={MAIN_BOT} stroke="#d4a018" strokeWidth="1.5"/>

                {/* Animated runner overlay — CSS transition via foreignObject */}
                {runnerAnims.map(anim => (
                    <RunnerAnimOverlay key={`ra-${anim.cardId}`} anim={anim} baseCoords={BASE_COORDS} baseAnimMs={BASE_ANIM_MS} />
                ))}

                {/* ====== BOTTOM BAR (y=750..948) ====== */}
                <line x1="0" y1={BOT_Y} x2="1400" y2={BOT_Y} stroke="#d4a018" strokeWidth="2"/>
                <rect x="0" y={BOT_Y} width="1400" height={948 - BOT_Y} fill="url(#botBg)"/>

                {/* Section dividers */}
                <line x1="820" y1={BOT_Y + 2} x2="820" y2="946" stroke="#d4a01840" strokeWidth="1"/>
                <line x1="1180" y1={BOT_Y + 2} x2="1180" y2="946" stroke="#d4a01840" strokeWidth="1"/>

                {/* ACTION BUTTONS (left 55%) */}
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
                    onNextSeriesGame={onNextSeriesGame}
                    seriesStatus={seriesInfo
                        ? (Math.max(seriesInfo.homeWins, seriesInfo.awayWins) > seriesInfo.bestOf / 2
                           ? 'complete' : 'in-progress')
                        : undefined}
                    diceAnimating={diceAnimating}
                    myReadyForNext={myReadyForNext}
                    oppReadyForNext={oppReadyForNext}
                    onToggleReadyForNext={onToggleReadyForNext}
                />

                {/* DICE SECTION (26%: x=820..1180) — spinner + settled display */}
                {/* Persist dice/results between half-innings so the last play is visible */}
                {state.lastRoll && state.lastRollType && state.phase !== 'sp_roll' && (
                    <DiceSpinner
                        cx={1000} botY={BOT_Y}
                        roll={state.lastRoll} rollType={state.lastRollType}
                        triggerKey={rollKey}
                        onAnimationComplete={handleDiceComplete}
                        pitchRoll={state.lastPitchRoll}
                        pitchControl={pitcher.control || 0}
                        fatiguePenalty={state.fatiguePenalty || 0}
                        controlModifier={state.lastPitchControlMod || 0}
                        pitchTotal={state.lastPitchTotal}
                        batterOnBase={batter.onBase}
                        usedPitcherChart={state.usedPitcherChart}
                        swingRoll={state.lastSwingRoll}
                        iAmBatting={iAmBatting}
                        pitcherCardId={pitcher.cardId}
                    />
                )}

                {/* RUNNING GAME LOG (right 16%: x=1180..1400) */}
                <GameLogFooter
                    x={1182}
                    y={BOT_Y + 2}
                    width={216}
                    height={948 - BOT_Y - 4}
                    displayedGameLog={displayedGameLog}
                    onShowDiceRolls={() => setShowDiceRolls(true)}
                    onShowFullLog={() => setShowFullLog(true)}
                />
            </svg>

            {/* Toast notifications */}
            <GameToast gameLog={state.gameLog} diceAnimating={diceAnimating} />

            {showFullLog && <GameLogOverlay gameLog={state.gameLog} onClose={() => setShowFullLog(false)} />}
            {showDiceRolls && (
                <DiceRollsOverlay
                    gameLog={state.gameLog}
                    homeName={homeName}
                    awayName={awayName}
                    onClose={() => setShowDiceRolls(false)}
                />
            )}

            {showStats && (
                <div className="overlay-panel" style={{ minWidth: 'min(1200px, 95vw)', maxWidth: '95vw', maxHeight: '90vh' }}>
                    <div className="overlay-panel-header">
                        <span className="overlay-panel-title">BOX SCORE</span>
                        <button className="overlay-close" onClick={() => setShowStats(false)}>CLOSE</button>
                    </div>
                    <div className="overlay-panel-body" style={{ overflowX: 'auto' }}>
                        <BoxScore awayTeam={state.awayTeam} homeTeam={state.homeTeam} awayName={awayName} homeName={homeName} />
                    </div>
                </div>
            )}
        </div>
    );
}
