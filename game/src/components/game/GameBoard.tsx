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
import CardSlot from './CardSlot';
import BullpenPanel from './BullpenPanel';
import SubstitutionModal from './SubstitutionModal';
import DefenseSetupModal from './DefenseSetupModal';
import BoxScore from './BoxScore';
import ActionButtons from './ActionButtons';
import DiceSpinner from './DiceSpinner';
import CardTooltip from '../cards/CardTooltip';
import { playerSlotToCard } from '../cards/cardAdapters';
import { penaltyForAssignment } from '../../lib/fielding';
import './GameBoard.css';

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
            <image href={anim.imagePath} x={pos.x + 3} y={pos.y + 3} width={64} height={94}
                preserveAspectRatio="xMidYMid slice" />
            {isOut && (
                <rect x={pos.x} y={pos.y} width={70} height={100} rx="4"
                    fill="rgba(200, 20, 20, 0.7)" stroke="rgba(255, 30, 30, 0.9)" strokeWidth="3" />
            )}
        </g>
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

    const BASE_COORDS: Record<string, { x: number; y: number }> = {
        home: { x: HP.x - 38, y: HP.y - 53 }, first: { x: B1.x - 38, y: B1.y - 53 },
        second: { x: B2.x - 38, y: B2.y - 53 }, third: { x: B3.x - 38, y: B3.y - 53 },
        scored: { x: HP.x - 38, y: HP.y - 53 }, out: { x: 0, y: 0 },
    };
    const BASE_ORDER = ['home', 'first', 'second', 'third', 'scored'] as const;

    const buildBasePath = (fromBase: string, toBase: string) => {
        const fromIdx = BASE_ORDER.indexOf(fromBase as any);
        const toIdx = BASE_ORDER.indexOf(toBase as any);
        if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return { path: '', segments: 0 };
        const from = BASE_COORDS[fromBase];
        let d = 'M 0 0';
        for (let i = fromIdx + 1; i <= toIdx; i++) {
            const waypoint = BASE_COORDS[BASE_ORDER[i]];
            d += ` L ${waypoint.x - from.x} ${waypoint.y - from.y}`;
        }
        return { path: d, segments: toIdx - fromIdx };
    };

    // Update frozen display values when NOT animating
    if (!animatingRef.current) {
        frozenRef.current = { bases: state.bases, outs: state.outs, score: state.score, battingTeam, fieldingTeam, halfInning: state.halfInning, inning: state.inning, phase: state.phase };
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
    const victoryPlayedRef = useRef(false);
    useEffect(() => {
        preloadSounds();
        if (!gameStartedRef.current && state.inning >= 1) gameStartedRef.current = true;

        // Everything below waits for dice to finish
        if (diceAnimating) return;

        // Game over (play once only)
        if (state.isOver && state.winnerId && !victoryPlayedRef.current) {
            victoryPlayedRef.current = true;
            const iWon = state.winnerId === (myRole === 'home' ? state.homeTeam.userId : state.awayTeam.userId);
            if (iWon) playSound('victory');
        }

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

    const renderIcons = (player: PlayerSlot, team: typeof state.homeTeam, xPos: number, yPos: number) => {
        if (!player.icons || player.icons.length === 0) return null;
        const usage = team.iconUsage?.[player.cardId] || {};
        const maxUses: Record<string, number> = { V: 2 };
        // Determine if this pitcher is actively fielding this half-inning
        const isActivePitcher = team.pitcher.cardId === player.cardId;
        const isFieldingHalf = (team === state.homeTeam && state.halfInning === 'top') || (team === state.awayTeam && state.halfInning === 'bottom');
        const items: { icon: string; used: boolean }[] = [];
        for (const icon of player.icons) {
            // CY is never crossed out (passive ability checked at end of inning)
            if (icon === 'CY') { items.push({ icon, used: false }); continue; }
            // 20 only crossed out when this pitcher is actively pitching and used it this inning
            if (icon === '20') {
                const crossed = isActivePitcher && isFieldingHalf && !!state.icon20UsedThisInning;
                items.push({ icon, used: crossed });
                continue;
            }
            const max = maxUses[icon] || 1; const used = usage[icon] || 0;
            for (let i = 0; i < max; i++) items.push({ icon, used: i < used });
        }
        return (
            <text x={xPos} y={yPos} fontSize="14" fontFamily="Arial" fontWeight="normal">
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
            const y = MAIN_TOP + 66 + i * 58;
            const dHalf = frozenRef.current.halfInning;
            // Use frozen team's batter index so highlighting doesn't advance during animation
            const frozenBatIdx = (isHome ? dHalf === 'bottom' : dHalf === 'top')
                ? displayTeam.currentBatterIndex : displayFieldingTeam.currentBatterIndex;
            const isAtBat = (isHome ? dHalf === 'bottom' : dHalf === 'top') && i === frozenBatIdx;
            const isOnDeck = (isHome ? dHalf === 'top' : dHalf === 'bottom') && i === frozenBatIdx;
            const rawPos = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
            const pos = rawPos === 'bench' ? '' : rawPos; // don't show "bench" as position
            // Effective fielding = raw + penalty. Penalty is 0 when native,
            // -1/-2 for 1B OOP, -2 similar / -3 cross / -3 non-catcher-at-C
            // in the forced-accept case. Color red when penalty < 0 so the
            // user immediately sees which player is out of position.
            const penalty = pos ? penaltyForAssignment(player.positions, player.assignedPosition) : 0;
            const rawFld = pos === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0);
            const effFld = rawFld + penalty;
            const fld = pos ? (effFld >= 0 ? `+${effFld}` : `${effFld}`) : '';
            const fldColor = penalty < 0 ? '#f87171' : '#a0c0e0';
            return (
                <g key={`${isHome ? 'h' : 'a'}-${i}`} cursor="pointer" onMouseEnter={(e) => handlePlayerHover(player, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                    <rect x={panelX + 6} y={y} width={w} height="52" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2.5 : isOnDeck ? 1.5 : 0.5}/>
                    <text x={panelX + 20} y={y + 32} fontSize="15" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#a0c0e0'} fontWeight="normal" fontFamily="Arial">{i + 1}.</text>
                    {player.imagePath && <image href={player.imagePath} x={panelX + 40} y={y + 3} width="34" height="46" preserveAspectRatio="xMidYMid slice"/>}
                    <text x={panelX + 82} y={y + 22} fontSize="15" fill={isAtBat ? 'white' : '#a0c0e0'} fontWeight="normal" fontFamily="Arial">{player.name.length > 18 ? player.name.slice(0, 17) + '\u2026' : player.name}</text>
                    {pos && fld && <text x={panelX + w} y={y + 22} textAnchor="end" fontSize="13" fill={fldColor} fontWeight={penalty < 0 ? 'bold' : 'normal'} fontFamily="Arial">{pos} {fld}</text>}
                    {player.icons && player.icons.length > 0 && renderIcons(player, team, panelX + 82, y + 40)}
                </g>
            );
        });
    };

    // Pitcher row renderer
    const renderPitcher = (team: typeof state.homeTeam, panelX: number) => {
        const w = PW - 12;
        const py = MAIN_TOP + 66 + 9 * 58 + 6;
        const pCardIp = team.pitcher.ip || 0;
        const pRuns = team.pitcherStats?.[team.pitcher.cardId]?.r || 0;
        const pCyBonus = team.cyBonusInnings || 0;
        const pEffIp = Math.max(0, pCardIp - Math.floor(pRuns / 3) + pCyBonus);
        const pCurInn = state.inning - (team.pitcherEntryInning || 1) + 1;
        return (
            <g cursor="pointer" onMouseEnter={(e) => handlePlayerHover(team.pitcher, e.nativeEvent as any)} onMouseLeave={handlePlayerLeave}>
                <rect x={panelX + 6} y={py} width={w} height="48" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                <text x={panelX + 16} y={py + 32} fontSize="18" fill="#d4a018" fontWeight="normal" fontFamily="Impact">P</text>
                {team.pitcher.imagePath && <image href={team.pitcher.imagePath} x={panelX + 36} y={py + 3} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                <text x={panelX + 74} y={py + 22} fontSize="15" fill="#a0c0e0" fontWeight="normal" fontFamily="Arial">{team.pitcher.name.length > 16 ? team.pitcher.name.slice(0, 15) + '\u2026' : team.pitcher.name}</text>
                {team.pitcher.icons && team.pitcher.icons.length > 0 && renderIcons(team.pitcher, team, panelX + 74, py + 40)}
                <text x={panelX + w} y={py + 22} textAnchor="end" fontSize="13" fill="#a0c0e0" fontWeight="normal" fontFamily="Arial">IP {pCurInn}/{pEffIp}</text>
            </g>
        );
    };

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
            {state.phase === 'defense_setup' && (
                <DefenseSetupModal
                    state={state}
                    myRole={myRole}
                    isMyTurn={isMyTurn}
                    onAction={onAction}
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
                    <clipPath id="fieldClip"><rect x={DX} y={MAIN_TOP} width={DW} height={MAIN_BOT - MAIN_TOP}/></clipPath>
                </defs>

                <rect width="1400" height="950" fill="#050c1a"/>
                {/* Gold border around entire game board */}
                <rect x="0" y="0" width="1400" height="950" fill="none" stroke="#d4a018" strokeWidth="3"/>

                {/* ====== TOP BAR (y=0..80) ====== */}
                <rect x="0" y="0" width="1400" height={TOP} fill="url(#scoreBg)" stroke="#d4a018" strokeWidth="2" rx="0"/>

                {/* Exit button — goes straight to the lobby via the onExit
                    callback (not window.history.back(), which could land on
                    the waiting-for-opponent screen if that was the prior
                    entry). */}
                <g cursor="pointer" className="roll-button" onClick={() => onExit?.()}>
                    <rect x="8" y="8" width="80" height="34" rx="4" fill="#3a0a0a" stroke="#e94560" strokeWidth="1"/>
                    <text x="48" y="30" textAnchor="middle" fontSize="12" fill="#e94560" fontWeight="normal" fontFamily="Arial">EXIT GAME</text>
                </g>

                {/* Series indicator — left, below exit (when in a series) */}
                {seriesInfo && (
                    <g>
                        <rect x="8" y="46" width="200" height="30" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                        <text x="108" y="59" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="normal" letterSpacing="1" fontFamily="Impact">
                            SERIES — GAME {seriesInfo.gameNumber} of {seriesInfo.bestOf}
                        </text>
                        <text x="108" y="71" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="normal" fontFamily="Arial">
                            {homeName} {seriesInfo.homeWins} {'\u2013'} {seriesInfo.awayWins} {awayName}
                        </text>
                    </g>
                )}

                {/* Centered scoreboard + inning + outs as one unit */}
                {(() => {
                    const colW = 40, teamW = 100, rhW = 44;
                    const sbTableW = teamW + 9 * colW + rhW; // scoreboard table width (no H column)
                    const innW = 96; // outs section only (inning/halfInning indicated on scoreboard itself)
                    const gapBetween = 16;
                    const unitW = sbTableW + gapBetween + innW;
                    const unitX = (1400 - unitW) / 2;
                    const hdrH = 20, rowH = 22;
                    const sbY = 6; // top padding

                    const curInnIdx = displayInning - 1; // 0-based index using frozen inning
                    const isBattingTeam = (team: typeof state.awayTeam) =>
                        (displayHalfInning === 'top' && team === state.awayTeam) || (displayHalfInning === 'bottom' && team === state.homeTeam);

                    const renderRow = (team: typeof state.awayTeam, teamName: string, ry: number) => (
                        <g>
                            <rect x={unitX} y={ry} width={teamW} height={rowH} fill="#0c1a40"/>
                            <text x={unitX + teamW / 2} y={ry + 16} textAnchor="middle" fontSize="12" fill="#8aade0" fontWeight="normal" fontFamily="Arial">{teamName.slice(0, 10).toUpperCase()}</text>
                            {innings.slice(0, 9).map((inn, i) => {
                                const isCurInning = i === curInnIdx && !state.isOver;
                                const isBatting = isBattingTeam(team) && isCurInning;
                                // Team has batted (or is batting) in inning i+1?
                                const hasBatted = i < curInnIdx || (i === curInnIdx && (
                                    team === state.awayTeam ||
                                    (team === state.homeTeam && displayHalfInning === 'bottom')
                                ));
                                const val = team.runsPerInning[i];
                                const displayVal = !hasBatted
                                    ? undefined
                                    : (isBatting && val === undefined ? 0 : val);
                                const cellFill = isBatting ? 'rgba(212,160,24,0.35)' : (i % 2 === 0 ? '#0a1830' : '#071024');
                                const textFill = displayVal !== undefined ? (isBatting ? '#fff' : '#c8d8f8') : '#1e3a7a';
                                return (
                                    <g key={`r-${ry}-${inn}`}>
                                        <rect x={unitX + teamW + i * colW} y={ry} width={colW} height={rowH} fill={cellFill}/>
                                        <text x={unitX + teamW + i * colW + colW / 2} y={ry + 16} textAnchor="middle" fontSize="14" fill={textFill} fontWeight="normal" fontFamily="Arial">{displayVal ?? '\u2014'}</text>
                                    </g>
                                );
                            })}
                            <rect x={unitX + teamW + 9 * colW} y={ry} width={rhW} height={rowH} fill="#3a0a0a"/>
                            <text x={unitX + teamW + 9 * colW + rhW / 2} y={ry + 16} textAnchor="middle" fontSize="16" fill="white" fontWeight="normal" fontFamily="Impact">{team === state.awayTeam ? displayScore.away : displayScore.home}</text>
                        </g>
                    );

                    const innX = unitX + sbTableW + gapBetween; // inning section start
                    return (
                        <g>
                            {/* Scoreboard header */}
                            <rect x={unitX} y={sbY} width={teamW} height={hdrH} rx="2" fill="#002868"/>
                            <text x={unitX + teamW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="normal" fontFamily="Arial">TEAM</text>
                            {innings.slice(0, 9).map((inn, i) => {
                                const isCur = i === curInnIdx && !state.isOver;
                                return (
                                    <g key={`hdr-${inn}`}>
                                        <rect x={unitX + teamW + i * colW} y={sbY} width={colW} height={hdrH}
                                            fill={isCur ? '#3a2a00' : (i % 2 === 0 ? '#002868' : '#001e50')}
                                            stroke={isCur ? '#d4a018' : 'none'} strokeWidth={isCur ? 1.5 : 0}/>
                                        <text x={unitX + teamW + i * colW + colW / 2} y={sbY + 14} textAnchor="middle"
                                            fontSize="10" fill={isCur ? '#d4a018' : '#c8d8f8'} fontWeight="normal" fontFamily="Arial">{inn}</text>
                                    </g>
                                );
                            })}
                            <rect x={unitX + teamW + 9 * colW} y={sbY} width={rhW} height={hdrH} rx="2" fill="#9a0000"/>
                            <text x={unitX + teamW + 9 * colW + rhW / 2} y={sbY + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="normal" fontFamily="Arial">R</text>
                            {/* Team rows */}
                            {renderRow(state.awayTeam, awayName, sbY + hdrH + 1)}
                            {renderRow(state.homeTeam, homeName, sbY + hdrH + 1 + rowH + 1)}
                            {/* Gold border overlay on entire current inning column */}
                            {!state.isOver && curInnIdx < 9 && (
                                <rect x={unitX + teamW + curInnIdx * colW} y={sbY} width={colW} height={hdrH + 2 + rowH * 2 + 1}
                                    fill="none" stroke="#d4a018" strokeWidth="2" rx="2" />
                            )}

                            {/* Outs — label centered over middle ball */}
                            <text x={innX + 48} y={sbY + 14} textAnchor="middle" fontSize="9" fill="#d4a018" fontWeight="normal" letterSpacing="2" fontFamily="Impact">OUTS</text>
                            {[0, 1, 2].map(i => (
                                <g key={`out-${i}`}>
                                    <circle cx={innX + 20 + i * 28} cy={sbY + 36} r="10" fill={displayOuts > i ? '#cc2020' : '#140608'} stroke="#d4a018" strokeWidth="1.5"/>
                                    <circle cx={innX + 20 + i * 28} cy={sbY + 36} r="6" fill={displayOuts > i ? '#ff3030' : '#0e0408'}/>
                                </g>
                            ))}
                        </g>
                    );
                })()}

                {/* Box Score — top right */}
                <g cursor="pointer" onClick={() => { setShowStats(!showStats); }}>
                    <rect x="1338" y="8" width="54" height="40" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    {showStats ? (
                        <text x="1365" y="33" textAnchor="middle" fontSize="12" fill="#d4a018" fontWeight="normal" fontFamily="Arial">CLOSE</text>
                    ) : (
                        <>
                            <text x="1365" y="24" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="normal" fontFamily="Arial">BOX</text>
                            <text x="1365" y="40" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="normal" fontFamily="Arial">SCORE</text>
                        </>
                    )}
                </g>

                <line x1="0" y1={TOP} x2="1400" y2={TOP} stroke="#d4a018" strokeWidth="1.5"/>

                {/* ====== LEFT PANEL — AWAY (x=0..360, y=52..748) ====== */}
                <rect x="0" y={MAIN_TOP} width={PW} height={MAIN_BOT - MAIN_TOP} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x="4" y={MAIN_TOP + 4} width={PW - 8} height="30" rx="3" fill="url(#navyGrad)"/>
                <text x={PW / 2} y={MAIN_TOP + 24} textAnchor="middle" fontSize="14" fill="white" fontWeight="normal" letterSpacing="2" fontFamily="Impact,sans-serif">AWAY {'\u2014'} {awayName.toUpperCase()}</text>
                <text x={PW / 2} y={MAIN_TOP + 54} textAnchor="middle" fontSize="16" fill="#d4a018" fontWeight="normal" letterSpacing="3" fontFamily="Impact">LINEUP</text>
                {renderLineup(state.awayTeam, 0, false)}
                {renderPitcher(state.awayTeam, 0)}
                <g cursor="pointer" className="roll-button" onClick={() => setShowAwayBullpen(!showAwayBullpen)}>
                    <rect x="6" y={MAIN_BOT - 40} width={PW - 12} height="34" rx="4" fill="#0a1830" stroke="#d4a018" strokeWidth="1"/>
                    <text x={PW / 2} y={MAIN_BOT - 19} textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="normal" fontFamily="Impact" letterSpacing="1">{showAwayBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
                </g>

                {/* ====== RIGHT PANEL — HOME (x=1040..1400, y=52..748) ====== */}
                <rect x={HX} y={MAIN_TOP} width={PW} height={MAIN_BOT - MAIN_TOP} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
                <rect x={HX + 4} y={MAIN_TOP + 4} width={PW - 8} height="30" rx="3" fill="url(#redGrad)"/>
                <text x={HX + PW / 2} y={MAIN_TOP + 24} textAnchor="middle" fontSize="14" fill="white" fontWeight="normal" letterSpacing="2" fontFamily="Impact,sans-serif">HOME {'\u2014'} {homeName.toUpperCase()}</text>
                <text x={HX + PW / 2} y={MAIN_TOP + 54} textAnchor="middle" fontSize="16" fill="#d4a018" fontWeight="normal" letterSpacing="3" fontFamily="Impact">LINEUP</text>
                {renderLineup(state.homeTeam, HX, true)}
                {renderPitcher(state.homeTeam, HX)}
                <g cursor="pointer" className="roll-button" onClick={() => setShowHomeBullpen(!showHomeBullpen)}>
                    <rect x={HX + 6} y={MAIN_BOT - 40} width={PW - 12} height="34" rx="4" fill="#0a1830" stroke="#d4a018" strokeWidth="1"/>
                    <text x={HX + PW / 2} y={MAIN_BOT - 19} textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="normal" fontFamily="Impact" letterSpacing="1">{showHomeBullpen ? '\u25B2 BULLPEN / BENCH' : '\u25BC BULLPEN / BENCH'}</text>
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
                {!displayIsOver && runner1 && <text x={B1.x} y={B1.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner1.speed}</text>}
                {!displayIsOver && runner2 && <text x={B2.x} y={B2.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner2.speed}</text>}
                {!displayIsOver && runner3 && <text x={B3.x} y={B3.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner3.speed}</text>}

                {/* Card slots centered on bases — hidden during SP roll AND after game over (players leave field) */}
                {displayPhase !== 'sp_roll' && !displayIsOver && (
                    <>
                        <CardSlot x={B2.x - 38} y={B2.y - 53} label="2B" card={runner2} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                        <CardSlot x={B1.x - 38} y={B1.y - 53} label="1B" card={runner1} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                        <CardSlot x={B3.x - 38} y={B3.y - 53} label="3B" card={runner3} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                        <CardSlot x={MOUND.x - 38} y={MOUND.y - 53} label="P" card={displayPitcher} onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                        <CardSlot x={HP.x - 38} y={HP.y - 53} label="H" card={
                            diceAnimating ? displayBatter :
                            (runnerAnims.length === 0 &&
                             pendingMovements.length === 0 &&
                             !['extra_base_offer','extra_base'].includes(state.phase))
                                ? displayBatter : null
                        } onHover={handlePlayerHover} onLeave={handlePlayerLeave}/>
                    </>
                )}

                {/* Animated runner overlay — CSS transition via foreignObject */}
                {runnerAnims.map(anim => (
                    <RunnerAnimOverlay key={`ra-${anim.cardId}`} anim={anim} baseCoords={BASE_COORDS} baseAnimMs={BASE_ANIM_MS} />
                ))}

                {/* IP / Fatigue near pitcher — hidden during SP roll AND game over */}
                {displayPhase !== 'sp_roll' && !displayIsOver && (
                    <>
                        <rect x={MOUND.x - 42} y={MOUND.y + 56} width="84" height="20" rx="4" fill="rgba(0,0,0,0.75)"/>
                        <text x={MOUND.x} y={MOUND.y + 70} textAnchor="middle" fontSize="10" fill={dFatigueActive ? '#ff6060' : '#8aade0'} fontWeight="normal" fontFamily="monospace">
                            IP: {dInningsPitching}/{dEffectiveIp}{dFatigueActive ? ` (-${dFatiguePenalty})` : ''}
                        </text>
                    </>
                )}

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
                <foreignObject x="1182" y={BOT_Y + 2} width="216" height={948 - BOT_Y - 4}>
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <button onClick={() => setShowDiceRolls(true)} title="Show dice rolls and per-player averages" style={{
                            position: 'absolute', top: 2, right: 66, zIndex: 2,
                            background: 'rgba(10, 20, 40, 0.85)', border: '1px solid #d4a018', borderRadius: 3,
                            padding: '1px 6px', cursor: 'pointer', fontSize: 9, color: '#d4a018',
                            fontFamily: 'Arial', fontWeight: 600, letterSpacing: 1,
                        }}>DICE ROLLS</button>
                        <button onClick={() => setShowFullLog(true)} title="Expand log" style={{
                            position: 'absolute', top: 2, right: 2, zIndex: 2,
                            background: 'rgba(10, 20, 40, 0.85)', border: '1px solid #d4a018', borderRadius: 3,
                            padding: '1px 6px', cursor: 'pointer', fontSize: 9, color: '#d4a018',
                            fontFamily: 'Arial', fontWeight: 600, letterSpacing: 1,
                        }}>EXPAND</button>
                        <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} style={{
                            width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden',
                            padding: '4px 6px', boxSizing: 'border-box',
                            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                            scrollbarWidth: 'thin', scrollbarColor: '#d4a01840 transparent',
                        }}>
                            {displayedGameLog.slice(-12).map((entry: string, i: number) => {
                                const isInning = /^--- /.test(entry);
                                const isIcon = /icon/i.test(entry);
                                const isScore = /scores|homer|run/i.test(entry);
                                const isOut = /strikeout|ground|fly|popup|Double Play|DP|caught|thrown out|Batter out|Force out/i.test(entry);
                                let color = '#8aade0';
                                if (isInning) color = '#d4a018';
                                else if (isIcon) color = '#4ade80';
                                else if (isScore) color = '#e94560';
                                else if (isOut) color = '#ff6060';
                                return (
                                    <div key={`gl-${i}`} style={{
                                        fontSize: isInning ? '11px' : '10px',
                                        color, fontFamily: 'Arial, sans-serif',
                                        padding: '1px 0', lineHeight: '1.3',
                                        borderTop: isInning ? '1px solid #d4a01840' : 'none',
                                        marginTop: isInning ? '3px' : '0',
                                    }}>
                                        {entry}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </foreignObject>
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
                <div className="overlay-panel" style={{ minWidth: 'min(1200px, 95vw)', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', overflowX: 'auto' }}>
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
