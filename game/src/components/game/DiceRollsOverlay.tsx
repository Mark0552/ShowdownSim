import './GameBoard.css';

interface DiceRollsOverlayProps {
    gameLog: string[];
    homeName: string;
    awayName: string;
    onClose: () => void;
}

type Side = 'home' | 'away';
interface ParsedRoll { roll: number; type: 'Pitch' | 'Swing' | 'Fielding' | 'SP'; side: Side; }

/** Walk the game log and extract every d20 roll, tagging each with which
 *  side made it based on the current half-inning context. */
function parseRolls(log: string[]): ParsedRoll[] {
    const rolls: ParsedRoll[] = [];
    let isBottom = false;
    for (const line of log) {
        if (/^--- Top of/i.test(line)) { isBottom = false; continue; }
        if (/^--- Bottom of/i.test(line)) { isBottom = true; continue; }
        const batting: Side = isBottom ? 'home' : 'away';
        const fielding: Side = isBottom ? 'away' : 'home';

        // Swing roll — offense
        const mSwing = line.match(/^Swing:\s*(\d+)/);
        if (mSwing) { rolls.push({ roll: parseInt(mSwing[1], 10), type: 'Swing', side: batting }); continue; }

        // Pitch roll — defense
        const mPitch = line.match(/^Pitch:\s*(\d+)/);
        if (mPitch) { rolls.push({ roll: parseInt(mPitch[1], 10), type: 'Pitch', side: fielding }); continue; }

        // Starting pitcher roll — before play begins, attribute to away (first up)
        const mSp = line.match(/Starting pitcher roll: d20\((\d+)\)/);
        if (mSp) { rolls.push({ roll: parseInt(mSp[1], 10), type: 'SP', side: 'away' }); continue; }

        // Any d20(N) inside the line — fielding play (DP, steal defense, extra-base throw).
        // Use exec loop in case a line has multiple (rare but possible).
        const d20Re = /d20\((\d+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = d20Re.exec(line)) !== null) {
            rolls.push({ roll: parseInt(m[1], 10), type: 'Fielding', side: fielding });
        }
    }
    return rolls;
}

function summaryForSide(rolls: ParsedRoll[], side: Side) {
    const mine = rolls.filter(r => r.side === side);
    const avg = mine.length === 0 ? 0 : mine.reduce((a, b) => a + b.roll, 0) / mine.length;
    const byType: Record<string, number[]> = {};
    for (const r of mine) {
        if (!byType[r.type]) byType[r.type] = [];
        byType[r.type].push(r.roll);
    }
    return { all: mine, avg, byType };
}

function mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Dice rolls breakdown overlay — parses the game log, shows each player's
 *  rolls by type and their averages. */
export default function DiceRollsOverlay({ gameLog, homeName, awayName, onClose }: DiceRollsOverlayProps) {
    const rolls = parseRolls(gameLog);
    const home = summaryForSide(rolls, 'home');
    const away = summaryForSide(rolls, 'away');

    const renderSide = (label: string, sum: ReturnType<typeof summaryForSide>) => (
        <div style={{ flex: 1, minWidth: 0, padding: 12 }}>
            <div style={{ color: '#d4a018', fontSize: 16, fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid #d4a01840', paddingBottom: 4 }}>
                {label}
            </div>
            <div style={{ color: '#8aade0', fontSize: 12, marginBottom: 10 }}>
                {sum.all.length} rolls &nbsp;·&nbsp; avg <span style={{ color: '#fff', fontWeight: 600 }}>{sum.avg.toFixed(2)}</span>
            </div>
            {Object.keys(sum.byType).length === 0 ? (
                <div style={{ color: '#6a8aba', fontSize: 11, fontStyle: 'italic' }}>No rolls yet</div>
            ) : (
                Object.entries(sum.byType).map(([type, arr]) => (
                    <div key={type} style={{ marginBottom: 10 }}>
                        <div style={{ color: '#d4a018', fontSize: 11, letterSpacing: 1, marginBottom: 2 }}>
                            {type.toUpperCase()} <span style={{ color: '#8aade0' }}>({arr.length}) &nbsp;avg <span style={{ color: '#fff' }}>{mean(arr).toFixed(2)}</span></span>
                        </div>
                        <div style={{ color: '#eee', fontFamily: 'Consolas, monospace', fontSize: 11, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {arr.join(', ')}
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div className="overlay-panel" style={{ minWidth: 'min(800px, 92vw)', maxWidth: '92vw', maxHeight: '85vh' }}>
            <div className="overlay-panel-header">
                <span className="overlay-panel-title">DICE ROLLS</span>
                <button className="overlay-close" onClick={onClose}>CLOSE</button>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowY: 'auto', flexWrap: 'wrap' }}>
                {renderSide(`AWAY — ${awayName || 'Away'}`, away)}
                {renderSide(`HOME — ${homeName || 'Home'}`, home)}
            </div>
        </div>
    );
}
