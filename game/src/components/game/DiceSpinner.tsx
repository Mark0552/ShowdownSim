import { useState, useEffect, useRef, useCallback } from 'react';

interface DiceSpinnerProps {
    /** Center x of the dice section */
    cx: number;
    /** Top y of the bottom bar */
    botY: number;
    /** The actual d20 roll result */
    roll: number | null;
    /** 'pitch' | 'swing' | 'sp' | etc */
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

const SPIN_DURATION = 900;  // ms of rapid cycling
const SETTLE_PAUSE = 600;   // ms to show settled value before calling complete

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

        // Start spinning
        setSpinning(true);
        setSettled(false);
        intervalRef.current = setInterval(() => {
            setDisplayValue(Math.floor(Math.random() * 20) + 1);
        }, 50);

        // Settle on real value
        const t1 = setTimeout(() => {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setDisplayValue(roll);
            setSettled(true);
        }, SPIN_DURATION);

        // Complete
        const t2 = setTimeout(() => {
            setSpinning(false);
            onAnimationComplete?.();
        }, SPIN_DURATION + SETTLE_PAUSE);

        timersRef.current = [t1, t2];
        return cleanup;
    }, [triggerKey, roll, onAnimationComplete, cleanup]);

    // When not spinning, show last roll value
    useEffect(() => {
        if (!spinning && roll) setDisplayValue(roll);
    }, [roll, spinning]);

    if (!roll || !rollType) return null;

    const color = rollType === 'pitch' ? '#e94560' : rollType === 'swing' ? '#4ade80' : '#d4a018';
    const label = rollType === 'pitch' ? 'PITCH' : rollType === 'swing' ? 'SWING' : rollType?.toUpperCase() || '';
    const isPitch = rollType === 'pitch';
    const isSwing = rollType === 'swing';

    // Position die: shift left for pitch (to fit modifiers), center otherwise
    const dieX = isPitch ? cx - 30 : cx;
    const dieY = botY + 68;
    const dieR = 34; // diamond half-height

    // Build modifier display for pitch
    const ctrlText = isPitch ? `+${pitchControl}` : '';
    const fatigueText = isPitch && fatiguePenalty ? `\u2212${fatiguePenalty}` : '';
    const modText = isPitch && controlModifier ? `+${controlModifier}` : '';
    const effCtrl = pitchControl - fatiguePenalty + controlModifier;

    return (
        <g>
            {/* Roll type label */}
            <text x={cx} y={botY + 26} textAnchor="middle" fontSize="14" fill={color}
                fontWeight="bold" fontFamily="Impact" letterSpacing="2">{label}</text>

            {/* D20 diamond shape */}
            <g>
                <polygon
                    points={`${dieX},${dieY - dieR} ${dieX + dieR * 0.78},${dieY} ${dieX},${dieY + dieR} ${dieX - dieR * 0.78},${dieY}`}
                    fill="#040c1a" stroke={spinning && !settled ? '#888' : color} strokeWidth="2.5"
                    strokeLinejoin="round"
                >
                    {spinning && !settled && (
                        <animate attributeName="stroke" values={`${color};#fff;${color}`} dur="0.3s" repeatCount="indefinite" />
                    )}
                </polygon>
                <text x={dieX} y={dieY + 10} textAnchor="middle" fontSize="32"
                    fill={spinning && !settled ? '#aaa' : 'white'}
                    fontWeight="900" fontFamily="Impact">{displayValue}</text>
            </g>

            {/* Modifiers to the right of die (pitch only) */}
            {isPitch && settled && !spinning && pitchRoll && pitchRoll > 0 && (
                <g>
                    {/* Control modifier */}
                    <text x={dieX + dieR * 0.78 + 8} y={dieY - 8} fontSize="14" fill="#8aade0"
                        fontWeight="bold" fontFamily="monospace">{ctrlText}</text>
                    {/* Fatigue */}
                    {fatiguePenalty > 0 && (
                        <text x={dieX + dieR * 0.78 + 8} y={dieY + 8} fontSize="12" fill="#e94560"
                            fontWeight="bold" fontFamily="monospace">{fatigueText}</text>
                    )}
                    {/* Icon modifier (20/RP) */}
                    {controlModifier > 0 && (
                        <text x={dieX + dieR * 0.78 + 8} y={dieY + (fatiguePenalty ? 24 : 8)} fontSize="12" fill="#d4a018"
                            fontWeight="bold" fontFamily="monospace">{modText}</text>
                    )}
                    {/* = total */}
                    <text x={dieX + dieR * 0.78 + 8} y={dieY + (fatiguePenalty ? (controlModifier ? 42 : 26) : (controlModifier ? 26 : 22))}
                        fontSize="16" fill="white" fontWeight="900" fontFamily="Impact">= {pitchTotal}</text>
                </g>
            )}

            {/* Below die: vs OB and chart (pitch) */}
            {isPitch && settled && !spinning && pitchRoll && pitchRoll > 0 && (
                <g>
                    <text x={cx} y={botY + 120} textAnchor="middle" fontSize="12" fill="#aaa" fontFamily="monospace">
                        vs OB {batterOnBase}
                    </text>
                    <text x={cx} y={botY + 138} textAnchor="middle" fontSize="12"
                        fill={usedPitcherChart ? '#60a5fa' : '#4ade80'} fontWeight="bold" fontFamily="monospace">
                        {'\u2192'} {usedPitcherChart ? 'Pitcher chart' : 'Batter chart'}
                        {swingRoll && swingRoll > 0 ? `  Sw: ${swingRoll}` : ''}
                    </text>
                </g>
            )}

            {/* Swing: show which chart */}
            {isSwing && settled && !spinning && (
                <text x={cx} y={botY + 120} textAnchor="middle" fontSize="12"
                    fill={usedPitcherChart ? '#60a5fa' : '#4ade80'} fontWeight="bold" fontFamily="monospace">
                    on {usedPitcherChart ? 'Pitcher' : 'Batter'} chart
                </text>
            )}
        </g>
    );
}
