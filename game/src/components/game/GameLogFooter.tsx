interface Props {
    /** SVG coordinates for the foreignObject wrapper. Required when layout="svg". */
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    /** Frozen log slice — entries that have already settled (i.e. dice not animating). */
    displayedGameLog: string[];
    onShowDiceRolls: () => void;
    onShowFullLog: () => void;
    /** "svg" (default) wraps the log HTML in a <foreignObject> for placement
     *  inside the parent game-board SVG. "html" returns the same content as
     *  a plain div for direct CSS-grid placement on mobile. */
    layout?: 'svg' | 'html';
}

/**
 * Running game-log footer with the last ~12 entries (color-coded) plus
 * DICE ROLLS / EXPAND buttons.
 */
export default function GameLogFooter({
    x, y, width, height,
    displayedGameLog,
    onShowDiceRolls, onShowFullLog,
    layout = 'svg',
}: Props) {
    if (layout === 'html') {
        return (
            <div className="gb-m-gamelog">
                <div className="gb-m-gamelog-buttons">
                    <button className="gb-m-gamelog-btn" onClick={onShowDiceRolls} title="Show dice rolls and per-player averages">DICE ROLLS</button>
                    <button className="gb-m-gamelog-btn" onClick={onShowFullLog} title="Expand log">EXPAND</button>
                </div>
                <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} className="gb-m-gamelog-entries">
                    {displayedGameLog.slice(-12).map((entry, i) => {
                        const cls = entryClass(entry);
                        return <div key={`gl-${i}`} className={`gb-m-gamelog-entry ${cls}`}>{entry}</div>;
                    })}
                </div>
            </div>
        );
    }

    return (
        <foreignObject x={x} y={y} width={width} height={height}>
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <button onClick={onShowDiceRolls} title="Show dice rolls and per-player averages" style={{
                    position: 'absolute', top: 2, right: 66, zIndex: 2,
                    background: 'rgba(10, 20, 40, 0.85)', border: '1px solid #d4a018', borderRadius: 3,
                    padding: '1px 6px', cursor: 'pointer', fontSize: 9, color: '#d4a018',
                    fontFamily: 'Arial', fontWeight: 600, letterSpacing: 1,
                }}>DICE ROLLS</button>
                <button onClick={onShowFullLog} title="Expand log" style={{
                    position: 'absolute', top: 2, right: 2, zIndex: 2,
                    background: 'rgba(10, 20, 40, 0.85)', border: '1px solid #d4a018', borderRadius: 3,
                    padding: '1px 6px', cursor: 'pointer', fontSize: 9, color: '#d4a018',
                    fontFamily: 'Arial', fontWeight: 600, letterSpacing: 1,
                }}>EXPAND</button>
                <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} style={{
                    width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden',
                    padding: '4px 6px', boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    scrollbarWidth: 'thin', scrollbarColor: '#d4a01840 transparent',
                }}>
                    {displayedGameLog.slice(-12).map((entry: string, i: number) => {
                        const isInning = /^--- /.test(entry);
                        const isIcon = /icon/i.test(entry);
                        const isScore = /scores|homer|run/i.test(entry);
                        const isOut = /strikeout|ground|fly|popup|Double Play|DP|caught|thrown out|Batter out|Force out/i.test(entry);
                        let color = '#8aade0';
                        if (isInning) color = '#d4a018';
                        else if (isIcon) color = '#4ade80';
                        else if (isScore) color = '#e94560';
                        else if (isOut) color = '#ff6060';
                        return (
                            <div key={`gl-${i}`} style={{
                                fontSize: isInning ? '11px' : '10px',
                                color, fontFamily: 'Arial, sans-serif',
                                padding: '1px 0', lineHeight: '1.3',
                                borderTop: isInning ? '1px solid #d4a01840' : 'none',
                                marginTop: isInning ? '3px' : '0',
                            }}>
                                {entry}
                            </div>
                        );
                    })}
                </div>
            </div>
        </foreignObject>
    );
}

function entryClass(entry: string): string {
    if (/^--- /.test(entry)) return 'inning';
    if (/icon/i.test(entry)) return 'icon';
    if (/scores|homer|run/i.test(entry)) return 'score';
    if (/strikeout|ground|fly|popup|Double Play|DP|caught|thrown out|Batter out|Force out/i.test(entry)) return 'out';
    return '';
}
