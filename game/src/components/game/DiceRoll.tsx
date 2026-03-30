import { useEffect, useRef, useState, useCallback } from 'react';

interface DiceRollProps {
    roll: number | null;       // the result to show (null = no roll)
    rollType: string | null;   // 'sp', 'pitch', 'swing', etc.
    triggerKey: string;        // changes when a new roll happens
    onAnimationComplete?: () => void;
}

/**
 * 3D Dice roll using @3d-dice/dice-box.
 * Shows a white d20 with red numbers, lands on the specified result.
 * Falls back to a simple CSS animation if dice-box fails to load.
 */
export default function DiceRoll({ roll, rollType, triggerKey, onAnimationComplete }: DiceRollProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const diceBoxRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [fallback, setFallback] = useState(false);
    const [fallbackNum, setFallbackNum] = useState(0);
    const [showFallback, setShowFallback] = useState(false);
    const [showLabel, setShowLabel] = useState(false);
    const prevKeyRef = useRef('');
    const initRef = useRef(false);

    // Initialize dice-box once
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        (async () => {
            try {
                const { default: DiceBox } = await import('@3d-dice/dice-box');
                const box = new DiceBox('#dice-container', {
                    assetPath: '/assets/dice-box/',
                    theme: 'default',
                    themeColor: '#cc0000',
                    scale: 6,
                    gravity: 2,
                    throwForce: 5,
                    spinForce: 4,
                    offscreen: true,
                });
                await box.init();
                diceBoxRef.current = box;
                setLoading(false);
            } catch (e) {
                console.warn('dice-box failed to load, using fallback:', e);
                setFallback(true);
                setLoading(false);
            }
        })();
    }, []);

    // Trigger roll animation when triggerKey changes
    useEffect(() => {
        if (!roll || triggerKey === prevKeyRef.current) return;
        prevKeyRef.current = triggerKey;

        setShowLabel(true);

        if (diceBoxRef.current && !fallback) {
            // 3D dice roll
            diceBoxRef.current.roll(`1d20@${roll}`).then(() => {
                // Wait a moment to show result, then clear
                setTimeout(() => {
                    diceBoxRef.current?.clear();
                    setShowLabel(false);
                    onAnimationComplete?.();
                }, 800);
            });
        } else {
            // Fallback: CSS animation
            setShowFallback(true);
            setFallbackNum(0);
            let frame = 0;
            const interval = setInterval(() => {
                setFallbackNum(Math.floor(Math.random() * 20) + 1);
                frame++;
                if (frame >= 12) {
                    clearInterval(interval);
                    setFallbackNum(roll);
                    setTimeout(() => {
                        setShowFallback(false);
                        setShowLabel(false);
                        onAnimationComplete?.();
                    }, 800);
                }
            }, 50);
        }
    }, [triggerKey, roll, fallback, onAnimationComplete]);

    const labelColor = rollType === 'pitch' ? '#e94560' : rollType === 'swing' ? '#4ade80' : '#d4a018';
    const labelText = rollType === 'sp' ? 'STARTING PITCHER' : rollType === 'pitch' ? 'PITCH' : rollType === 'swing' ? 'SWING' : rollType?.toUpperCase() || '';

    return (
        <>
            {/* 3D dice container — positioned over the game board */}
            <div
                id="dice-container"
                ref={containerRef}
                style={{
                    position: 'absolute',
                    top: '30%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 300,
                    height: 300,
                    zIndex: 1200,
                    pointerEvents: 'none',
                }}
            />

            {/* Fallback animation */}
            {fallback && showFallback && (
                <div style={{
                    position: 'absolute',
                    top: '40%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    pointerEvents: 'none',
                }}>
                    <svg viewBox="0 0 120 120" width="120" height="120" style={{ filter: 'drop-shadow(0 0 20px rgba(200,0,0,0.5))' }}>
                        <polygon
                            points="60,8 110,38 98,95 22,95 10,38"
                            fill="white"
                            stroke="#cc0000"
                            strokeWidth="3"
                        />
                        <line x1="60" y1="8" x2="22" y2="95" stroke="#cc000030" strokeWidth="1"/>
                        <line x1="60" y1="8" x2="98" y2="95" stroke="#cc000030" strokeWidth="1"/>
                        <line x1="10" y1="38" x2="98" y2="95" stroke="#cc000030" strokeWidth="1"/>
                        <line x1="110" y1="38" x2="22" y2="95" stroke="#cc000030" strokeWidth="1"/>
                        <line x1="10" y1="38" x2="110" y2="38" stroke="#cc000030" strokeWidth="1"/>
                        <text
                            x="60" y="68" textAnchor="middle"
                            fontSize={fallbackNum >= 10 ? '36' : '40'}
                            fill="#cc0000" fontWeight="900" fontFamily="Impact, sans-serif"
                        >
                            {fallbackNum || ''}
                        </text>
                    </svg>
                    <div style={{ color: labelColor, fontSize: 14, fontWeight: 800, letterSpacing: 3, fontFamily: 'Impact, sans-serif', marginTop: 4 }}>
                        {labelText}
                    </div>
                </div>
            )}

            {/* Label shown during 3D roll */}
            {!fallback && showLabel && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(30% + 280px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1201,
                    color: labelColor,
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: 3,
                    fontFamily: 'Impact, sans-serif',
                    pointerEvents: 'none',
                    textShadow: '0 0 10px rgba(0,0,0,0.8)',
                }}>
                    {labelText}
                </div>
            )}
        </>
    );
}
