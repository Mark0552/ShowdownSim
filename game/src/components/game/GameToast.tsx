import { useState, useEffect, useRef } from 'react';

interface Toast {
    id: number;
    message: string;
    type: 'info' | 'action' | 'opponent' | 'result';
}

interface GameToastProps {
    gameLog: string[];
    diceAnimating: boolean;
}

let toastId = 0;
const TOAST_DURATION = 3000;
const MAX_VISIBLE = 5;

function classifyEntry(entry: string): Toast['type'] {
    if (/homer|walk-off|grand slam|scores/i.test(entry)) return 'result';
    if (/steals|caught|safe|thrown out|advances|out at/i.test(entry)) return 'result';
    if (/Double Play|DP|Batter out|Batter safe|Force out/i.test(entry)) return 'result';
    if (/icon/i.test(entry)) return 'action';
    if (/replaces|enters|pinch/i.test(entry)) return 'action';
    if (/Ground Ball|defense decides/i.test(entry)) return 'opponent';
    if (/^--- /.test(entry)) return 'info';
    return 'info';
}

function shouldToast(entry: string): boolean {
    // Skip only pure-math pitch lines — everything else (including Swing + outcome) shows
    if (/^Pitch: \d/.test(entry)) return false;
    if (/^Pitch Roll:/.test(entry)) return false;
    return true;
}

export default function GameToast({ gameLog, diceAnimating }: GameToastProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const prevLogLenRef = useRef(gameLog?.length || 0);
    const pendingQueueRef = useRef<Toast[]>([]);
    // Dedupe: track messages shown in the last 5 seconds so identical entries
    // (e.g., a defensive play that emits the same line twice via different
    // server paths) don't toast multiple times.
    const recentMessagesRef = useRef<Map<string, number>>(new Map());
    const DEDUPE_WINDOW_MS = 5000;

    // Collect new log entries; flush when dice not animating
    useEffect(() => {
        const logLen = gameLog?.length || 0;
        if (logLen > prevLogLenRef.current) {
            const newEntries = gameLog.slice(prevLogLenRef.current);
            const now = Date.now();
            // Prune expired dedupe entries
            for (const [msg, ts] of recentMessagesRef.current) {
                if (now - ts > DEDUPE_WINDOW_MS) recentMessagesRef.current.delete(msg);
            }
            for (const entry of newEntries) {
                if (!shouldToast(entry)) continue;
                const msg = entry.replace(/^---\s*/, '').replace(/\s*---$/, '');
                // Skip if same message already pending
                if (pendingQueueRef.current.some(t => t.message === msg)) continue;
                // Skip if same message was shown within dedupe window
                if (recentMessagesRef.current.has(msg)) continue;
                recentMessagesRef.current.set(msg, now);
                pendingQueueRef.current.push({
                    id: ++toastId,
                    message: msg,
                    type: classifyEntry(entry),
                });
            }
            prevLogLenRef.current = logLen;
        } else if (logLen < prevLogLenRef.current) {
            prevLogLenRef.current = logLen;
        }
    }, [gameLog]);

    // Flush pending toasts once dice animation finishes (staggered so they're readable)
    useEffect(() => {
        if (diceAnimating) return;
        if (pendingQueueRef.current.length === 0) return;

        const pending = pendingQueueRef.current;
        pendingQueueRef.current = [];

        pending.forEach((toast, i) => {
            setTimeout(() => {
                setToasts(prev => [...prev, toast].slice(-MAX_VISIBLE));
                setTimeout(() => {
                    setToasts(prev => prev.filter(t => t.id !== toast.id));
                }, TOAST_DURATION);
            }, i * 400);
        });
    }, [diceAnimating, gameLog]);

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
            gap: 8, pointerEvents: 'none', paddingTop: 4,
        }}>
            {toasts.map(toast => (
                <div key={toast.id} style={{
                    background: 'rgba(4,12,26,0.95)',
                    border: `3px solid ${typeColors[toast.type] || '#d4a018'}`,
                    borderRadius: 10, padding: '14px 50px',
                    color: typeColors[toast.type] || '#d4a018',
                    fontSize: 28, fontFamily: 'Impact, sans-serif',
                    letterSpacing: 2, textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                    animation: 'toastSlideDown 0.3s ease-out',
                    minWidth: 380,
                }}>
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
