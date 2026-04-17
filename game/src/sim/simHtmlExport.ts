/**
 * Self-contained HTML report generator. Takes finalized hitter/pitcher results
 * for both icon modes and returns a single HTML string with sortable/filterable
 * tables, card-tooltip-on-hover, and icons-on/off toggle.
 *
 * Ported from buildHtmlPage / buildResultTabs / generateHtmlTable / generateTooltipHtml
 * in simulation/sim.js.
 */

import {
    calculateRegressions,
    calculatePercentiles,
    calculateHitterValueScore,
    calculatePitcherValueScore,
    type HitterFinal,
    type PitcherFinal,
} from './simStats';
import type { SimConfig } from './simEngine';

export interface Column {
    key: string;
    label: string;
    decimals?: number;
    colorCode?: 'positive-good' | 'negative-good';
    desc?: string;
    filter?: 'text';
}

function escapeHtml(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Prefix relative imagePath (e.g. "cards\2004-Base\349374.jpg") with absolute deploy URL
 *  so exported HTML files find images when opened outside the app. */
const CARD_URL_BASE = 'https://mark0552.github.io/ShowdownSim/';
function absoluteImageUrl(imagePath: string | undefined | null): string {
    if (!imagePath) return '';
    const normalized = String(imagePath).replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^https?:\/\//.test(normalized)) return normalized;
    return CARD_URL_BASE + normalized;
}

function tooltipHtml(row: any, isHitter: boolean): string {
    const chart = row.chart;
    if (!chart) return '';
    const imgTag = row.imagePath
        ? `<div class='tt-img'><img src='${escapeHtml(absoluteImageUrl(row.imagePath))}' alt='card'></div>`
        : '';
    if (isHitter) {
        const pos = escapeHtml(row.Position || '-');
        const spd = row.Speed || '-';
        const hand = escapeHtml(row.hand || '-');
        const team = escapeHtml(row.team || '-');
        const edition = escapeHtml(row.edition || '-');
        const year = escapeHtml(row.year || '-');
        const expansion = escapeHtml(row.expansion || '-');
        const icons = escapeHtml(row.icons || 'None');
        return `<div class='tt-layout'>${imgTag}<div class='tt-info'>`
            + `<div class='tt-section'><b>${escapeHtml(row.name)}</b></div>`
            + `<div class='tt-section'><span class='tt-label'>Year:</span> ${year} | <span class='tt-label'>Set:</span> ${expansion} | <span class='tt-label'>Ed:</span> ${edition}</div>`
            + `<div class='tt-section'><span class='tt-label'>Team:</span> ${team} | <span class='tt-label'>Hand:</span> ${hand}</div>`
            + `<div class='tt-section'><span class='tt-label'>Position:</span> ${pos} | <span class='tt-label'>Speed:</span> ${spd} | <span class='tt-label'>OB:</span> ${row.onBase}</div>`
            + `<div class='tt-section'><span class='tt-label'>Icons:</span> ${icons}</div>`
            + `<div class='tt-divider'></div>`
            + `<div class='tt-section tt-chart'>`
            + `<span class='tt-label'>SO:</span> ${chart.SO} | <span class='tt-label'>GB:</span> ${chart.GB} | <span class='tt-label'>FB:</span> ${chart.FB} | <span class='tt-label'>W:</span> ${chart.W}<br>`
            + `<span class='tt-label'>S:</span> ${chart.S} | <span class='tt-label'>S+:</span> ${chart.SPlus} | <span class='tt-label'>DB:</span> ${chart.DB} | <span class='tt-label'>TR:</span> ${chart.TR} | <span class='tt-label'>HR:</span> ${chart.HR}`
            + `</div>`
            + `</div></div>`;
    } else {
        const role = escapeHtml(row.Position || '-');
        const ip = row.IP || '-';
        const hand = escapeHtml(row.hand || '-');
        const team = escapeHtml(row.team || '-');
        const edition = escapeHtml(row.edition || '-');
        const year = escapeHtml(row.year || '-');
        const expansion = escapeHtml(row.expansion || '-');
        const icons = escapeHtml(row.Icons || 'None');
        return `<div class='tt-layout'>${imgTag}<div class='tt-info'>`
            + `<div class='tt-section'><b>${escapeHtml(row.name)}</b></div>`
            + `<div class='tt-section'><span class='tt-label'>Year:</span> ${year} | <span class='tt-label'>Set:</span> ${expansion} | <span class='tt-label'>Ed:</span> ${edition}</div>`
            + `<div class='tt-section'><span class='tt-label'>Team:</span> ${team} | <span class='tt-label'>Hand:</span> ${hand}</div>`
            + `<div class='tt-section'><span class='tt-label'>Role:</span> ${role} | <span class='tt-label'>IP:</span> ${ip} | <span class='tt-label'>Control:</span> ${row.Control}</div>`
            + `<div class='tt-section'><span class='tt-label'>Icons:</span> ${icons}</div>`
            + `<div class='tt-divider'></div>`
            + `<div class='tt-section tt-chart'>`
            + `<span class='tt-label'>PU:</span> ${chart.PU} | <span class='tt-label'>SO:</span> ${chart.SO} | <span class='tt-label'>GB:</span> ${chart.GB} | <span class='tt-label'>FB:</span> ${chart.FB}<br>`
            + `<span class='tt-label'>W:</span> ${chart.W} | <span class='tt-label'>S:</span> ${chart.S} | <span class='tt-label'>DB:</span> ${chart.DB} | <span class='tt-label'>HR:</span> ${chart.HR}`
            + `</div>`
            + `</div></div>`;
    }
}

function renderTable(data: any[], columns: Column[], isHitter: boolean): string {
    if (!data || data.length === 0) return '<p>No data</p>';
    const headers = columns.map((col, i) => {
        const title = col.desc ? ` title="${escapeHtml(col.desc)}"` : '';
        return `<th onclick="sortTable(this)" data-col="${i}"${title}>${col.label}</th>`;
    }).join('');
    const filters = columns.map((col, i) => {
        if (col.filter === 'text' || col.key === 'name' || col.key === 'icons' || col.key === 'Icons'
            || col.key === 'Position' || col.key === 'hand' || col.key === 'edition') {
            return `<th class="filter-cell"><input type="text" class="filter-input" data-col="${i}" data-type="text" placeholder="filter..." oninput="applyFilters(this)"></th>`;
        }
        return `<th class="filter-cell"><div class="filter-range">`
            + `<input type="number" class="filter-input filter-min" data-col="${i}" data-type="min" placeholder="min" oninput="applyFilters(this)" step="any">`
            + `<input type="number" class="filter-input filter-max" data-col="${i}" data-type="max" placeholder="max" oninput="applyFilters(this)" step="any">`
            + `</div></th>`;
    }).join('');
    const rows = data.map(row => {
        const tt = row.chart ? tooltipHtml(row, isHitter) : '';
        const cells = columns.map(col => {
            let val: any = row[col.key];
            if (val === undefined || val === null) val = '';
            if (typeof val === 'number') {
                val = col.decimals !== undefined ? val.toFixed(col.decimals) : val;
            }
            let cls = '';
            if (col.colorCode && typeof row[col.key] === 'number') {
                const v = row[col.key];
                if (col.colorCode === 'positive-good') {
                    if (v > 0.02) cls = ' val-good';
                    else if (v < -0.02) cls = ' val-bad';
                } else if (col.colorCode === 'negative-good') {
                    if (v < -0.02) cls = ' val-good';
                    else if (v > 0.02) cls = ' val-bad';
                }
            }
            if (col.key === 'name') {
                return `<td class="name-cell${cls}" data-tooltip-html="${escapeHtml(tt)}">${val}</td>`;
            }
            return `<td class="${cls}">${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr><tr class="filter-row">${filters}</tr></thead><tbody>${rows}</tbody></table>`;
}

const HITTER_COLUMNS: Column[] = [
    { key: 'valueRating', label: 'Value', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of OPS and wOBA deviation from regression, scaled to 0-100 centered at 50. Higher = better value for the card\'s point cost.' },
    { key: 'name', label: 'Name', desc: 'Player name, year, edition, card number, team. Hover for full card details.' },
    { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost for team building. Higher points = stronger card.' },
    { key: 'onBase', label: 'OB', decimals: 0, desc: 'On-Base number. Pitcher must roll d20 + Control > this to use pitcher\'s chart. Higher = better hitter.' },
    { key: 'Speed', label: 'Spd', decimals: 0, desc: 'Speed rating. Used for stolen bases and fielding.' },
    { key: 'Position', label: 'Pos', desc: 'Fielding position(s). +N is the fielding bonus.' },
    { key: 'hand', label: 'Hand', desc: 'Batting hand. L = Left, R = Right, S = Switch.' },
    { key: 'icons', label: 'Icons', desc: 'Special ability icons. V = Vision (reroll outs), S = Speed (upgrade 1B to 2B), HR = Power (upgrade 2B/3B to HR), SB = Stolen Base.' },
    { key: 'battingAverage', label: 'AVG', decimals: 3, desc: 'Batting Average = H / AB. Measures how often the hitter gets a hit per at-bat (excludes walks).' },
    { key: 'onBasePercentage', label: 'OBP', decimals: 3, desc: 'On-Base Percentage = (H + BB) / PA. Fraction of plate appearances reaching base.' },
    { key: 'sluggingPercentage', label: 'SLG', decimals: 3, desc: 'Slugging Percentage = Total Bases / AB. Measures power.' },
    { key: 'ops', label: 'OPS', decimals: 3, desc: 'On-base Plus Slugging = OBP + SLG. Combined measure of reaching base and hitting for power.' },
    { key: 'woba', label: 'wOBA', decimals: 3, desc: 'Weighted On-Base Average = (0.69×BB + 0.88×1B + 1.08×1B+ + 1.24×2B + 1.56×3B + 1.95×HR) / PA. Weights each outcome by its run value.' },
    { key: 'iso', label: 'ISO', decimals: 3, desc: 'Isolated Power = SLG - AVG. Raw extra-base power independent of batting average.' },
    { key: 'babip', label: 'BABIP', decimals: 3, desc: 'Batting Average on Balls In Play = (H - HR) / (AB - SO - HR).' },
    { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout Rate = SO / PA. Fraction of plate appearances ending in a strikeout.' },
    { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk Rate = BB / PA. Fraction of plate appearances ending in a walk.' },
    { key: 'hrPct', label: 'HR%', decimals: 3, desc: 'Home Run Rate = HR / AB. Fraction of at-bats resulting in a home run.' },
    { key: 'gbFbRatio', label: 'GB/FB', decimals: 2, desc: 'Ground Ball to Fly Ball Ratio = GB / FB.' },
    { key: 'opsPercentile', label: 'OPS%', decimals: 0, desc: 'OPS Percentile (0-100) within this position group.' },
    { key: 'wobaPercentile', label: 'wOBA%', decimals: 0, desc: 'wOBA Percentile (0-100) within this position group.' },
    { key: 'opsDeviation', label: 'OPS Dev', decimals: 3, colorCode: 'positive-good', desc: 'OPS Deviation from regression of OPS vs Points within position group. Positive (green) = overperforming for cost.' },
    { key: 'wobaDeviation', label: 'wOBA Dev', decimals: 3, colorCode: 'positive-good', desc: 'wOBA Deviation from regression of wOBA vs Points within position group. Positive (green) = overperforming for cost.' },
    { key: 'atBats', label: 'PA', decimals: 0, desc: 'Plate Appearances. Total times this hitter batted across all matchups.' },
    { key: 'hits', label: 'H', decimals: 0, desc: 'Hits. Total hits (1B + 1B+ + 2B + 3B + HR).' },
    { key: 'singles', label: '1B', decimals: 0, desc: 'Singles (1 base).' },
    { key: 'singleplus', label: '1B+', decimals: 0, desc: 'Singles Plus. Enhanced singles worth ~1.5 bases in weighted stats.' },
    { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles (2 bases).' },
    { key: 'triples', label: '3B', decimals: 0, desc: 'Triples (3 bases).' },
    { key: 'homeRuns', label: 'HR', decimals: 0, desc: 'Home Runs (4 bases).' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks (base on balls). Reaches base but does not count as an at-bat.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts. Out, does not put ball in play.' },
    { key: 'groundballs', label: 'GB', decimals: 0, desc: 'Ground Ball outs.' },
    { key: 'flyballs', label: 'FB', decimals: 0, desc: 'Fly Ball outs.' },
    { key: 'popups', label: 'PU', decimals: 0, desc: 'Popup outs.' },
    { key: 'Vused', label: 'V Used', decimals: 0, desc: 'V (Vision) icon uses. Times the V icon rerolled an out (max 2 per 5-AB game, hitter chart only).' },
    { key: 'Sused', label: 'S Used', decimals: 0, desc: 'S (Speed) icon uses. Times the S icon upgraded a 1B/1B+ to a double (once per 5-AB game).' },
    { key: 'HRused', label: 'HR Used', decimals: 0, desc: 'HR (Power) icon uses. Times the HR icon upgraded a 2B/3B to a home run (once per 5-AB game).' },
    { key: 'totalIconSlgImpact', label: 'Icon SLG+', decimals: 3, colorCode: 'positive-good', desc: 'Icon SLG Impact = (S icon TB gained + HR icon TB gained) / AB. Estimated SLG boost from S and HR icon upgrades.' },
    { key: 'totalIconWobaImpact', label: 'Icon wOBA+', decimals: 3, colorCode: 'positive-good', desc: 'Icon wOBA Impact. Estimated wOBA boost from all icons (V rerolls, S upgrades, HR upgrades) using linear weights.' },
];

const PITCHER_COLUMNS: Column[] = [
    { key: 'valueRating', label: 'Value', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of WHIP and mWHIP deviation from regression, scaled to 0-100 centered at 50.' },
    { key: 'name', label: 'Name', desc: 'Pitcher name, year, edition, card number, team. Hover for card details.' },
    { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost for team building.' },
    { key: 'Control', label: 'Ctrl', decimals: 0, desc: 'Control. Added to the pitcher\'s d20 roll. Higher Control = more likely to use pitcher\'s chart.' },
    { key: 'IP', label: 'IP', decimals: 0, desc: 'Innings Pitched capacity on the card.' },
    { key: 'hand', label: 'Hand', desc: 'Throwing hand.' },
    { key: 'Icons', label: 'Icons', desc: 'Special abilities. K = block HR, 20 = +3 control once per inning, RP = +3 control first inning.' },
    { key: 'whip', label: 'WHIP', decimals: 3, desc: 'Walks + Hits per Inning Pitched = (BB + H) / IP. Lower = better.' },
    { key: 'mWHIP', label: 'mWHIP', decimals: 3, desc: 'Modified WHIP. Weights baserunners by damage using linear weights. Lower = better.' },
    { key: 'oppAvg', label: 'Opp AVG', decimals: 3, desc: 'Opponent Batting Average = H allowed / AB against. Lower = better.' },
    { key: 'oppOps', label: 'Opp OPS', decimals: 3, desc: 'Opponent OPS = Opp OBP + Opp SLG. Lower = better.' },
    { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout Rate = SO / BF. Higher = better.' },
    { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk Rate = BB / BF. Lower = better.' },
    { key: 'kBbRatio', label: 'K/BB', decimals: 2, desc: 'Strikeout-to-Walk Ratio = SO / BB. Higher = better.' },
    { key: 'hr9', label: 'HR/9', decimals: 2, desc: 'Home Runs per 9 Innings = (HR / IP) × 9. Lower = better.' },
    { key: 'gbPct', label: 'GB%', decimals: 3, desc: 'Ground Ball Percentage = GB / (BF - BB).' },
    { key: 'whipPercentile', label: 'WHIP%', decimals: 0, desc: 'WHIP Percentile (0-100) within role group.' },
    { key: 'mWHIPPercentile', label: 'mWHIP%', decimals: 0, desc: 'mWHIP Percentile (0-100) within role group.' },
    { key: 'whipDeviation', label: 'WHIP Dev', decimals: 3, colorCode: 'negative-good', desc: 'WHIP Deviation from regression. Negative (green) = better than expected for cost.' },
    { key: 'mWHIPDeviation', label: 'mWHIP Dev', decimals: 3, colorCode: 'negative-good', desc: 'mWHIP Deviation from regression. Negative (green) = better than expected.' },
    { key: 'battersFaced', label: 'BF', decimals: 0, desc: 'Batters Faced across all matchups.' },
    { key: 'outs', label: 'Outs', decimals: 0, desc: 'Total outs recorded (SO + GB + FB + PU).' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks allowed.' },
    { key: 'singles', label: '1B', decimals: 0, desc: 'Singles allowed.' },
    { key: 'singlepluses', label: '1B+', decimals: 0, desc: 'Singles Plus allowed.' },
    { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles allowed.' },
    { key: 'triples', label: '3B', decimals: 0, desc: 'Triples allowed.' },
    { key: 'homeruns', label: 'HR', decimals: 0, desc: 'Home Runs allowed.' },
    { key: 'groundballs', label: 'GB', decimals: 0, desc: 'Ground Ball outs.' },
    { key: 'flyballs', label: 'FB', decimals: 0, desc: 'Fly Ball outs.' },
    { key: 'popups', label: 'PU', decimals: 0, desc: 'Popup outs.' },
    { key: 'kIconHRsBlocked', label: 'K HRs', decimals: 0, desc: 'K Icon uses. Times the K icon converted a HR into a strikeout (once per 9 innings).' },
    { key: 'kIconSlgImpact', label: 'K SLG-', decimals: 3, desc: 'K Icon SLG Reduction = TB saved / BF.' },
    { key: 'twentyIconAdvantageSwings', label: '20 Swings', decimals: 0, desc: '20 Icon: times the +3 control bonus flipped from hitter to pitcher chart.' },
    { key: 'rpIconAdvantageSwings', label: 'RP Swings', decimals: 0, desc: 'RP Icon: times the +3 relief bonus flipped from hitter to pitcher chart (first inning only).' },
];

function buildTabs(
    hitters: HitterFinal[], pitchers: PitcherFinal[], prefix: string
): { hitterTabs: string; hitterContent: string; pitcherTabs: string; pitcherContent: string } {
    const positions = ['C', '1B', '2B', '3B', 'SS', 'LF-RF', 'CF', 'DH', 'All Hitters'];
    const byPos: Record<string, HitterFinal[]> = Object.fromEntries(positions.map(p => [p, []]));
    for (const p of hitters) {
        if (!p.Position) { byPos['All Hitters'].push(p); continue; }
        const posList = p.Position.split(',').map(pp => pp.trim().split('+')[0]);
        for (const pos of posList) {
            if (positions.includes(pos)) byPos[pos].push(p);
            if (pos === 'IF') ['1B', '2B', '3B', 'SS'].forEach(pp => byPos[pp].push(p));
            if (pos === 'OF') ['LF-RF', 'CF'].forEach(pp => byPos[pp].push(p));
        }
        byPos['All Hitters'].push(p);
    }

    let hitterTabs = '', hitterContent = '';
    positions.forEach((pos, idx) => {
        const players = byPos[pos];
        calculateRegressions(players, 'points', [
            { value: 'ops', deviation: 'opsDeviation' },
            { value: 'woba', deviation: 'wobaDeviation' },
        ]);
        calculatePercentiles(players, ['ops', 'woba', 'battingAverage', 'onBasePercentage', 'sluggingPercentage']);
        calculateHitterValueScore(players);
        players.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
        const active = idx === 0 ? 'active' : '';
        hitterTabs += `<button class="tab ${active}" onclick="showTab('${prefix}-hitter-${pos}')">${pos}</button>`;
        hitterContent += `<div id="${prefix}-hitter-${pos}" class="tab-content ${active}">${renderTable(players, HITTER_COLUMNS, true)}</div>`;
    });

    const byRole: Record<string, PitcherFinal[]> = { 'Starters': [], 'Relievers+Closers': [] };
    for (const p of pitchers) {
        if (p.Position === 'Starter') byRole['Starters'].push(p);
        else if (p.Position === 'Reliever' || p.Position === 'Closer') byRole['Relievers+Closers'].push(p);
    }
    let pitcherTabs = '', pitcherContent = '';
    Object.entries(byRole).forEach(([role, ps], idx) => {
        calculateRegressions(ps, 'points', [
            { value: 'whip', deviation: 'whipDeviation' },
            { value: 'mWHIP', deviation: 'mWHIPDeviation' },
        ]);
        calculatePercentiles(ps, ['whip', 'mWHIP']);
        calculatePitcherValueScore(ps);
        ps.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
        const active = idx === 0 ? 'active' : '';
        pitcherTabs += `<button class="tab ${active}" onclick="showTab('${prefix}-pitcher-${role}')">${role}</button>`;
        pitcherContent += `<div id="${prefix}-pitcher-${role}" class="tab-content ${active}">${renderTable(ps, PITCHER_COLUMNS, false)}</div>`;
    });

    return { hitterTabs, hitterContent, pitcherTabs, pitcherContent };
}

export interface SimExportData {
    hittersOn: HitterFinal[]; pitchersOn: PitcherFinal[];
    hittersOff: HitterFinal[]; pitchersOff: PitcherFinal[];
}

export function buildHtmlReport(data: SimExportData, config: SimConfig): string {
    const on = buildTabs(data.hittersOn, data.pitchersOn, 'on');
    const off = buildTabs(data.hittersOff, data.pitchersOff, 'off');

    const style = `* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #eee; }
h1, h2 { color: #fff; } h1 { margin-bottom: 5px; }
.sim-info { color: #888; font-size: 13px; margin-bottom: 20px; }
.tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.tab { padding: 8px 16px; border: none; background: #16213e; color: #eee; cursor: pointer; border-radius: 5px 5px 0 0; font-size: 14px; }
.tab:hover { background: #1f4068; } .tab.active { background: #1f4068; font-weight: bold; }
.tab-content { display: none; } .tab-content.active { display: block; }
table { border-collapse: collapse; width: 100%; background: #16213e; margin-bottom: 30px; font-size: 11px; table-layout: auto; }
th, td { padding: 3px 5px; text-align: right; border: 1px solid #1f4068; white-space: nowrap; }
th { background: #1f4068; cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 11; font-size: 10px; }
th:hover { background: #e94560; } th[title] { cursor: help; }
tr:nth-child(even) { background: #1a1a2e; } tr:hover { background: #0f3460; }
.section { margin-bottom: 40px; } .table-container { overflow-x: auto; max-height: 700px; overflow-y: auto; }
td:first-child { font-weight: bold; }
/* Name cell: left align, max-width with ellipsis */
td.name-cell { text-align: left; max-width: 240px; overflow: hidden; text-overflow: ellipsis; font-weight: normal; }
th[data-col="1"] { text-align: left; }
.val-good { color: #4ade80; } .val-bad { color: #f87171; } .name-cell { cursor: help; }
.mode-toggle { display: flex; gap: 0; margin-bottom: 20px; }
.mode-btn { padding: 10px 24px; border: 2px solid #1f4068; background: #16213e; color: #eee; cursor: pointer; font-size: 15px; font-weight: 600; }
.mode-btn:first-child { border-radius: 6px 0 0 6px; } .mode-btn:last-child { border-radius: 0 6px 6px 0; }
.mode-btn.active { background: #e94560; border-color: #e94560; }
.mode-btn:hover:not(.active) { background: #1f4068; }
.mode-panel { display: none; } .mode-panel.active { display: block; }
.filter-row th { background: #0f1f3a; position: sticky; top: 29px; z-index: 10; padding: 3px 4px; cursor: default; }
.filter-row th:hover { background: #0f1f3a; }
.filter-input { width: 100%; background: #16213e; color: #eee; border: 1px solid #1f4068; border-radius: 3px; padding: 3px 5px; font-size: 11px; }
.filter-input:focus { outline: none; border-color: #e94560; }
.filter-range { display: flex; gap: 2px; } .filter-range .filter-input { width: 50%; }
.filter-cell { cursor: default !important; }
.match-count { color: #888; font-size: 12px; margin-top: 4px; }
.clear-filters { padding: 4px 12px; border: 1px solid #1f4068; background: #16213e; color: #888; cursor: pointer; border-radius: 3px; font-size: 12px; margin-left: 10px; }
.clear-filters:hover { background: #1f4068; color: #eee; border-color: #e94560; }
#tooltip { display: none; position: fixed; background: #0a1628; color: #eee; padding: 12px 16px; border-radius: 8px; border: 1px solid #e94560; box-shadow: 0 8px 24px rgba(0,0,0,0.6); z-index: 10000; font-size: 13px; line-height: 1.5; max-width: 650px; pointer-events: none; }
#tooltip .tt-section { margin-bottom: 4px; } #tooltip .tt-label { color: #e94560; font-weight: 600; }
#tooltip .tt-divider { border-top: 1px solid #1f4068; margin: 6px 0; }
#tooltip .tt-chart { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; }
#tooltip .tt-layout { display: flex; gap: 12px; align-items: flex-start; }
#tooltip .tt-img img { width: 150px; height: auto; border-radius: 4px; border: 1px solid #1f4068; }
#tooltip .tt-info { flex: 1; min-width: 200px; }`;

    const script = `function switchMode(mode) {
    document.querySelectorAll('.mode-panel').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mode-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('mode-' + mode).classList.add('active');
    event.target.classList.add('active');
}
function showTab(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const section = el.closest('.section');
    if (!section) return;
    section.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    section.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    event.target.classList.add('active');
}
function sortTable(th) {
    if (th.closest('.filter-row')) return;
    const table = th.closest('table');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const idx = Array.from(th.parentNode.children).indexOf(th);
    const asc = th.dataset.sort !== 'asc';
    rows.sort((a, b) => {
        const aNum = parseFloat(a.children[idx].textContent);
        const bNum = parseFloat(b.children[idx].textContent);
        if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
        return asc ? a.children[idx].textContent.localeCompare(b.children[idx].textContent)
                   : b.children[idx].textContent.localeCompare(a.children[idx].textContent);
    });
    th.dataset.sort = asc ? 'asc' : 'desc';
    rows.forEach(row => tbody.appendChild(row));
}
function applyFilters(input) {
    const table = input.closest('table');
    const filterRow = table.querySelector('.filter-row');
    const inputs = filterRow.querySelectorAll('.filter-input');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    let visible = 0;
    rows.forEach(row => {
        let show = true;
        inputs.forEach(fi => {
            const col = parseInt(fi.dataset.col);
            const type = fi.dataset.type;
            const val = fi.value.trim();
            if (!val) return;
            const cellText = row.children[col] ? row.children[col].textContent : '';
            if (type === 'text') {
                if (!cellText.toLowerCase().includes(val.toLowerCase())) show = false;
            } else if (type === 'min') {
                const cellNum = parseFloat(cellText);
                if (isNaN(cellNum) || cellNum < parseFloat(val)) show = false;
            } else if (type === 'max') {
                const cellNum = parseFloat(cellText);
                if (isNaN(cellNum) || cellNum > parseFloat(val)) show = false;
            }
        });
        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    const section = table.closest('.section');
    const countEl = section.querySelector('.match-count');
    if (countEl) {
        const total = rows.length;
        const hasFilters = Array.from(inputs).some(i => i.value.trim());
        countEl.textContent = hasFilters ? visible + ' of ' + total + ' shown' : '';
    }
}
function clearFilters(sectionId) {
    const section = document.getElementById(sectionId);
    section.querySelectorAll('.filter-input').forEach(input => { input.value = ''; });
    section.querySelectorAll('tbody tr').forEach(row => { row.style.display = ''; });
    const countEl = section.querySelector('.match-count');
    if (countEl) countEl.textContent = '';
}
const tooltip = document.getElementById('tooltip');
document.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.name-cell');
    if (cell && cell.dataset.tooltipHtml) {
        tooltip.innerHTML = cell.dataset.tooltipHtml;
        tooltip.style.display = 'block';
    }
});
document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'block') {
        tooltip.style.left = Math.min(e.clientX + 15, window.innerWidth - tooltip.offsetWidth - 20) + 'px';
        tooltip.style.top = Math.min(e.clientY + 15, window.innerHeight - tooltip.offsetHeight - 20) + 'px';
    }
});
document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.name-cell')) tooltip.style.display = 'none';
});`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MLB Showdown Simulation Results</title><style>${style}</style></head><body>
<h1>MLB Showdown Simulation Results</h1>
<div class="sim-info">${config.AT_BATS_PER_MATCHUP} at-bats per matchup${config.SEED ? ' | Seed: "' + escapeHtml(config.SEED) + '"' : ''}</div>
<div class="mode-toggle">
    <button class="mode-btn active" onclick="switchMode('on')">With Icons</button>
    <button class="mode-btn" onclick="switchMode('off')">Without Icons</button>
</div>
<div id="tooltip"></div>
<div id="mode-on" class="mode-panel active">
    <div class="section" id="on-hitter-section">
        <h2>Hitters (Icons ON) <button class="clear-filters" onclick="clearFilters('on-hitter-section')">Clear Filters</button></h2>
        <div class="tabs">${on.hitterTabs}</div>
        <div class="table-container">${on.hitterContent}</div>
        <div class="match-count"></div>
    </div>
    <div class="section" id="on-pitcher-section">
        <h2>Pitchers (Icons ON) <button class="clear-filters" onclick="clearFilters('on-pitcher-section')">Clear Filters</button></h2>
        <div class="tabs">${on.pitcherTabs}</div>
        <div class="table-container">${on.pitcherContent}</div>
        <div class="match-count"></div>
    </div>
</div>
<div id="mode-off" class="mode-panel">
    <div class="section" id="off-hitter-section">
        <h2>Hitters (No Icons) <button class="clear-filters" onclick="clearFilters('off-hitter-section')">Clear Filters</button></h2>
        <div class="tabs">${off.hitterTabs}</div>
        <div class="table-container">${off.hitterContent}</div>
        <div class="match-count"></div>
    </div>
    <div class="section" id="off-pitcher-section">
        <h2>Pitchers (No Icons) <button class="clear-filters" onclick="clearFilters('off-pitcher-section')">Clear Filters</button></h2>
        <div class="tabs">${off.pitcherTabs}</div>
        <div class="table-container">${off.pitcherContent}</div>
        <div class="match-count"></div>
    </div>
</div>
<script>${script}</script></body></html>`;
}

// Re-export for convenience
export { HITTER_COLUMNS, PITCHER_COLUMNS };
