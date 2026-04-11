import { useState, useEffect, useRef } from 'react';

interface Toast {
    id: number;
    message: string;
    type: 'info' | 'action' | 'opponent' | 'result';
}

interface GameToastProps {
    gameLog: string[];
    phase: string;
    isMyTurn: boolean;
    isOver: boolean;
}

let toastId = 0;
const TOAST_DURATION = 6000;

function classifyEntry(entry: string): Toast['type'] {
    if (/icon/i.test(entry)) return 'action';
    if (/replaces/i.test(entry)) return 'action';
    if (/scores|homer|walk-off|run/i.test(entry)) return 'result';
    if (/steals|caught|safe|thrown out|advances/i.test(entry)) return 'result';
    if (/Double Play|DP|Batter out|Batter safe|Force out/i.test(entry)) return 'result';
    if (/Ground Ball|defense decides/i.test(entry)) return 'opponent';
    if (/^--- /.test(entry)) return 'info';
    return 'info';
}

function shouldToast(entry: string): boolean {
    // Skip noisy/redundant entries — these show in the running log
    if (/^Pitch: \d/.test(entry)) return false;
    if (/^Swing: \d/.test(entry)) return false;
    if (/^\w.* vs \w.*$/.test(entry) && !/icon/i.test(entry) && !/steals/i.test(entry)) return false;
    return true;
}

export default function GameToast({ gameLog, phase, isMyTurn, isOver }: GameToastProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const prevLogLenRef = useRef(gameLog?.length || 0);
    const prevPhaseRef = useRef(phase);

    // Game log entries → toasts
    useEffect(() => {
        const logLen = gameLog?.length || 0;
        if (logLen <= prevLogLenRef.current) {
            prevLogLenRef.current = logLen;
            return;
        }
        const newEntries = gameLog.slice(prevLogLenRef.current);
        prevLogLenRef.current = logLen;

        const newToasts: Toast[] = [];
        for (const entry of newEntries) {
            if (!shouldToast(entry)) continue;
            const msg = entry.replace(/^---\s*/, '').replace(/\s*---$/, '');
            newToasts.push({ id: ++toastId, message: msg, type: classifyEntry(entry) });
        }

        if (newToasts.length > 0) {
            // Replace all existing toasts — only show the latest batch
            setToasts(newToasts.slice(-1));
            const ids = newToasts.map(t => t.id);
            setTimeout(() => setToasts(prev => prev.filter(t => !ids.includes(t.id))), TOAST_DURATION);
        }
    }, [gameLog]);

    // Turn change
    useEffect(() => {
        if (phase === prevPhaseRef.current) return;
        prevPhaseRef.current = phase;
        if (isOver) return;
        if (isMyTurn && ['pre_atbat', 'defense_sub', 'pitch', 'swing', 'gb_decision', 'extra_base_offer', 'extra_base', 'steal_sb', 'steal_resolve', 'result_icons', 'bunt_decision'].includes(phase)) {
            const t: Toast = { id: ++toastId, message: 'Your turn', type: 'action' };
            setToasts([t]);
            setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000);
        }
    }, [phase, isMyTurn, isOver]);

    if (toasts.length === 0) return null;

    const typeColors: Record<string, string> = {
        info: '#d4a018',
        action: '#4ade80',
        opponent: '#60a5fa',
        result: '#e94560',
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1500, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, pointerEvents: 'none', paddingTop: 4,
        }}>
            {toasts.map(toast => (
                <div key={toast.id} style={{
                    background: 'rgba(4,12,26,0.95)',
                    border: `3px solid ${typeColors[toast.type] || '#d4a018'}`,
                    borderRadius: 10, padding: '16px 60px',
                    color: typeColors[toast.type] || '#d4a018',
                    fontSize: 32, fontFamily: 'Impact, sans-serif',
                    letterSpacing: 2, textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                    animation: 'toastSlideDown 0.3s ease-out',
                    minWidth: 400,
                }}>
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
