import { useRef, useEffect } from 'react';
import type { GameState } from '../../types/gameState';
import './GameLog.css';

interface Props {
    state: GameState;
}

export default function GameLog({ state }: Props) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.gameLog.length, state.currentAtBatEvents.length]);

    return (
        <div className="game-log">
            <h3>Game Log</h3>
            <div className="log-entries">
                {state.gameLog.map((entry, i) => (
                    <div key={i} className={`log-entry ${entry.startsWith('---') ? 'inning-break' : ''} ${entry.includes('HOME RUN') ? 'highlight' : ''} ${entry.includes('run(s) score') ? 'scored' : ''}`}>
                        {entry}
                    </div>
                ))}
                {state.currentAtBatEvents.length > 0 && (
                    <div className="log-current">
                        {state.currentAtBatEvents.map((event, i) => (
                            <div key={i} className="log-event">{event}</div>
                        ))}
                    </div>
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
