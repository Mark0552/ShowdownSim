import { useEffect, useRef, useState } from 'react';

interface DiceRollProps {
    roll: number | null;       // the result to show (null = no roll)
    rollType: string | null;   // 'sp', 'pitch', 'swing', etc.
    triggerKey: string;        // changes when a new roll happens
    onAnimationComplete?: () => void;
}

/**
 * 3D Dice roll using @3d-dice/dice-box v1.1+
 * White d20 with red numbers, rolls on the field area.
 */
export default function DiceRoll({ roll, rollType, triggerKey, onAnimationComplete }: DiceRollProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const diceBoxRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const prevKeyRef = useRef('');
    const initRef = useRef(false);

    // Initialize dice-box once using v1.1 API
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        (async () => {
            try {
                const { default: DiceBox } = await import('@3d-dice/dice-box');
                const box = new (DiceBox as any)({
                    container: '#dice-container',
                    assetPath: `${import.meta.env.BASE_URL}assets/dice-box/`,
                    theme: 'default',
                    themeColor: '#ffffff',
                    scale: 9,
                    gravity: 2,
                    throwForce: 5,
                    spinForce: 4,
                    startingHeight: 10,
                    offscreen: true,
                    enableShadows: true,
                    lightIntensity: 1.2,
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
            // Use object notation with `value` to force the result
            diceBoxRef.current.roll([{ qty: 1, sides: 20, value: roll }]).then(() => {
                setTimeout(() => {
                    diceBoxRef.current?.clear();
                    onAnimationComplete?.();
                }, 800);
            });
        } else {
            onAnimationComplete?.();
        }
    }, [triggerKey, roll, onAnimationComplete]);

    return (
        <div
            id="dice-container"
            ref={containerRef}
            style={{
                position: 'absolute',
                top: '10%',
                left: '30%',
                width: 550,
                height: 500,
                zIndex: 1200,
                pointerEvents: 'none',
            }}
        />
    );
}
