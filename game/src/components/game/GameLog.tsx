import { useRef, useEffect } from 'react';
import type { GameState } from '../../engine/gameEngine';
import './GameLog.css';

interface Props {
    state: GameState;
}

export default function GameLog({ state }: Props) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.gameLog.length]);

    return (
        <div className="game-log">
            <h3>Game Log</h3>
            <div className="log-entries">
                {state.gameLog.map((entry, i) => (
                    <div key={i} className={`log-entry ${entry.startsWith('---') ? 'inning-break' : ''} ${entry.includes('HOME RUN') || entry.includes('homer') ? 'highlight' : ''} ${entry.includes('scores') ? 'scored' : ''}`}>
                        {entry}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
