import type { PlayerSlot } from '../../engine/gameEngine';
import CardSlot from './CardSlot';
import { DX, DW, MAIN_TOP, MAIN_BOT } from './gameBoardLayout';

// Field/diamond geometry — kept here so the parent doesn't need to know
// the diamond's coordinate math.
const DS = 0.372;
const D_OFF_X = DX;
const D_OFF_Y = MAIN_TOP + ((MAIN_BOT - MAIN_TOP) - 1830 * DS) / 2;

const basePos = (nx: number, ny: number) => ({
    x: D_OFF_X + (nx - 31.455) * DS,
    y: D_OFF_Y + (ny - 189.888) * DS,
});
const HP = basePos(196, 1842);
const B3 = basePos(218, 731);
const B2 = basePos(1349, 731);
const B1 = basePos(1349, 1818);
const MOUND = basePos(770, 1285);

/** Card-slot positions for runners + pitcher + batter. Exported so parent
 *  components can drive runner animations against the same coordinate
 *  system the diamond renders in. */
export const BASE_COORDS: Record<string, { x: number; y: number }> = {
    home: { x: HP.x - 38, y: HP.y - 53 },
    first: { x: B1.x - 38, y: B1.y - 53 },
    second: { x: B2.x - 38, y: B2.y - 53 },
    third: { x: B3.x - 38, y: B3.y - 53 },
    scored: { x: HP.x - 38, y: HP.y - 53 },
    out: { x: 0, y: 0 },
};

interface Props {
    /** Frozen runners on each base — null when nobody (or animation-hidden). */
    runner1: PlayerSlot | null;
    runner2: PlayerSlot | null;
    runner3: PlayerSlot | null;
    /** Frozen pitcher on the mound. */
    pitcher: PlayerSlot;
    /** Batter at home plate, or null when the slot should be empty
     *  (e.g. during runner / extra-base animations). Computed in parent. */
    batter: PlayerSlot | null;
    /** Frozen phase + game-over flag — drives whether base cards / IP show. */
    displayPhase: string;
    displayIsOver: boolean;
    /** Pitcher IP indicator values (frozen). */
    inningsPitching: number;
    effectiveIp: number;
    fatigueActive: boolean;
    fatiguePenalty: number;
    /** Hover handlers for tooltips. */
    onPlayerHover: (player: PlayerSlot, e: React.MouseEvent) => void;
    onPlayerLeave: () => void;
}

/**
 * Decorative diamond field plus per-base card slots, runner-speed labels,
 * and pitcher IP/fatigue indicator. Rendered inside the parent SVG using
 * the existing 1400×950 coordinate system.
 *
 * Runner animation overlays (which slide cards along base paths) live in
 * the parent and reference the exported BASE_COORDS for their geometry.
 */
export default function Diamond({
    runner1, runner2, runner3, pitcher, batter,
    displayPhase, displayIsOver,
    inningsPitching, effectiveIp, fatigueActive, fatiguePenalty,
    onPlayerHover, onPlayerLeave,
}: Props) {
    return (
        <>
            <defs>
                <clipPath id="fieldClip"><rect x={DX} y={MAIN_TOP} width={DW} height={MAIN_BOT - MAIN_TOP}/></clipPath>
            </defs>

            <g clipPath="url(#fieldClip)">
                <g transform={`translate(${D_OFF_X},${D_OFF_Y}) scale(${DS}) translate(-31.455,-189.888)`}>
                    <rect x="31.455" y="189.888" width="1830" height="1830" fill="rgb(65,156,63)"/>
                    <path fill="rgb(203,145,77)" d="M 161.456 340.85 C 236.09 309.545 287.723 285.02 287.723 285.02 C 287.723 285.02 505.579 221.841 555.281 215.348 C 764.876 187.182 978.157 217.823 1171.37 303.857 C 1447.38 428.065 1662.63 657.132 1769.66 940.487 C 1850.9 1156.94 1864.42 1393.04 1808.36 1617.37 C 1789.75 1691.3 1765.98 1755.02 1735.16 1824.23 C 1732.48 1830.4 1729.59 1836.46 1726.52 1842.46 C 1725.34 1844.92 1722.97 1850.37 1721.71 1852.52 C 1716.9 1861.78 1711.35 1874.77 1706.86 1884.48 C 1669.04 1885.97 1623.05 1884.77 1584.73 1884.78 L 1354.07 1884.8 L 688.131 1885.69 C 617.928 1886 547.725 1885.94 477.513 1885.53 C 449.972 1885.17 422.422 1884.95 394.872 1884.92 C 378.994 1884.87 359.079 1884.3 343.639 1885.81 C 340.736 1902.65 333.319 1919.16 324.321 1933.6 C 302.428 1968.12 267.818 1992.6 228 2001.73 C 147.228 2019.72 63.434 1965.44 45.955 1884.64 C 37.097 1845.1 44.742 1803.65 67.132 1769.88 C 86.738 1739.89 126.349 1711.49 160.908 1704.11 C 159.506 1685.9 159.865 1660.47 159.745 1641.9 L 159.616 1530.49 L 160.073 1219.36 L 160.66 713.474 C 160.63 590.134 159.665 464.071 161.456 340.85 Z"/>
                    <path fill="rgb(254,254,248)" d="M 182.586 331.717 C 197.127 326.783 192.546 326.852 192.546 326.852 L 196.998 1615.42 C 197.036 1648.9 199.147 1699.41 195.916 1731.52 C 208.744 1744.53 221.448 1757.65 234.027 1770.9 C 222.647 1782.35 211.38 1793.91 200.23 1805.58 C 209.481 1813.84 223.745 1825.76 229.7 1836.43 L 231.145 1836.61 C 242.258 1826.27 256.635 1813.5 266.965 1802.61 C 276.207 1812.11 295.466 1832.58 305.604 1840.28 L 1317.96 1840.34 C 1485.32 1840.193 1730.16 1839.724 1730.16 1839.724 C 1724.311 1852.629 1724.403 1853.461 1724.348 1852.866 L 1332.49 1852.29 L 309.572 1853.41 C 285.646 1874.97 259.632 1904.34 235.45 1927.5 C 224.447 1917.57 213.56 1906.41 203.003 1895.9 C 190.128 1906.45 168.472 1928.98 156.477 1941.2 C 141.207 1928.98 109.054 1896.12 96.942 1881.26 C 105.804 1869.24 130.219 1846.6 141.913 1835.29 C 131.419 1823.22 120.271 1812.18 109.021 1800.84 C 122.32 1782.94 166.24 1742.15 183.947 1724.86 C 183.947 1724.86 184.005 1072.309 183.981 746.034 C 183.971 617.636 182.586 331.717 182.586 331.717 Z"/>
                    <path fill="rgb(203,145,77)" d="M 115.212 1884.39 C 123.005 1874.26 137.002 1858.82 147.632 1851.88 C 159.163 1844.35 166.909 1840.52 177.845 1831.44 C 179.782 1837.75 181.825 1844.02 183.972 1850.26 C 192.697 1858.66 198.851 1858.19 210.187 1857.73 L 211.149 1859.3 C 191.283 1875.6 199.127 1875.5 186.392 1895.1 C 182.035 1901.81 163.297 1919.23 156.85 1925.39 C 142.626 1913.41 129.596 1897.25 115.212 1884.39 z"/>
                    <path fill="rgb(221,220,214)" d="M 229.7 1838.1 L 231.145 1838.28 C 225.155 1845.58 217.608 1852.28 211.149 1859.3 L 210.187 1857.73 C 212.621 1853.54 225.639 1841.11 229.7 1838.1 z"/>
                    <path fill="rgb(203,145,77)" d="M 186.923 1742.67 C 193.876 1747.32 210.009 1765.31 216.187 1772.04 C 196.84 1791.99 177.174 1811.63 157.195 1830.95 C 147.115 1822.6 136.669 1811.42 127.648 1801.88 L 186.923 1742.67 z"/>
                    <path fill="rgb(203,145,77)" d="M 266.607 1822.88 C 276.017 1831.62 285.985 1842.19 295.06 1851.46 L 236.619 1909.92 C 229.208 1904.27 215.036 1890.07 207.626 1883.09 C 227.467 1863.16 246.402 1842.92 266.607 1822.88 z"/>
                    <path fill="rgb(221,220,214)" d="M 194.165 1813.83 L 194.503 1815.4 C 193.625 1817.92 185.292 1825.99 182.768 1828.7 L 182.538 1826.12 C 184.963 1822.06 190.567 1817.26 194.165 1813.83 z"/>
                    <path fill="rgb(65,156,63)" d="M 1132.11 786.381 C 1145.61 786.396 1159.09 786.252 1172.57 785.949 C 1185.93 813.756 1193.33 845.101 1219.75 865.817 C 1239.86 881.588 1266.63 892.383 1291.14 900.525 L 1291.06 1651.54 C 1278.13 1654.14 1265.59 1658.27 1253.71 1663.8 C 1205.26 1686.68 1188.93 1718.8 1172.7 1764.99 L 430.362 1765.07 L 391.152 1765.1 C 364.09 1693.45 345.391 1677.54 271.255 1650.68 C 269.5 1401.31 269.463 1151.92 271.145 902.543 C 346.691 871.364 362.201 863.447 391.521 786.705 L 1132.11 786.381 Z"/>
                    <path fill="rgb(203,145,77)" d="M 762.163 1166.41 C 827.854 1162.28 884.383 1212.34 888.222 1278.05 C 892.061 1343.76 841.748 1400.07 776.023 1403.62 C 710.705 1407.15 654.823 1357.21 651.007 1291.91 C 647.192 1226.61 696.879 1170.51 762.163 1166.41 Z"/>
                    <path fill="rgb(254,254,248)" d="M 754.124 1260.5 C 759.628 1263.93 792.2 1295.65 799.286 1302.41 L 786.641 1315.18 C 777.72 1311.58 749.945 1280.99 742.113 1272.5 C 745.904 1268.52 750.2 1264.4 754.124 1260.5 Z"/>
                    <path fill="rgb(254,254,248)" d="M 1325.05 707.235 C 1339.71 706.882 1358.53 706.892 1372.97 707.506 L 1372.92 754.147 L 1325 754.037 L 1325.05 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 193.754 707.235 C 208.414 706.882 227.234 706.892 241.674 707.506 L 241.624 754.147 L 193.704 754.037 L 193.754 707.235 Z"/>
                    <path fill="rgb(254,254,248)" d="M 1325.05 1794.28 C 1339.71 1793.93 1358.53 1793.94 1372.97 1794.55 L 1372.92 1841.2 L 1325 1841.08 L 1325.05 1794.28 Z"/>
                </g>
            </g>

            {/* Runner speed labels — centered above each base card */}
            {!displayIsOver && runner1 && <text x={B1.x} y={B1.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner1.speed}</text>}
            {!displayIsOver && runner2 && <text x={B2.x} y={B2.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner2.speed}</text>}
            {!displayIsOver && runner3 && <text x={B3.x} y={B3.y - 58} textAnchor="middle" fontSize="18" fill="white" fontWeight="normal" fontFamily="Impact">Speed: {runner3.speed}</text>}

            {/* Card slots centered on bases — hidden during SP roll AND after game over (players leave field) */}
            {displayPhase !== 'sp_roll' && !displayIsOver && (
                <>
                    <CardSlot x={B2.x - 38} y={B2.y - 53} label="2B" card={runner2} onHover={onPlayerHover} onLeave={onPlayerLeave}/>
                    <CardSlot x={B1.x - 38} y={B1.y - 53} label="1B" card={runner1} onHover={onPlayerHover} onLeave={onPlayerLeave}/>
                    <CardSlot x={B3.x - 38} y={B3.y - 53} label="3B" card={runner3} onHover={onPlayerHover} onLeave={onPlayerLeave}/>
                    <CardSlot x={MOUND.x - 38} y={MOUND.y - 53} label="P" card={pitcher} onHover={onPlayerHover} onLeave={onPlayerLeave}/>
                    <CardSlot x={HP.x - 38} y={HP.y - 53} label="H" card={batter} onHover={onPlayerHover} onLeave={onPlayerLeave}/>
                </>
            )}

            {/* IP / Fatigue near pitcher — hidden during SP roll AND game over */}
            {displayPhase !== 'sp_roll' && !displayIsOver && (
                <>
                    <rect x={MOUND.x - 42} y={MOUND.y + 56} width="84" height="20" rx="4" fill="rgba(0,0,0,0.75)"/>
                    <text x={MOUND.x} y={MOUND.y + 70} textAnchor="middle" fontSize="10" fill={fatigueActive ? '#ff6060' : '#8aade0'} fontWeight="normal" fontFamily="monospace">
                        IP: {inningsPitching}/{effectiveIp}{fatigueActive ? ` (-${fatiguePenalty})` : ''}
                    </text>
                </>
            )}
        </>
    );
}
