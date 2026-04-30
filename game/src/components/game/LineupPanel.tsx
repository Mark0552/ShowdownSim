import type { PlayerSlot, TeamState } from '../../engine/gameEngine';
import { penaltyForAssignment } from '../../lib/fielding';
import { PW, MAIN_TOP, MAIN_BOT } from './gameBoardLayout';

interface Props {
    /** Frozen team for this panel (away or home). */
    team: TeamState;
    /** SVG x-offset where the panel starts (0 for away, HX for home). */
    panelX: number;
    isHome: boolean;
    teamName: string;
    /** Frozen half-inning — drives at-bat / on-deck highlighting. */
    displayHalfInning: string;
    /** Frozen current inning — drives pitcher IP display. */
    displayInning: number;
    /** Frozen icon20-used flag — used to cross out the 20 icon when the
     *  active fielding pitcher has used it this half-inning. */
    displayIcon20Used: boolean;
    /** Hover handlers for the player tooltip. */
    onPlayerHover: (player: PlayerSlot, e: React.MouseEvent) => void;
    onPlayerLeave: () => void;
    /** Bullpen panel open state + toggle. */
    bullpenOpen: boolean;
    onToggleBullpen: () => void;
    /** "svg" (default) renders SVG groups for placement inside the parent
     *  game-board SVG. "html" renders a flex/list panel for direct CSS-grid
     *  placement on mobile. */
    layout?: 'svg' | 'html';
}

interface IconItem { icon: string; used: boolean; }

/** Build the per-player icon-display list (with used/unused state). Shared
 *  between SVG and HTML render paths so the cross-out logic stays in sync. */
function buildIconItems(
    player: PlayerSlot,
    team: TeamState,
    isFieldingHalf: boolean,
    displayIcon20Used: boolean,
): IconItem[] {
    if (!player.icons || player.icons.length === 0) return [];
    const usage = team.iconUsage?.[player.cardId] || {};
    const maxUses: Record<string, number> = { V: 2 };
    const isActivePitcher = team.pitcher.cardId === player.cardId;
    const items: IconItem[] = [];
    for (const icon of player.icons) {
        // CY is never crossed out (passive ability checked at end of inning)
        if (icon === 'CY') { items.push({ icon, used: false }); continue; }
        // 20 only crossed out when this pitcher is actively pitching and used it this inning
        if (icon === '20') {
            const crossed = isActivePitcher && isFieldingHalf && displayIcon20Used;
            items.push({ icon, used: crossed });
            continue;
        }
        const max = maxUses[icon] || 1; const used = usage[icon] || 0;
        for (let i = 0; i < max; i++) items.push({ icon, used: i < used });
    }
    return items;
}

/**
 * One side's full lineup panel (away or home).
 * Renders: panel background, team header label, 9 batter rows, pitcher
 * row, and the BULLPEN/BENCH toggle button.
 */
export default function LineupPanel({
    team, panelX, isHome, teamName,
    displayHalfInning, displayInning, displayIcon20Used,
    onPlayerHover, onPlayerLeave,
    bullpenOpen, onToggleBullpen,
    layout = 'svg',
}: Props) {
    const w = PW - 12;

    // Whether this panel's team is the fielding team this half-inning —
    // used to decide if the 20-icon should display as crossed out.
    const isFieldingHalf = (isHome && displayHalfInning === 'top') || (!isHome && displayHalfInning === 'bottom');

    if (layout === 'html') {
        // Horizontal strip: 9 batters left-to-right in batting order. Each
        // cell stacks pos+fielding above the card image and an abbreviated
        // name + icons below. Pitcher is shown on the diamond, not here.
        const renderStripCell = (player: PlayerSlot, i: number) => {
            const isAtBat = (isHome ? displayHalfInning === 'bottom' : displayHalfInning === 'top') && i === team.currentBatterIndex;
            const isOnDeck = (isHome ? displayHalfInning === 'top' : displayHalfInning === 'bottom') && i === team.currentBatterIndex;
            const rawPos = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
            const pos = rawPos === 'bench' ? '' : rawPos;
            const penalty = pos ? penaltyForAssignment(player.positions, player.assignedPosition) : 0;
            const rawFld = pos === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0);
            const effFld = rawFld + penalty;
            const fld = pos ? (effFld >= 0 ? `+${effFld}` : `${effFld}`) : '';
            const items = buildIconItems(player, team, isFieldingHalf, displayIcon20Used);
            const cellCls = `gb-m-strip-cell${isAtBat ? ' at-bat' : isOnDeck ? ' on-deck' : ''}`;
            // Last name only, abbreviated. "Alex Rodriguez" -> "Rodriguez"
            const shortName = player.name.includes(' ')
                ? player.name.slice(player.name.lastIndexOf(' ') + 1)
                : player.name;
            return (
                <div key={`${isHome ? 'h' : 'a'}-${i}`} className={cellCls}
                    onMouseEnter={(e) => onPlayerHover(player, e)} onMouseLeave={onPlayerLeave}>
                    <div className={`gb-m-strip-pos${penalty < 0 ? ' penalty' : ''}`}>
                        {pos && fld ? `${pos} ${fld}` : ' '}
                    </div>
                    {player.imagePath && <img className="gb-m-strip-thumb" src={player.imagePath} alt=""/>}
                    <div className="gb-m-strip-name">{shortName}</div>
                    {items.length > 0 && (
                        <div className="gb-m-strip-icons">
                            {items.map((item, idx) => (
                                <span key={idx} className={item.used ? 'used' : ''}>{item.icon}</span>
                            ))}
                        </div>
                    )}
                </div>
            );
        };

        return (
            <div className={`gb-m-strip ${isHome ? 'home' : 'away'}`}>
                {team.lineup.map((p, i) => renderStripCell(p, i))}
            </div>
        );
    }

    const renderIcons = (player: PlayerSlot, xPos: number, yPos: number) => {
        const items = buildIconItems(player, team, isFieldingHalf, displayIcon20Used);
        if (items.length === 0) return null;
        return (
            <text x={xPos} y={yPos} fontSize="14" fontFamily="Arial" fontWeight="normal">
                {items.map((item, i) => (
                    <tspan key={i} fill={item.used ? '#4a3030' : '#d4a018'} textDecoration={item.used ? 'line-through' : 'none'}>{item.icon}{i < items.length - 1 ? ' ' : ''}</tspan>
                ))}
            </text>
        );
    };

    const renderLineup = () => team.lineup.map((player, i) => {
        const y = MAIN_TOP + 66 + i * 58;
        const frozenBatIdx = team.currentBatterIndex;
        const isAtBat = (isHome ? displayHalfInning === 'bottom' : displayHalfInning === 'top') && i === frozenBatIdx;
        const isOnDeck = (isHome ? displayHalfInning === 'top' : displayHalfInning === 'bottom') && i === frozenBatIdx;
        const rawPos = player.assignedPosition ? player.assignedPosition.replace(/-\d+$/, '') : '';
        const pos = rawPos === 'bench' ? '' : rawPos; // don't show "bench" as position
        // Effective fielding = raw + penalty. Penalty is 0 when native,
        // -1/-2 for 1B OOP, -2 similar / -3 cross / -3 non-catcher-at-C
        // in the forced-accept case. Color red when penalty < 0 so the
        // user immediately sees which player is out of position.
        const penalty = pos ? penaltyForAssignment(player.positions, player.assignedPosition) : 0;
        const rawFld = pos === 'C' ? (player.arm ?? 0) : (player.fielding ?? 0);
        const effFld = rawFld + penalty;
        const fld = pos ? (effFld >= 0 ? `+${effFld}` : `${effFld}`) : '';
        const fldColor = penalty < 0 ? '#f87171' : '#a0c0e0';
        return (
            <g key={`${isHome ? 'h' : 'a'}-${i}`} cursor="pointer" onMouseEnter={(e) => onPlayerHover(player, e.nativeEvent as any)} onMouseLeave={onPlayerLeave}>
                <rect x={panelX + 6} y={y} width={w} height="52" rx="3" fill={isAtBat ? '#1a2858' : isOnDeck ? '#0e1a30' : '#081428'} stroke={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#1a3040'} strokeWidth={isAtBat ? 2.5 : isOnDeck ? 1.5 : 0.5}/>
                <text x={panelX + 20} y={y + 32} fontSize="15" fill={isAtBat ? '#e94560' : isOnDeck ? '#60a5fa' : '#a0c0e0'} fontWeight="normal" fontFamily="Arial">{i + 1}.</text>
                {player.imagePath && <image href={player.imagePath} x={panelX + 40} y={y + 3} width="34" height="46" preserveAspectRatio="xMidYMid slice"/>}
                <text x={panelX + 82} y={y + 22} fontSize="15" fill={isAtBat ? 'white' : '#a0c0e0'} fontWeight="normal" fontFamily="Arial">{player.name.length > 18 ? player.name.slice(0, 17) + '…' : player.name}</text>
                {pos && fld && <text x={panelX + w} y={y + 22} textAnchor="end" fontSize="13" fill={fldColor} fontWeight={penalty < 0 ? 'bold' : 'normal'} fontFamily="Arial">{pos} {fld}</text>}
                {player.icons && player.icons.length > 0 && renderIcons(player, panelX + 82, y + 40)}
            </g>
        );
    });

    // Pitcher row — uses displayInning so the IP counter doesn't tick up
    // the instant the server broadcasts the 3rd-out state change. Without
    // this, the half-inning inning bump would reveal the out ahead of the
    // play animation concluding.
    const renderPitcher = () => {
        const py = MAIN_TOP + 66 + 9 * 58 + 6;
        const pCardIp = team.pitcher.ip || 0;
        const pRuns = team.pitcherStats?.[team.pitcher.cardId]?.r || 0;
        const pCyBonus = team.cyBonusInnings || 0;
        const pEffIp = Math.max(0, pCardIp - Math.floor(pRuns / 3) + pCyBonus);
        const pCurInn = displayInning - (team.pitcherEntryInning || 1) + 1;
        return (
            <g cursor="pointer" onMouseEnter={(e) => onPlayerHover(team.pitcher, e.nativeEvent as any)} onMouseLeave={onPlayerLeave}>
                <rect x={panelX + 6} y={py} width={w} height="48" rx="3" fill="#0c1a40" stroke="#1a3060" strokeWidth="0.5"/>
                <text x={panelX + 16} y={py + 32} fontSize="18" fill="#d4a018" fontWeight="normal" fontFamily="Impact">P</text>
                {team.pitcher.imagePath && <image href={team.pitcher.imagePath} x={panelX + 36} y={py + 3} width="30" height="42" preserveAspectRatio="xMidYMid slice"/>}
                <text x={panelX + 74} y={py + 22} fontSize="15" fill="#a0c0e0" fontWeight="normal" fontFamily="Arial">{team.pitcher.name.length > 16 ? team.pitcher.name.slice(0, 15) + '…' : team.pitcher.name}</text>
                {team.pitcher.icons && team.pitcher.icons.length > 0 && renderIcons(team.pitcher, panelX + 74, py + 40)}
                <text x={panelX + w} y={py + 22} textAnchor="end" fontSize="13" fill="#a0c0e0" fontWeight="normal" fontFamily="Arial">IP {pCurInn}/{pEffIp}</text>
            </g>
        );
    };

    const headerGradient = isHome ? 'url(#redGrad)' : 'url(#navyGrad)';
    const sideLabel = isHome ? 'HOME' : 'AWAY';

    return (
        <>
            <rect x={panelX} y={MAIN_TOP} width={PW} height={MAIN_BOT - MAIN_TOP} fill="url(#panelBg)" stroke="#d4a01830" strokeWidth="1"/>
            <rect x={panelX + 4} y={MAIN_TOP + 4} width={PW - 8} height="30" rx="3" fill={headerGradient}/>
            <text x={panelX + PW / 2} y={MAIN_TOP + 24} textAnchor="middle" fontSize="14" fill="white" fontWeight="normal" letterSpacing="2" fontFamily="Impact,sans-serif">{sideLabel} {'—'} {teamName.toUpperCase()}</text>
            <text x={panelX + PW / 2} y={MAIN_TOP + 54} textAnchor="middle" fontSize="16" fill="#d4a018" fontWeight="normal" letterSpacing="3" fontFamily="Impact">LINEUP</text>
            {renderLineup()}
            {renderPitcher()}
            <g cursor="pointer" className="roll-button" onClick={onToggleBullpen}>
                <rect x={panelX + 6} y={MAIN_BOT - 40} width={PW - 12} height="34" rx="4" fill="#0a1830" stroke="#d4a018" strokeWidth="1"/>
                <text x={panelX + PW / 2} y={MAIN_BOT - 19} textAnchor="middle" fontSize="13" fill="#d4a018" fontWeight="normal" fontFamily="Impact" letterSpacing="1">{bullpenOpen ? '▲ BULLPEN / BENCH' : '▼ BULLPEN / BENCH'}</text>
            </g>
        </>
    );
}
