interface Props {
    seriesInfo?: {
        gameNumber: number;
        bestOf: number;
        homeWins: number;
        awayWins: number;
    };
    homeName: string;
    awayName: string;
    showStats: boolean;
    onToggleStats: () => void;
    onExit?: () => void;
}

/**
 * Three SVG controls anchored to the top bar of the game board:
 *   - EXIT GAME button (top-left)
 *   - Series indicator (left, below exit, when in a multi-game series)
 *   - BOX SCORE / CLOSE toggle (top-right)
 */
export default function TopBarControls({
    seriesInfo, homeName, awayName, showStats, onToggleStats, onExit,
}: Props) {
    return (
        <>
            {/* Exit button — goes straight to the lobby via the onExit
                callback (not window.history.back(), which could land on
                the waiting-for-opponent screen if that was the prior
                entry). */}
            <g cursor="pointer" className="roll-button" onClick={() => onExit?.()}>
                <rect x="8" y="8" width="80" height="34" rx="4" fill="#3a0a0a" stroke="#e94560" strokeWidth="1"/>
                <text x="48" y="30" textAnchor="middle" fontSize="12" fill="#e94560" fontWeight="normal" fontFamily="Arial">EXIT GAME</text>
            </g>

            {/* Series indicator — left, below exit (when in a series) */}
            {seriesInfo && (
                <g>
                    <rect x="8" y="46" width="200" height="30" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                    <text x="108" y="59" textAnchor="middle" fontSize="10" fill="#d4a018" fontWeight="normal" letterSpacing="1" fontFamily="Impact">
                        SERIES — GAME {seriesInfo.gameNumber} of {seriesInfo.bestOf}
                    </text>
                    <text x="108" y="71" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="normal" fontFamily="Arial">
                        {homeName} {seriesInfo.homeWins} {'–'} {seriesInfo.awayWins} {awayName}
                    </text>
                </g>
            )}

            {/* Box Score toggle — top right */}
            <g cursor="pointer" onClick={onToggleStats}>
                <rect x="1338" y="8" width="54" height="40" rx="4" fill="#0a1428" stroke="#d4a018" strokeWidth="1"/>
                {showStats ? (
                    <text x="1365" y="33" textAnchor="middle" fontSize="12" fill="#d4a018" fontWeight="normal" fontFamily="Arial">CLOSE</text>
                ) : (
                    <>
                        <text x="1365" y="24" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="normal" fontFamily="Arial">BOX</text>
                        <text x="1365" y="40" textAnchor="middle" fontSize="11" fill="#d4a018" fontWeight="normal" fontFamily="Arial">SCORE</text>
                    </>
                )}
            </g>
        </>
    );
}
