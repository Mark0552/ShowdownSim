import { useState, useEffect, useRef, useCallback } from 'react';

interface DiceSpinnerProps {
    cx: number;
    botY: number;
    roll: number | null;
    rollType: string | null;
    triggerKey: string;
    onAnimationComplete?: () => void;
    pitchRoll?: number;
    pitchControl?: number;
    fatiguePenalty?: number;
    controlModifier?: number;
    pitchTotal?: number;
    batterOnBase?: number;
    usedPitcherChart?: boolean;
    swingRoll?: number;
    /** True if this client is the batting team */
    iAmBatting?: boolean;
}

const SPIN_DURATION = 900;
const SETTLE_PAUSE = 600;

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
                fill={spinning ? '#aaa' : 'white'} fontWeight="normal" fontFamily="Impact">{value}</text>
        </g>
    );
}

/** Build a linear equation string for pitch: "20 + 6(C) - 1(F) + 3(20) = 28" */
function buildPitchEquation(roll: number, ctrl: number, fatigue: number, iconMod: number, total: number) {
    let eq = `${roll} + ${ctrl}(C)`;
    if (fatigue > 0) eq += ` \u2212 ${fatigue}(F)`;
    if (iconMod > 0) eq += ` + ${iconMod}(I)`;
    eq += ` = ${total}`;
    return eq;
}

export default function DiceSpinner({
    cx, botY, roll, rollType, triggerKey,
    onAnimationComplete,
    pitchRoll, pitchControl = 0, fatiguePenalty = 0, controlModifier = 0,
    pitchTotal, batterOnBase, usedPitcherChart, swingRoll,
    iAmBatting = false,
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
    const showDual = isSwing && settled && !spinning && hasPitchData && hasSwingData;

    // User-perspective colors: green = my action, red = opponent's action
    const pitchColor = iAmBatting ? '#e94560' : '#4ade80';  // pitcher's action: red if I'm batting, green if I'm pitching
    const swingColor = iAmBatting ? '#4ade80' : '#e94560';  // batter's action: green if I'm batting, red if I'm pitching
    const rollColor = (type: string) =>
        type === 'pitch' ? pitchColor : type === 'swing' ? swingColor : type === 'fielding' ? '#60a5fa' : '#d4a018';

    const color = rollColor(rollType);

    // Advantage colors: green = good for this user, red = bad
    // Pitcher chart = pitcher advantage (good for fielding team)
    // Batter chart = hitter advantage (good for batting team)
    const pitcherAdvantage = usedPitcherChart === true;
    const advantageText = pitcherAdvantage ? 'PITCHER ADVANTAGE' : 'HITTER ADVANTAGE';
    // Green if advantage is for me
    const advantageGreen = pitcherAdvantage ? !iAmBatting : iAmBatting;
    const advantageColor = advantageGreen ? '#4ade80' : '#e94560';

    // Advantage bar: full width of dice section at bottom, solid color, white text
    const advH = 32;
    const advY = botY + 178 - advH - 4; // 4px from bottom edge

    // ======== DUAL PITCH + SWING LAYOUT (side by side) ========
    if (showDual) {
        const dieR = 26;
        const dieY = botY + 56;
        const pitchCX = cx - 85;
        const swingCX = cx + 85;

        const equation = buildPitchEquation(pitchRoll!, pitchControl, fatiguePenalty, controlModifier, pitchTotal!);

        return (
            <g>
                {/* Pitch column (left) */}
                <text x={pitchCX} y={botY + 18} textAnchor="middle" fontSize="16" fill={pitchColor}
                    fontWeight="normal" fontFamily="Impact" letterSpacing="1">PITCH</text>
                <D20Diamond x={pitchCX} y={dieY} r={dieR} value={pitchRoll!} color={pitchColor} spinning={false} />
                {/* Equation below die */}
                <text x={pitchCX} y={dieY + dieR + 16} textAnchor="middle" fontSize="13" fill="#ddd" fontWeight="normal" fontFamily="monospace">
                    {equation}
                </text>
                <text x={pitchCX} y={dieY + dieR + 34} textAnchor="middle" fontSize="13" fill="#bbb" fontWeight="normal" fontFamily="monospace">
                    vs OB {batterOnBase}
                </text>

                {/* Vertical divider */}
                <line x1={cx} y1={botY + 12} x2={cx} y2={advY - 6} stroke="#d4a01830" strokeWidth="1" />

                {/* Swing column (right) */}
                <text x={swingCX} y={botY + 18} textAnchor="middle" fontSize="16" fill={swingColor}
                    fontWeight="normal" fontFamily="Impact" letterSpacing="1">SWING</text>
                <D20Diamond x={swingCX} y={dieY} r={dieR} value={swingRoll!} color={swingColor} spinning={false} />

                {/* Advantage bar (full width, solid, bottom) */}
                <rect x={cx - 178} y={advY} width="356" height={advH} rx="4" fill={advantageColor} />
                <text x={cx} y={advY + advH / 2 + 7} textAnchor="middle" fontSize="20" fill="white"
                    fontWeight="normal" fontFamily="Impact" letterSpacing="2">{advantageText}</text>
            </g>
        );
    }

    // ======== SINGLE ROLL LAYOUT ========
    const dieX = cx;
    const dieY = botY + 64;
    const dieR = 32;
    const label = isPitch ? 'PITCH' : isSwing ? 'SWING' : rollType === 'fielding' ? 'FIELDING' : rollType!.toUpperCase();

    return (
        <g>
            <text x={cx} y={botY + 22} textAnchor="middle" fontSize="18" fill={color}
                fontWeight="normal" fontFamily="Impact" letterSpacing="2">{label}</text>

            <D20Diamond x={dieX} y={dieY} r={dieR} value={displayValue} color={color} spinning={spinning && !settled} />

            {/* Pitch: equation + vs OB + advantage */}
            {isPitch && settled && !spinning && hasPitchData && (
                <g>
                    <text x={cx} y={dieY + dieR + 18} textAnchor="middle" fontSize="14" fill="#ddd" fontWeight="normal" fontFamily="monospace">
                        {buildPitchEquation(pitchRoll!, pitchControl, fatiguePenalty, controlModifier, pitchTotal!)}
                    </text>
                    <text x={cx} y={dieY + dieR + 38} textAnchor="middle" fontSize="14" fill="#bbb" fontWeight="normal" fontFamily="monospace">
                        vs OB {batterOnBase}
                    </text>
                    {/* Advantage bar */}
                    <rect x={cx - 178} y={advY} width="356" height={advH} rx="4" fill={advantageColor} />
                    <text x={cx} y={advY + advH / 2 + 7} textAnchor="middle" fontSize="20" fill="white"
                        fontWeight="normal" fontFamily="Impact" letterSpacing="2">{advantageText}</text>
                </g>
            )}

            {/* Swing single: chart + advantage */}
            {isSwing && settled && !spinning && !showDual && (
                <g>
                    <rect x={cx - 178} y={advY} width="356" height={advH} rx="4" fill={advantageColor} />
                    <text x={cx} y={advY + advH / 2 + 7} textAnchor="middle" fontSize="20" fill="white"
                        fontWeight="normal" fontFamily="Impact" letterSpacing="2">{advantageText}</text>
                </g>
            )}
        </g>
    );
}
