import './GameBoard.css';

interface GameLogOverlayProps {
    gameLog: string[];
    onClose: () => void;
}

/** Game log overlay — scrolling play-by-play */
export default function GameLogOverlay({ gameLog, onClose }: GameLogOverlayProps) {
    return (
        <div className="overlay-panel">
            <div className="overlay-panel-header">
                <span className="overlay-panel-title">GAME LOG</span>
                <button className="overlay-close" onClick={onClose}>CLOSE</button>
            </div>
            <div className="game-log-entries">
                {gameLog.map((entry, i) => {
                    let cls = 'log-entry';
                    if (entry.startsWith('---')) cls = 'log-entry-inning';
                    else if (entry.includes('HOME RUN') || entry.includes('homer')) cls = 'log-entry-hr';
                    else if (entry.includes('Single') || entry.includes('Double') || entry.includes('Triple') || entry.includes('scores')) cls = 'log-entry-hit';
                    else if (entry.includes('Strikeout') || entry.includes('Ground Ball') || entry.includes('Fly Ball') || entry.includes('Popup') || entry.includes('Double Play')) cls = 'log-entry-out';
                    return <div key={i} className={cls}>{entry}</div>;
                })}
            </div>
        </div>
    );
}
