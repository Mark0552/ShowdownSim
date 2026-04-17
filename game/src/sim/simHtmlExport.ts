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

function tooltipHtml(row: any, isHitter: boolean): string {
    const chart = row.chart;
    if (!chart) return '';
    const imgTag = row.imagePath
        ? `<div class='tt-img'><img src='${escapeHtml(row.imagePath)}' alt='card'></div>`
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
    { key: 'valueRating', label: 'Value', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of OPS and wOBA deviation, scaled to 0-100.' },
    { key: 'name', label: 'Name', desc: 'Player. Hover for card details.' },
    { key: 'points', label: 'Pts', decimals: 0 },
    { key: 'onBase', label: 'OB', decimals: 0 },
    { key: 'Speed', label: 'Spd', decimals: 0 },
    { key: 'Position', label: 'Pos' },
    { key: 'hand', label: 'Hand' },
    { key: 'icons', label: 'Icons' },
    { key: 'battingAverage', label: 'AVG', decimals: 3 },
    { key: 'onBasePercentage', label: 'OBP', decimals: 3 },
    { key: 'sluggingPercentage', label: 'SLG', decimals: 3 },
    { key: 'ops', label: 'OPS', decimals: 3 },
    { key: 'woba', label: 'wOBA', decimals: 3 },
    { key: 'iso', label: 'ISO', decimals: 3 },
    { key: 'babip', label: 'BABIP', decimals: 3 },
    { key: 'kPct', label: 'K%', decimals: 3 },
    { key: 'bbPct', label: 'BB%', decimals: 3 },
    { key: 'hrPct', label: 'HR%', decimals: 3 },
    { key: 'gbFbRatio', label: 'GB/FB', decimals: 2 },
    { key: 'opsPercentile', label: 'OPS%', decimals: 0 },
    { key: 'wobaPercentile', label: 'wOBA%', decimals: 0 },
    { key: 'opsDeviation', label: 'OPS Dev', decimals: 3, colorCode: 'positive-good' },
    { key: 'wobaDeviation', label: 'wOBA Dev', decimals: 3, colorCode: 'positive-good' },
    { key: 'atBats', label: 'PA', decimals: 0 },
    { key: 'hits', label: 'H', decimals: 0 },
    { key: 'singles', label: '1B', decimals: 0 },
    { key: 'singleplus', label: '1B+', decimals: 0 },
    { key: 'doubles', label: '2B', decimals: 0 },
    { key: 'triples', label: '3B', decimals: 0 },
    { key: 'homeRuns', label: 'HR', decimals: 0 },
    { key: 'walks', label: 'BB', decimals: 0 },
    { key: 'strikeouts', label: 'SO', decimals: 0 },
    { key: 'groundballs', label: 'GB', decimals: 0 },
    { key: 'flyballs', label: 'FB', decimals: 0 },
    { key: 'popups', label: 'PU', decimals: 0 },
    { key: 'Vused', label: 'V Used', decimals: 0 },
    { key: 'Sused', label: 'S Used', decimals: 0 },
    { key: 'HRused', label: 'HR Used', decimals: 0 },
    { key: 'totalIconSlgImpact', label: 'Icon SLG+', decimals: 3, colorCode: 'positive-good' },
    { key: 'totalIconWobaImpact', label: 'Icon wOBA+', decimals: 3, colorCode: 'positive-good' },
];

const PITCHER_COLUMNS: Column[] = [
    { key: 'valueRating', label: 'Value', decimals: 0 },
    { key: 'name', label: 'Name' },
    { key: 'points', label: 'Pts', decimals: 0 },
    { key: 'Control', label: 'Ctrl', decimals: 0 },
    { key: 'IP', label: 'IP', decimals: 0 },
    { key: 'hand', label: 'Hand' },
    { key: 'Icons', label: 'Icons' },
    { key: 'whip', label: 'WHIP', decimals: 3 },
    { key: 'mWHIP', label: 'mWHIP', decimals: 3 },
    { key: 'oppAvg', label: 'Opp AVG', decimals: 3 },
    { key: 'oppOps', label: 'Opp OPS', decimals: 3 },
    { key: 'kPct', label: 'K%', decimals: 3 },
    { key: 'bbPct', label: 'BB%', decimals: 3 },
    { key: 'kBbRatio', label: 'K/BB', decimals: 2 },
    { key: 'hr9', label: 'HR/9', decimals: 2 },
    { key: 'gbPct', label: 'GB%', decimals: 3 },
    { key: 'whipPercentile', label: 'WHIP%', decimals: 0 },
    { key: 'mWHIPPercentile', label: 'mWHIP%', decimals: 0 },
    { key: 'whipDeviation', label: 'WHIP Dev', decimals: 3, colorCode: 'negative-good' },
    { key: 'mWHIPDeviation', label: 'mWHIP Dev', decimals: 3, colorCode: 'negative-good' },
    { key: 'battersFaced', label: 'BF', decimals: 0 },
    { key: 'outs', label: 'Outs', decimals: 0 },
    { key: 'strikeouts', label: 'SO', decimals: 0 },
    { key: 'walks', label: 'BB', decimals: 0 },
    { key: 'singles', label: '1B', decimals: 0 },
    { key: 'singlepluses', label: '1B+', decimals: 0 },
    { key: 'doubles', label: '2B', decimals: 0 },
    { key: 'triples', label: '3B', decimals: 0 },
    { key: 'homeruns', label: 'HR', decimals: 0 },
    { key: 'groundballs', label: 'GB', decimals: 0 },
    { key: 'flyballs', label: 'FB', decimals: 0 },
    { key: 'popups', label: 'PU', decimals: 0 },
    { key: 'kIconHRsBlocked', label: 'K HRs', decimals: 0 },
    { key: 'kIconSlgImpact', label: 'K SLG-', decimals: 3 },
    { key: 'twentyIconAdvantageSwings', label: '20 Swings', decimals: 0 },
    { key: 'rpIconAdvantageSwings', label: 'RP Swings', decimals: 0 },
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
table { border-collapse: collapse; width: 100%; background: #16213e; margin-bottom: 30px; font-size: 13px; }
th, td { padding: 6px 10px; text-align: left; border: 1px solid #1f4068; white-space: nowrap; }
th { background: #1f4068; cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 11; font-size: 12px; }
th:hover { background: #e94560; } th[title] { cursor: help; }
tr:nth-child(even) { background: #1a1a2e; } tr:hover { background: #0f3460; }
.section { margin-bottom: 40px; } .table-container { overflow-x: auto; max-height: 700px; overflow-y: auto; }
td:first-child { font-weight: bold; }
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
