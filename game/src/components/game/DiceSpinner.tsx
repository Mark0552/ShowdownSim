import { useState, useEffect, useRef, useCallback } from 'react';

interface DiceSpinnerProps {
    /** Center x of the dice section */
    cx: number;
    /** Top y of the bottom bar */
    botY: number;
    /** The actual d20 roll result */
    roll: number | null;
    /** 'pitch' | 'swing' | 'sp' | 'fielding' */
    rollType: string | null;
    /** Changes when a new roll happens */
    triggerKey: string;
    /** Called when spin animation is done */
    onAnimationComplete?: () => void;
    /** Pitch-specific data for modifier display */
    pitchRoll?: number;
    pitchControl?: number;
    fatiguePenalty?: number;
    controlModifier?: number;
    pitchTotal?: number;
    batterOnBase?: number;
    usedPitcherChart?: boolean;
    swingRoll?: number;
}

const SPIN_DURATION = 900;
const SETTLE_PAUSE = 600;

/** Render a d20 diamond shape with a number inside */
function D20Diamond({ x, y, r, value, color, spinning }: { x: number; y: number; r: number; value: number; color: string; spinning: boolean }) {
    const w = r * 0.78;
    return (
        <g>
            <polygon
                points={`${x},${y - r} ${x + w},${y} ${x},${y + r} ${x - w},${y}`}
                fill="#040c1a" stroke={spinning ? '#888' : color} strokeWidth="2.5" strokeLinejoin="round"
            >
                {spinning && <animate attributeName="stroke" values={`${color};#fff;${color}`} dur="0.3s" repeatCount="indefinite" />}
            </polygon>
            <text x={x} y={y + r * 0.3} textAnchor="middle" fontSize={r * 0.9}
                fill={spinning ? '#aaa' : 'white'} fontWeight="900" fontFamily="Impact">{value}</text>
        </g>
    );
}

export default function DiceSpinner({
    cx, botY, roll, rollType, triggerKey,
    onAnimationComplete,
    pitchRoll, pitchControl = 0, fatiguePenalty = 0, controlModifier = 0,
    pitchTotal, batterOnBase, usedPitcherChart, swingRoll,
}: DiceSpinnerProps) {
    const [displayValue, setDisplayValue] = useState<number>(roll || 1);
    const [spinning, setSpinning] = useState(false);
    const [settled, setSettled] = useState(true);
    const prevKeyRef = useRef('');
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const cleanup = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        timersRef.current.forEach(t => clearTimeout(t));
        timersRef.current = [];
    }, []);

    useEffect(() => {
        if (!roll || triggerKey === prevKeyRef.current) return;
        prevKeyRef.current = triggerKey;
        cleanup();
        setSpinning(true);
        setSettled(false);
        intervalRef.current = setInterval(() => {
            setDisplayValue(Math.floor(Math.random() * 20) + 1);
        }, 50);
        const t1 = setTimeout(() => {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setDisplayValue(roll);
            setSettled(true);
        }, SPIN_DURATION);
        const t2 = setTimeout(() => {
            setSpinning(false);
            onAnimationComplete?.();
        }, SPIN_DURATION + SETTLE_PAUSE);
        timersRef.current = [t1, t2];
        return cleanup;
    }, [triggerKey, roll, onAnimationComplete, cleanup]);

    useEffect(() => {
        if (!spinning && roll) setDisplayValue(roll);
    }, [roll, spinning]);

    if (!roll || !rollType) return null;

    const isPitch = rollType === 'pitch';
    const isSwing = rollType === 'swing';
    const hasPitchData = (pitchRoll ?? 0) > 0;
    const hasSwingData = (swingRoll ?? 0) > 0;
    // Show dual pitch+swing after swing settles with both rolls available
    const showDual = isSwing && settled && !spinning && hasPitchData && hasSwingData;

    const rollColor = (type: string) =>
        type === 'pitch' ? '#e94560' : type === 'swing' ? '#4ade80' : type === 'fielding' ? '#60a5fa' : '#d4a018';
    const rollLabel = (type: string) =>
        type === 'pitch' ? 'PITCH' : type === 'swing' ? 'SWING' : type === 'fielding' ? 'FIELDING' : type.toUpperCase();

    const color = rollColor(rollType);

    // ======== DUAL PITCH + SWING LAYOUT ========
    if (showDual) {
        const pitchY = botY + 48;   // pitch diamond center
        const swingY = botY + 130;  // swing diamond center
        const dieR = 26;            // smaller diamonds for dual view
        const pitchDieX = cx - 36;  // shift left for modifiers
        const modX = pitchDieX + dieR * 0.78 + 6;

        // Pitch modifier stack
        let modLines: { text: string; color: string }[] = [];
        modLines.push({ text: `+${pitchControl}`, color: '#8aade0' });
        if (fatiguePenalty > 0) modLines.push({ text: `\u2212${fatiguePenalty}`, color: '#e94560' });
        if (controlModifier > 0) modLines.push({ text: `+${controlModifier}`, color: '#d4a018' });
        modLines.push({ text: `= ${pitchTotal}`, color: 'white' });

        return (
            <g>
                {/* Pitch row */}
                <text x={cx} y={botY + 20} textAnchor="middle" fontSize="11" fill="#e94560"
                    fontWeight="bold" fontFamily="Impact" letterSpacing="1">PITCH</text>
                <D20Diamond x={pitchDieX} y={pitchY} r={dieR} value={pitchRoll!} color="#e94560" spinning={false} />
                {/* Modifiers to right */}
                {modLines.map((m, i) => (
                    <text key={`pm-${i}`} x={modX} y={pitchY - 10 + i * 14} fontSize="12"
                        fill={m.color} fontWeight="bold" fontFamily="monospace">{m.text}</text>
                ))}
                {/* vs OB + chart */}
                <text x={cx} y={pitchY + dieR + 14} textAnchor="middle" fontSize="10" fill="#aaa" fontFamily="monospace">
                    vs OB {batterOnBase} {'\u2192'} {usedPitcherChart ? 'Pitcher' : 'Batter'} chart
                </text>

                {/* Divider */}
                <line x1={cx - 60} y1={botY + 100} x2={cx + 60} y2={botY + 100} stroke="#d4a01840" strokeWidth="1" />

                {/* Swing row */}
                <text x={cx} y={botY + 114} textAnchor="middle" fontSize="11" fill="#4ade80"
                    fontWeight="bold" fontFamily="Impact" letterSpacing="1">SWING</text>
                <D20Diamond x={cx} y={swingY} r={dieR} value={swingRoll!} color="#4ade80" spinning={false} />
                <text x={cx} y={swingY + dieR + 14} textAnchor="middle" fontSize="10"
                    fill={usedPitcherChart ? '#60a5fa' : '#4ade80'} fontWeight="bold" fontFamily="monospace">
                    on {usedPitcherChart ? 'Pitcher' : 'Batter'} chart
                </text>
            </g>
        );
    }

    // ======== SINGLE ROLL LAYOUT (pitch-only, swing-animating, fielding, sp) ========
    const dieX = isPitch ? cx - 30 : cx;
    const dieY = botY + 68;
    const dieR = 34;
    const label = rollLabel(rollType);

    return (
        <g>
            {/* Roll type label */}
            <text x={cx} y={botY + 26} textAnchor="middle" fontSize="14" fill={color}
                fontWeight="bold" fontFamily="Impact" letterSpacing="2">{label}</text>

            {/* D20 diamond */}
            <D20Diamond x={dieX} y={dieY} r={dieR} value={displayValue} color={color} spinning={spinning && !settled} />

            {/* Pitch modifiers to right of die */}
            {isPitch && settled && !spinning && hasPitchData && (
                <g>
                    {(() => {
                        const modX = dieX + dieR * 0.78 + 8;
                        let yOff = dieY - 10;
                        const lines: React.ReactElement[] = [];
                        lines.push(<text key="ctrl" x={modX} y={yOff} fontSize="14" fill="#8aade0" fontWeight="bold" fontFamily="monospace">+{pitchControl}</text>);
                        yOff += 16;
                        if (fatiguePenalty > 0) {
                            lines.push(<text key="ftg" x={modX} y={yOff} fontSize="13" fill="#e94560" fontWeight="bold" fontFamily="monospace">{'\u2212'}{fatiguePenalty}</text>);
                            yOff += 16;
                        }
                        if (controlModifier > 0) {
                            lines.push(<text key="mod" x={modX} y={yOff} fontSize="13" fill="#d4a018" fontWeight="bold" fontFamily="monospace">+{controlModifier}</text>);
                            yOff += 16;
                        }
                        lines.push(<text key="total" x={modX} y={yOff} fontSize="16" fill="white" fontWeight="900" fontFamily="Impact">= {pitchTotal}</text>);
                        return lines;
                    })()}
                </g>
            )}

            {/* Below die: vs OB and chart (pitch) */}
            {isPitch && settled && !spinning && hasPitchData && (
                <g>
                    <text x={cx} y={botY + 120} textAnchor="middle" fontSize="12" fill="#aaa" fontFamily="monospace">
                        vs OB {batterOnBase}
                    </text>
                    <text x={cx} y={botY + 138} textAnchor="middle" fontSize="12"
                        fill={usedPitcherChart ? '#60a5fa' : '#4ade80'} fontWeight="bold" fontFamily="monospace">
                        {'\u2192'} {usedPitcherChart ? 'Pitcher chart' : 'Batter chart'}
                    </text>
                </g>
            )}

            {/* Swing single: show which chart */}
            {isSwing && settled && !spinning && !showDual && (
                <text x={cx} y={botY + 120} textAnchor="middle" fontSize="12"
                    fill={usedPitcherChart ? '#60a5fa' : '#4ade80'} fontWeight="bold" fontFamily="monospace">
                    on {usedPitcherChart ? 'Pitcher' : 'Batter'} chart
                </text>
            )}
        </g>
    );
}
