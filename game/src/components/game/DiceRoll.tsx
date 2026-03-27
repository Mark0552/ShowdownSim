import { useState, useEffect } from 'react';
import './DiceRoll.css';

interface DiceRollProps {
    roll: number;        // the final roll value
    triggerKey: string;  // changes when a new roll happens
    label?: string;      // "PITCH", "SWING", etc.
    color?: string;      // accent color
}

/**
 * Animated d20 dice roll overlay.
 * Shows a spinning d20 shape that lands on the final number.
 */
export default function DiceRoll({ roll, triggerKey, label, color = '#d4a018' }: DiceRollProps) {
    const [visible, setVisible] = useState(false);
    const [animating, setAnimating] = useState(false);
    const [displayNum, setDisplayNum] = useState(0);
    const [prevKey, setPrevKey] = useState('');

    useEffect(() => {
        if (triggerKey === prevKey || !roll) return;
        setPrevKey(triggerKey);
        setVisible(true);
        setAnimating(true);
        setDisplayNum(0);

        // Rapid number cycling for 600ms then land on result
        let frame = 0;
        const interval = setInterval(() => {
            setDisplayNum(Math.floor(Math.random() * 20) + 1);
            frame++;
            if (frame >= 12) {
                clearInterval(interval);
                setDisplayNum(roll);
                setAnimating(false);
                // Hide after showing result
                setTimeout(() => setVisible(false), 1200);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [triggerKey, roll, prevKey]);

    if (!visible) return null;

    return (
        <div className={`dice-roll-overlay ${animating ? 'dice-spinning' : 'dice-landed'}`}>
            <svg viewBox="0 0 120 120" className="dice-svg">
                {/* D20 shape — simplified icosahedron face */}
                <polygon
                    points="60,8 110,38 98,95 22,95 10,38"
                    fill="rgba(0,0,0,0.85)"
                    stroke={color}
                    strokeWidth="3"
                    className="dice-shape"
                />
                {/* Inner triangle lines for d20 look */}
                <line x1="60" y1="8" x2="22" y2="95" stroke={color} strokeWidth="1" opacity="0.3"/>
                <line x1="60" y1="8" x2="98" y2="95" stroke={color} strokeWidth="1" opacity="0.3"/>
                <line x1="10" y1="38" x2="98" y2="95" stroke={color} strokeWidth="1" opacity="0.3"/>
                <line x1="110" y1="38" x2="22" y2="95" stroke={color} strokeWidth="1" opacity="0.3"/>
                <line x1="10" y1="38" x2="110" y2="38" stroke={color} strokeWidth="1" opacity="0.3"/>
                {/* Number */}
                <text
                    x="60" y="68"
                    textAnchor="middle"
                    fontSize={roll >= 10 ? "36" : "40"}
                    fill="white"
                    fontWeight="900"
                    fontFamily="Impact, sans-serif"
                    className="dice-number"
                >
                    {displayNum || ''}
                </text>
            </svg>
            {label && <div className="dice-label" style={{ color }}>{label}</div>}
        </div>
    );
}
