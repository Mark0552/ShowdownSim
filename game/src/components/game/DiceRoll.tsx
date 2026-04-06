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
                    assetPath: `${import.meta.env.BASE_URL}assets/dice-box/`,
                    theme: 'default',
                    themeColor: '#e8e8e8',
                    scale: 9,
                    gravity: 2,
                    throwForce: 5,
                    spinForce: 4,
                    offscreen: true,
                });
                await box.init();
                diceBoxRef.current = box;
                setLoading(false);
            } catch (e) {
                console.warn('dice-box failed to load:', e);
                setLoading(false);
            }
        })();
    }, []);

    // Trigger roll animation when triggerKey changes
    useEffect(() => {
        if (!roll || triggerKey === prevKeyRef.current) return;
        prevKeyRef.current = triggerKey;

        if (diceBoxRef.current) {
            diceBoxRef.current.roll(`1d20@${roll}`).then(() => {
                setTimeout(() => {
                    diceBoxRef.current?.clear();
                    onAnimationComplete?.();
                }, 800);
            });
        } else {
            // Dice-box not loaded — just complete immediately
            onAnimationComplete?.();
        }
    }, [triggerKey, roll, onAnimationComplete]);

    return (
        <>
            {/* 3D dice container — centered on the field */}
            <div
                id="dice-container"
                ref={containerRef}
                style={{
                    position: 'absolute',
                    top: '15%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 500,
                    height: 450,
                    zIndex: 1200,
                    pointerEvents: 'none',
                }}
            />
        </>
    );
}
