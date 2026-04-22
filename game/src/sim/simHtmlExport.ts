/**
 * Self-contained HTML report generator. Mirrors the in-app Simulation page:
 * same column set, same CSS, click-to-sort headers with asc/desc toggle,
 * and a card-image tooltip on name hover.
 */

import {
    calculateRegressions,
    calculatePercentiles,
    calculateHitterValueScore,
    calculatePitcherValueScore,
    type HitterFinal,
    type PitcherFinal,
} from './simStats';
import type { SimConfig, RawHitter, RawPitcher } from './simEngine';
import { fitHitterPricing, fitStarterPricing, fitBullpenPricing } from '../pricing/pricingRegression';

export interface Column {
    key: string;
    label: string;
    decimals?: number;
    colorCode?: 'positive-good' | 'negative-good';
    desc?: string;
}

// Columns here mirror HITTER_VIEW_COLS / PITCHER_VIEW_COLS in SimulationPage.tsx
// EXACTLY — same keys, labels, decimals, colorCode, descriptions, order.
const HITTER_COLUMNS: Column[] = [
    { key: 'valueRating', label: 'Val', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of OPS and wOBA deviation vs points, scaled 0-100. 50 = average for cost, higher = better value.' },
    { key: 'name', label: 'Name', desc: 'Player name, year, edition, card number, team.' },
    { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost for team building.' },
    { key: 'onBase', label: 'OB', decimals: 0, desc: 'On-Base number. Pitcher must roll d20 + Control > OB to use pitcher chart.' },
    { key: 'Speed', label: 'Spd', decimals: 0, desc: 'Speed rating.' },
    { key: 'Position', label: 'Pos', desc: 'Fielding position(s) with +N fielding bonus.' },
    { key: 'icons', label: 'Ico', desc: 'Icons on this card (V, S, HR, SB, etc.).' },
    { key: 'battingAverage', label: 'AVG', decimals: 3, desc: 'Batting Average = H / AB.' },
    { key: 'onBasePercentage', label: 'OBP', decimals: 3, desc: 'On-Base Pct = (H + BB) / PA.' },
    { key: 'sluggingPercentage', label: 'SLG', decimals: 3, desc: 'Slugging Pct = Total Bases / AB.' },
    { key: 'ops', label: 'OPS', decimals: 3, desc: 'OPS = OBP + SLG.' },
    { key: 'woba', label: 'wOBA', decimals: 3, desc: 'Weighted On-Base Avg — weights each outcome by run value: (0.69\u00B7BB + 0.88\u00B71B + 1.08\u00B71B+ + 1.24\u00B72B + 1.56\u00B73B + 1.95\u00B7HR) / PA.' },
    { key: 'iso', label: 'ISO', decimals: 3, desc: 'Isolated Power = SLG - AVG.' },
    { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout rate = SO / PA.' },
    { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk rate = BB / PA.' },
    { key: 'hrPct', label: 'HR%', decimals: 3, desc: 'HR rate = HR / AB.' },
    { key: 'opsDeviation', label: 'OPS\u00B1', decimals: 3, colorCode: 'positive-good', desc: 'OPS deviation from points regression within position. Positive (green) = overperforming for cost.' },
    { key: 'wobaDeviation', label: 'wOBA\u00B1', decimals: 3, colorCode: 'positive-good', desc: 'wOBA deviation from points regression. Positive (green) = overperforming for cost.' },
    { key: 'priceResidual', label: 'Pts\u00B1', decimals: 0, colorCode: 'negative-good', desc: 'Points residual from the pricing regression (actual - predicted). Negative (green) = card costs LESS than the stats-formula predicts = underpriced. Positive (red) = overpriced per the formula.' },
    { key: 'combinedScore', label: 'z+/\u2212', decimals: 2, colorCode: 'positive-good', desc: 'Combined z-score within position group: avg[z(OPS\u00B1), z(wOBA\u00B1)] \u2212 z(Pts\u00B1). Higher (green) = outperforms AND/OR underpriced; lower (red) = the opposite. Performance averages both OPS and wOBA deviations (same pair that feeds Val) so offense signal is balanced against price.' },
    { key: 'hits', label: 'H', decimals: 0, desc: 'Hits = 1B + 1B+ + 2B + 3B + HR.' },
    { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles.' },
    { key: 'triples', label: '3B', decimals: 0, desc: 'Triples.' },
    { key: 'homeRuns', label: 'HR', decimals: 0, desc: 'Home runs.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'Vused', label: 'V', decimals: 0, desc: 'V (Vision) icon uses \u2014 rerolls of outs on hitter chart (max 2 per 5-AB game).' },
    { key: 'Sused', label: 'S', decimals: 0, desc: 'S (Speed) icon uses \u2014 singles upgraded to doubles (once per 5-AB game).' },
    { key: 'HRused', label: 'HR*', decimals: 0, desc: 'HR (Power) icon uses \u2014 doubles/triples upgraded to HRs (once per 5-AB game).' },
    { key: 'totalIconWobaImpact', label: 'Ico+', decimals: 3, colorCode: 'positive-good', desc: 'Total icon wOBA impact \u2014 estimated wOBA boost from all icons combined.' },
    { key: 'rAdjustmentAbs', label: 'RVar', decimals: 0, desc: 'R icon variance magnitude \u2014 cumulative sum of |\u00B13| applied to swing rolls. Linear with PA count for hitters with R; expected \u2248 1.71 \u00D7 PA. 0 if hitter lacks R.' },
    { key: 'rAdjustmentNet', label: 'RNet', decimals: 0, colorCode: 'positive-good', desc: 'R icon net luck \u2014 signed sum of all \u00B13 adjustments. Positive (green) = R helped this hitter (rolls ran high); negative (red) = R hurt them. Should average ~0 across many sims.' },
    { key: 'ryUsed', label: 'RY', decimals: 0, desc: 'RY icon uses \u2014 +3 swing bonuses applied on hitter-chart PAs (once per 5 ABs, Enhanced mode only).' },
];

const PITCHER_COLUMNS: Column[] = [
    { key: 'valueRating', label: 'Val', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of WHIP and mWHIP deviation vs points.' },
    { key: 'name', label: 'Name', desc: 'Pitcher name, year, edition, card number, team.' },
    { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost.' },
    { key: 'Control', label: 'Ctrl', decimals: 0, desc: 'Control \u2014 added to pitcher d20 roll.' },
    { key: 'IP', label: 'IP', decimals: 0, desc: 'Innings Pitched capacity.' },
    { key: 'Icons', label: 'Ico', desc: 'Icons (K, 20, RP).' },
    { key: 'whip', label: 'WHIP', decimals: 3, desc: 'Walks + Hits per IP = (BB + H) / IP. Lower = better.' },
    { key: 'mWHIP', label: 'mWHIP', decimals: 3, desc: 'Modified WHIP weighting baserunners by run value. Lower = better.' },
    { key: 'oppAvg', label: 'OppAVG', decimals: 3, desc: 'Opponent batting avg against this pitcher. Lower = better.' },
    { key: 'oppOps', label: 'OppOPS', decimals: 3, desc: 'Opponent OPS against this pitcher. Lower = better.' },
    { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout rate = SO / BF. Higher = better.' },
    { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk rate = BB / BF. Lower = better.' },
    { key: 'kBbRatio', label: 'K/BB', decimals: 2, desc: 'Strikeout-to-walk ratio.' },
    { key: 'hr9', label: 'HR/9', decimals: 2, desc: 'Home runs per 9 IP.' },
    { key: 'whipDeviation', label: 'WHIP\u00B1', decimals: 3, colorCode: 'negative-good', desc: 'WHIP deviation from regression. Negative (green) = better than expected for cost.' },
    { key: 'mWHIPDeviation', label: 'mWHIP\u00B1', decimals: 3, colorCode: 'negative-good', desc: 'mWHIP deviation from regression. Negative (green) = better than expected.' },
    { key: 'priceResidual', label: 'Pts\u00B1', decimals: 0, colorCode: 'negative-good', desc: 'Points residual from pricing regression (actual - predicted). Negative (green) = underpriced per stats formula.' },
    { key: 'combinedScore', label: 'z+/\u2212', decimals: 2, colorCode: 'positive-good', desc: 'Combined z-score within role group: \u2212avg[z(WHIP\u00B1), z(mWHIP\u00B1)] \u2212 z(Pts\u00B1). Higher (green) = lower WHIP AND/OR underpriced; lower (red) = the opposite. Performance averages both WHIP metrics (same pair that feeds Val) so pitching signal is balanced against price.' },
    { key: 'battersFaced', label: 'BF', decimals: 0, desc: 'Batters Faced.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks.' },
    { key: 'homeruns', label: 'HR', decimals: 0, desc: 'Home runs allowed.' },
    { key: 'kIconHRsBlocked', label: 'K*', decimals: 0, desc: 'K icon uses \u2014 HRs converted to strikeouts (once per 9 innings).' },
    { key: 'twentyIconAdvantageSwings', label: '20*', decimals: 0, desc: '20 icon advantage swings \u2014 +3 control bonus flipped from hitter to pitcher chart.' },
    { key: 'rpIconAdvantageSwings', label: 'RP*', decimals: 0, desc: 'RP icon advantage swings \u2014 first-inning +3 control bonus flipped chart.' },
    { key: 'rAdjustmentAbs', label: 'RVar', decimals: 0, desc: 'R icon variance magnitude \u2014 cumulative sum of |\u00B13| applied to pitch rolls. Linear with BF for pitchers with R; expected \u2248 1.71 \u00D7 BF. 0 if pitcher lacks R.' },
    { key: 'rAdjustmentNet', label: 'RNet', decimals: 0, colorCode: 'positive-good', desc: 'R icon net luck \u2014 signed sum of all \u00B13 adjustments. Positive (green) = R helped this pitcher (rolls ran high \u2192 more pitcher-chart matchups); negative (red) = R hurt them. Should average ~0 across many sims.' },
    { key: 'ryUsed', label: 'RY', decimals: 0, desc: 'RY icon uses \u2014 +3 pitch bonuses applied (once per 27 outs, Enhanced mode only).' },
];

const HITTER_POSITIONS = ['All Hitters', 'C', '1B', '2B', '3B', 'SS', 'LF-RF', 'CF', 'DH'];
const PITCHER_ROLES = ['Starters', 'Relievers+Closers'];

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

/** Build a `name → card details` dictionary that's serialized into the page
 *  so the hover handler can render the full CardTooltip HTML without each
 *  name cell carrying the whole tooltip inline (a card appears in ~3-9 tables,
 *  so per-cell embedding would bloat the file by several MB). */
function buildCardDict(rawData: { hitters: RawHitter[]; pitchers: RawPitcher[] }): Record<string, any> {
    const out: Record<string, any> = {};
    for (const h of rawData.hitters) {
        const key = `${h.Name} ${h['Yr.']} ${h.Ed} ${h['#']} ${h.Team}`;
        out[key] = {
            type: 'hitter',
            name: h.Name, team: h.Team, cardNum: h['#'],
            edition: h.Ed, year: h['Yr.'], expansion: h.expansion || '',
            points: h.Points, hand: h.H || '',
            onBase: h.onBase, speed: h.Speed,
            position: h.Position,
            icons: h.Icons ? String(h.Icons).split(/\s+/).filter(Boolean) : [],
            imagePath: absoluteImageUrl(h.imagePath),
            chart: {
                SO: h.SO, GB: h.GB, FB: h.FB, W: h.W,
                S: h.S, SPlus: h.SPlus, DB: h.DB, TR: h.TR, HR: h.HR,
            },
        };
    }
    for (const p of rawData.pitchers) {
        const key = `${p.Name} ${p['Yr.']} ${p.Ed} ${p['#']} ${p.Team}`;
        out[key] = {
            type: 'pitcher',
            name: p.Name, team: p.Team, cardNum: p['#'],
            edition: p.Ed, year: p['Yr.'], expansion: p.expansion || '',
            points: p.Points, hand: p.H || '',
            control: p.Control, ip: p.IP, role: p.Position,
            icons: p.Icons ? String(p.Icons).split(/\s+/).filter(Boolean) : [],
            imagePath: absoluteImageUrl(p.imagePath),
            chart: {
                PU: p.PU, SO: p.SO, GB: p.GB, FB: p.FB,
                W: p.W, S: p.S, DB: p.DB, HR: p.HR,
            },
        };
    }
    return out;
}

function groupHittersByPosition(hitters: HitterFinal[]): Record<string, HitterFinal[]> {
    const out: Record<string, HitterFinal[]> = Object.fromEntries(HITTER_POSITIONS.map(p => [p, [] as HitterFinal[]]));
    for (const p of hitters) {
        out['All Hitters'].push(p);
        if (!p.Position) continue;
        const posList = p.Position.split(',').map(pp => pp.trim().split('+')[0]);
        const targets = new Set<string>();
        for (const pos of posList) {
            if (HITTER_POSITIONS.includes(pos)) targets.add(pos);
            if (pos === 'IF') ['1B', '2B', '3B', 'SS'].forEach(pp => targets.add(pp));
            if (pos === 'OF') ['LF-RF', 'CF'].forEach(pp => targets.add(pp));
        }
        targets.forEach(t => out[t].push(p));
    }
    for (const pos of HITTER_POSITIONS) {
        const players = out[pos];
        if (players.length < 2) continue;
        calculateRegressions(players, 'points', [
            { value: 'ops', deviation: 'opsDeviation' },
            { value: 'woba', deviation: 'wobaDeviation' },
        ]);
        calculatePercentiles(players, ['ops', 'woba', 'battingAverage', 'onBasePercentage', 'sluggingPercentage']);
        calculateHitterValueScore(players);
        players.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
    }
    return out;
}

function groupPitchersByRole(pitchers: PitcherFinal[]): Record<string, PitcherFinal[]> {
    const out: Record<string, PitcherFinal[]> = { 'Starters': [], 'Relievers+Closers': [] };
    for (const p of pitchers) {
        if (p.Position === 'Starter') out['Starters'].push(p);
        else if (p.Position === 'Reliever' || p.Position === 'Closer') out['Relievers+Closers'].push(p);
    }
    for (const role of PITCHER_ROLES) {
        const ps = out[role];
        if (ps.length < 2) continue;
        calculateRegressions(ps, 'points', [
            { value: 'whip', deviation: 'whipDeviation' },
            { value: 'mWHIP', deviation: 'mWHIPDeviation' },
        ]);
        calculatePercentiles(ps, ['whip', 'mWHIP']);
        calculatePitcherValueScore(ps);
        ps.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
    }
    return out;
}

function cellClass(col: Column, val: unknown): string {
    if (!col.colorCode || typeof val !== 'number') return '';
    if (col.colorCode === 'positive-good') {
        if (val > 0.02) return 'sim-val-good';
        if (val < -0.02) return 'sim-val-bad';
    } else if (col.colorCode === 'negative-good') {
        if (val < -0.02) return 'sim-val-good';
        if (val > 0.02) return 'sim-val-bad';
    }
    return '';
}

function renderTable(rows: any[], columns: Column[]): string {
    const headers = columns.map((c, i) => {
        const title = c.desc ? ` title="${escapeHtml(c.desc)}"` : '';
        return `<th class="sim-th-sortable" data-col="${i}" data-type="${c.decimals !== undefined ? 'num' : 'str'}" data-key="${escapeHtml(c.key)}"${title}>${escapeHtml(c.label)}<span class="sim-sort-arrow"></span></th>`;
    }).join('');
    const body = rows.map(row => {
        const tds = columns.map(c => {
            const raw = (row as any)[c.key];
            let text: string;
            if (raw === null || raw === undefined) text = '';
            else if (typeof raw === 'number') text = c.decimals !== undefined ? raw.toFixed(c.decimals) : String(raw);
            else text = String(raw);
            const cls = cellClass(c, raw);
            if (c.key === 'name') {
                // Key into the global __CARDS__ dictionary so the hover handler
                // can render the same full CardTooltip as the in-app sim.
                return `<td class="sim-name-cell ${cls}" data-card-key="${escapeHtml(row.name)}">${escapeHtml(text)}</td>`;
            }
            // Preserve numeric sort key on the <td> via data-sort so sort doesn't
            // depend on parsing the formatted text.
            const sortAttr = typeof raw === 'number' && !Number.isNaN(raw)
                ? ` data-sort="${raw}"`
                : '';
            return `<td class="${cls}"${sortAttr}>${escapeHtml(text)}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('');
    return `<table class="sim-table"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}

interface ModeContent { hitters: string; pitchers: string }

type PriceMap = Map<string, number>;

function stdev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    let s = 0;
    for (const v of values) s += (v - m) ** 2;
    return Math.sqrt(s / values.length);
}
function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Mirror of SimulationPage.assignCombinedScore:
 *  combined = avg(perf z-scores) - z(price resid), flipping perf sign for pitchers. */
function assignCombinedScore<T extends { priceResidual?: number; combinedScore?: number }>(
    rows: T[],
    perfGetters: Array<(r: T) => number | undefined>,
    perfHigherBetter: boolean,
): void {
    if (rows.length < 2 || perfGetters.length === 0) {
        rows.forEach(r => { r.combinedScore = 0; });
        return;
    }
    const perfStats = perfGetters.map(get => {
        const vals = rows.map(r => get(r) ?? 0);
        return { mean: mean(vals), std: stdev(vals) || 1 };
    });
    const priceVals = rows.map(r => r.priceResidual ?? 0);
    const mPrice = mean(priceVals), sPrice = stdev(priceVals) || 1;
    for (const r of rows) {
        let perfZSum = 0;
        for (let i = 0; i < perfGetters.length; i++) {
            const v = perfGetters[i](r) ?? 0;
            perfZSum += (v - perfStats[i].mean) / perfStats[i].std;
        }
        const perfZ = perfZSum / perfGetters.length;
        const priceZ = ((r.priceResidual ?? 0) - mPrice) / sPrice;
        const signedPerf = perfHigherBetter ? perfZ : -perfZ;
        r.combinedScore = signedPerf - priceZ;
    }
}

function buildModeContent(
    hitters: HitterFinal[], pitchers: PitcherFinal[], modeId: string,
    hitterPriceMap: PriceMap | null, pitcherPriceMap: PriceMap | null,
): ModeContent {
    const byPos = groupHittersByPosition(hitters);
    const byRole = groupPitchersByRole(pitchers);

    // Inject pricing residuals + compute per-group combined z-scores. Matches
    // SimulationPage's hittersGrouped / pitchersGrouped useMemos exactly.
    if (hitterPriceMap) {
        for (const pos of HITTER_POSITIONS) {
            for (const row of byPos[pos]) {
                const resid = hitterPriceMap.get(row.name);
                if (resid !== undefined) row.priceResidual = resid;
            }
            assignCombinedScore(byPos[pos], [r => r.opsDeviation, r => r.wobaDeviation], true);
        }
    }
    if (pitcherPriceMap) {
        for (const role of PITCHER_ROLES) {
            for (const row of byRole[role]) {
                const resid = pitcherPriceMap.get(row.name);
                if (resid !== undefined) row.priceResidual = resid;
            }
            // WHIP and mWHIP are lower-better, so flip the perf z-score.
            assignCombinedScore(byRole[role], [r => r.whipDeviation, r => r.mWHIPDeviation], false);
        }
    }

    const hitterSubtabs = HITTER_POSITIONS.map((pos, idx) => {
        const active = idx === 0 ? ' active' : '';
        return `<button class="sim-subtab${active}" data-pos="${escapeHtml(pos)}">${escapeHtml(pos)} (${byPos[pos].length})</button>`;
    }).join('');
    const hitterTables = HITTER_POSITIONS.map((pos, idx) => {
        const active = idx === 0 ? ' active' : '';
        return `<div class="sim-table-wrap sim-pos-wrap${active}" data-pos="${escapeHtml(pos)}">${renderTable(byPos[pos], HITTER_COLUMNS)}</div>`;
    }).join('');
    const hitters_html =
        `<div class="sim-subtabs" data-group="${modeId}-hit">${hitterSubtabs}</div>${hitterTables}`;

    const pitcherSubtabs = PITCHER_ROLES.map((role, idx) => {
        const active = idx === 0 ? ' active' : '';
        return `<button class="sim-subtab${active}" data-pos="${escapeHtml(role)}">${escapeHtml(role)} (${byRole[role].length})</button>`;
    }).join('');
    const pitcherTables = PITCHER_ROLES.map((role, idx) => {
        const active = idx === 0 ? ' active' : '';
        return `<div class="sim-table-wrap sim-pos-wrap${active}" data-pos="${escapeHtml(role)}">${renderTable(byRole[role], PITCHER_COLUMNS)}</div>`;
    }).join('');
    const pitchers_html =
        `<div class="sim-subtabs" data-group="${modeId}-pit">${pitcherSubtabs}</div>${pitcherTables}`;

    return { hitters: hitters_html, pitchers: pitchers_html };
}

export interface SimExportData {
    hittersOn: HitterFinal[]; pitchersOn: PitcherFinal[];
    hittersOff: HitterFinal[]; pitchersOff: PitcherFinal[];
    hittersEnhanced: HitterFinal[]; pitchersEnhanced: PitcherFinal[];
}

export function buildHtmlReport(
    data: SimExportData,
    config: SimConfig,
    rawData?: { hitters: RawHitter[]; pitchers: RawPitcher[] },
): string {
    // Fit pricing regressions once per catalog and build name→residual maps.
    // Starters and bullpen fit separately (same split as the in-app Pricing page).
    let hitterPriceMap: PriceMap | null = null;
    let pitcherPriceMap: PriceMap | null = null;
    if (rawData) {
        const hFit = fitHitterPricing(rawData.hitters);
        hitterPriceMap = new Map<string, number>();
        for (const r of hFit.rows) hitterPriceMap.set(r.name, r.residual);

        const sFit = fitStarterPricing(rawData.pitchers);
        const bFit = fitBullpenPricing(rawData.pitchers);
        pitcherPriceMap = new Map<string, number>();
        for (const r of sFit.rows) pitcherPriceMap.set(r.name, r.residual);
        for (const r of bFit.rows) pitcherPriceMap.set(r.name, r.residual);
    }

    const on = buildModeContent(data.hittersOn, data.pitchersOn, 'on', hitterPriceMap, pitcherPriceMap);
    const off = buildModeContent(data.hittersOff, data.pitchersOff, 'off', hitterPriceMap, pitcherPriceMap);
    const enh = buildModeContent(data.hittersEnhanced, data.pitchersEnhanced, 'enh', hitterPriceMap, pitcherPriceMap);

    // CSS mirrors game/src/pages/SimulationPage.css with variable values inlined
    const style = `
:root {
    --bg-primary: #0f1923;
    --bg-secondary: #1a2736;
    --bg-card: #1e3046;
    --border: #2a4a6b;
    --accent: #e94560;
    --accent-dim: #a83248;
    --text: #e8e8e8;
    --text-dim: #8899aa;
    --text-muted: #556677;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text);
}
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent-dim); }
.sim-page { min-height: 100vh; padding: 24px; }
.sim-container { max-width: 100%; margin: 0 auto; }
.sim-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.sim-header h1 { font-size: 24px; color: var(--accent); margin: 0; }
.sim-meta { color: var(--text-dim); font-size: 13px; }
.sim-tabs { display: flex; gap: 4px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.sim-tab {
    background: none; border: none; color: var(--text-muted);
    font-size: 13px; font-weight: 600; padding: 8px 18px;
    border-bottom: 2px solid transparent; cursor: pointer;
}
.sim-tab:hover { color: var(--text); }
.sim-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.sim-subtabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 10px 0; }
.sim-subtab {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 12px; font-weight: 500; padding: 5px 12px;
    border-radius: 4px; cursor: pointer;
}
.sim-subtab:hover { border-color: var(--accent-dim); color: var(--text); }
.sim-subtab.active { border-color: var(--accent); color: var(--accent); background: rgba(212, 160, 24, 0.1); }
.sim-panel { display: none; }
.sim-panel.active { display: block; }
.sim-kind { display: none; }
.sim-kind.active { display: block; }
.sim-pos-wrap { display: none; }
.sim-pos-wrap.active { display: block; }
.sim-table-wrap {
    max-height: 70vh; overflow: auto;
    border: 1px solid var(--border); border-radius: 6px;
}
.sim-table {
    width: 100%; border-collapse: collapse;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px; table-layout: auto;
}
.sim-table th {
    background: var(--bg-secondary); color: var(--accent);
    padding: 4px 4px; border-bottom: 2px solid var(--accent);
    text-align: right; position: sticky; top: 0; z-index: 1;
    white-space: nowrap; font-size: 10px; font-weight: 600;
    cursor: pointer; user-select: none;
}
.sim-table th:hover { background: rgba(212, 160, 24, 0.15); }
.sim-th-active { color: #fff !important; background: rgba(212, 160, 24, 0.25); }
.sim-sort-arrow { display: inline-block; width: 12px; text-align: right; }
.sim-name-cell { cursor: pointer; }
.sim-table td {
    padding: 3px 4px; border-bottom: 1px solid var(--border);
    text-align: right; white-space: nowrap;
}
.sim-table tr:nth-child(even) td { background: rgba(255, 255, 255, 0.02); }
.sim-table tr:hover td { background: rgba(212, 160, 24, 0.08); }
/* Name column wider + left-aligned, can truncate */
.sim-table th:nth-child(2), .sim-table td:nth-child(2) {
    text-align: left; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.sim-table td:nth-child(2) { color: var(--text); font-weight: 600; }
/* Position/Icons columns — left align, compact */
.sim-table th:nth-child(6), .sim-table td:nth-child(6),
.sim-table th:nth-child(7), .sim-table td:nth-child(7) {
    text-align: left;
}
.sim-val-good { color: #4ade80; }
.sim-val-bad { color: #f87171; }

/* Card tooltip — mirrors game/src/components/cards/CardTooltip.css exactly
   so name-hover popups in the export look identical to the in-app view. */
.card-tooltip {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 9999; background: var(--bg-secondary);
    border: 1px solid var(--accent); border-radius: 10px;
    padding: 20px; box-shadow: 0 12px 48px rgba(0,0,0,0.7);
    pointer-events: none;
}
.ct-layout { display: flex; gap: 14px; }
.ct-image {
    width: 251px; height: 350px; object-fit: cover;
    border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0;
}
.ct-info { flex: 1; min-width: 200px; }
.ct-info h3 { font-size: 20px; margin: 0 0 6px 0; color: var(--text); }
.ct-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ct-meta span {
    font-size: 13px; color: var(--text-dim);
    padding: 1px 5px; background: var(--bg-card); border-radius: 3px;
}
.ct-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 10px; }
.ct-stat {
    display: flex; justify-content: space-between;
    padding: 4px 8px; background: var(--bg-card); border-radius: 3px; font-size: 14px;
}
.ct-stat span:first-child { color: var(--text-dim); }
.ct-stat span:last-child { font-weight: 600; color: var(--accent); }
.ct-chart table {
    width: 100%; border-collapse: collapse;
    font-family: 'Consolas', 'Courier New', monospace; font-size: 14px;
}
.ct-chart th, .ct-chart td {
    padding: 5px 7px; text-align: center; border: 1px solid var(--border);
}
.ct-chart th { background: var(--bg-card); color: var(--accent); font-size: 12px; }
.ct-chart td { background: var(--bg-primary); }
`;

    // JS handles: mode/kind/subtab switching, sort (with ▲/▼ indicators), card image hover
    const script = `
(function() {
    // --- Tab switching: mode (panel), kind (hitters/pitchers within panel),
    //     subtab (position/role within kind) ---
    document.querySelectorAll('.sim-mode-tabs .sim-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            document.querySelectorAll('.sim-mode-tabs .sim-tab').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.sim-panel').forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
        });
    });
    document.querySelectorAll('.sim-kind-tabs .sim-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.kind;
            const panel = btn.closest('.sim-panel');
            panel.querySelectorAll('.sim-kind-tabs .sim-tab').forEach(b => b.classList.toggle('active', b === btn));
            panel.querySelectorAll('.sim-kind').forEach(k => k.classList.toggle('active', k.dataset.kind === kind));
        });
    });
    document.querySelectorAll('.sim-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            const pos = btn.dataset.pos;
            const kind = btn.closest('.sim-kind');
            kind.querySelectorAll('.sim-subtab').forEach(b => b.classList.toggle('active', b === btn));
            kind.querySelectorAll('.sim-pos-wrap').forEach(w => w.classList.toggle('active', w.dataset.pos === pos));
        });
    });

    // --- Sort: per-table state on <thead>. Numeric cols default desc,
    //     string cols default asc; re-click toggles direction. ---
    document.querySelectorAll('.sim-table thead').forEach(thead => {
        thead.addEventListener('click', (e) => {
            const th = e.target.closest('th');
            if (!th) return;
            const table = thead.parentElement;
            const tbody = table.tBodies[0];
            const idx = Array.prototype.indexOf.call(th.parentNode.children, th);
            const type = th.dataset.type;
            const key = th.dataset.key;
            let dir;
            if (thead.dataset.sortKey === key) {
                dir = thead.dataset.sortDir === 'desc' ? 'asc' : 'desc';
            } else {
                // default: desc for numbers + "valueRating" (Val), asc for strings
                dir = (type === 'num' || key === 'valueRating') ? 'desc' : 'asc';
            }
            thead.dataset.sortKey = key;
            thead.dataset.sortDir = dir;
            thead.querySelectorAll('th').forEach(h => {
                h.classList.remove('sim-th-active');
                const arrow = h.querySelector('.sim-sort-arrow');
                if (arrow) arrow.textContent = '';
            });
            th.classList.add('sim-th-active');
            const arrow = th.querySelector('.sim-sort-arrow');
            if (arrow) arrow.textContent = dir === 'desc' ? ' \u25BC' : ' \u25B2';
            const mult = dir === 'desc' ? -1 : 1;
            const rows = Array.from(tbody.rows);
            const getNum = (cell) => {
                const s = cell.getAttribute('data-sort');
                if (s !== null) {
                    const n = parseFloat(s);
                    return Number.isNaN(n) ? null : n;
                }
                const n = parseFloat(cell.textContent);
                return Number.isNaN(n) ? null : n;
            };
            rows.sort((a, b) => {
                const ac = a.cells[idx];
                const bc = b.cells[idx];
                if (type === 'num') {
                    const av = getNum(ac);
                    const bv = getNum(bc);
                    if (av === null && bv === null) return 0;
                    if (av === null) return 1;
                    if (bv === null) return -1;
                    return (av - bv) * mult;
                }
                const at = ac.textContent.trim();
                const bt = bc.textContent.trim();
                if (!at && !bt) return 0;
                if (!at) return 1;
                if (!bt) return -1;
                return at.localeCompare(bt) * mult;
            });
            const frag = document.createDocumentFragment();
            rows.forEach(r => frag.appendChild(r));
            tbody.appendChild(frag);
        });
    });

    // --- Card tooltip on Name hover. Renders the same layout as the in-app
    //     CardTooltip (centered fixed overlay with image + meta + stats + chart)
    //     from the global __CARDS__ dictionary. ---
    const hoverTip = document.getElementById('sim-card-tooltip');
    const CARDS = window.__CARDS__ || {};

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function renderTooltipHtml(card) {
        const isHitter = card.type === 'hitter';
        const imgHtml = card.imagePath ? '<img src="' + esc(card.imagePath) + '" alt="" class="ct-image">' : '';
        const metaItems = [card.team, '#' + card.cardNum, card.edition, card.year, card.expansion]
            .filter(v => v && v !== '#' && v !== '#0');
        const metaHtml = metaItems.map(v => '<span>' + esc(v) + '</span>').join('');
        let statsHtml = '<div class="ct-stat"><span>Points</span><span>' + esc(card.points) + '</span></div>';
        if (isHitter) {
            statsHtml += '<div class="ct-stat"><span>On-Base</span><span>' + esc(card.onBase) + '</span></div>';
            statsHtml += '<div class="ct-stat"><span>Speed</span><span>' + esc(card.speed) + '</span></div>';
            statsHtml += '<div class="ct-stat"><span>Position</span><span>' + esc(card.position || 'DH') + '</span></div>';
        } else {
            statsHtml += '<div class="ct-stat"><span>Control</span><span>' + esc(card.control) + '</span></div>';
            statsHtml += '<div class="ct-stat"><span>IP</span><span>' + esc(card.ip) + '</span></div>';
            statsHtml += '<div class="ct-stat"><span>Role</span><span>' + esc(card.role) + '</span></div>';
        }
        statsHtml += '<div class="ct-stat"><span>Hand</span><span>' + esc(card.hand || '') + '</span></div>';
        const iconsStr = (card.icons && card.icons.length > 0) ? card.icons.join(' ') : 'None';
        statsHtml += '<div class="ct-stat"><span>Icons</span><span>' + esc(iconsStr) + '</span></div>';

        const chartLabels = isHitter
            ? ['SO','GB','FB','W','S','S+','DB','TR','HR']
            : ['PU','SO','GB','FB','W','S','DB','HR'];
        const chartKeys = isHitter
            ? ['SO','GB','FB','W','S','SPlus','DB','TR','HR']
            : ['PU','SO','GB','FB','W','S','DB','HR'];
        const chartHeaders = chartLabels.map(l => '<th>' + esc(l) + '</th>').join('');
        const chartCells = chartKeys.map(k => '<td>' + esc(card.chart[k] || '-') + '</td>').join('');
        const chartHtml = '<div class="ct-chart"><table><thead><tr>' + chartHeaders
            + '</tr></thead><tbody><tr>' + chartCells + '</tr></tbody></table></div>';

        return '<div class="ct-layout">' + imgHtml + '<div class="ct-info">'
            + '<h3>' + esc(card.name) + '</h3>'
            + '<div class="ct-meta">' + metaHtml + '</div>'
            + '<div class="ct-stats">' + statsHtml + '</div>'
            + chartHtml
            + '</div></div>';
    }

    document.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('.sim-name-cell');
        if (!cell) return;
        const key = cell.getAttribute('data-card-key');
        if (!key) return;
        const card = CARDS[key];
        if (!card) return;
        hoverTip.innerHTML = renderTooltipHtml(card);
        hoverTip.style.display = 'block';
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.sim-name-cell')) {
            hoverTip.style.display = 'none';
        }
    });
})();
`;

    const modePanel = (id: string, label: string, content: ModeContent, active: boolean) => `
<div class="sim-panel${active ? ' active' : ''}" data-mode="${id}" aria-label="${escapeHtml(label)}">
    <div class="sim-tabs sim-kind-tabs">
        <button class="sim-tab active" data-kind="hitters">Hitters</button>
        <button class="sim-tab" data-kind="pitchers">Pitchers</button>
    </div>
    <div class="sim-kind active" data-kind="hitters">${content.hitters}</div>
    <div class="sim-kind" data-kind="pitchers">${content.pitchers}</div>
</div>`;

    // Card-data dictionary for the hover popup. Serialize only when rawData
    // was provided, and scrub `</script>` to avoid breaking out of the tag.
    const cardDictJson = rawData
        ? JSON.stringify(buildCardDict(rawData)).replace(/<\/script>/gi, '<\\/script>')
        : '{}';

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MLB Showdown Simulation Results</title>
<style>${style}</style>
</head><body>
<div id="sim-card-tooltip" class="card-tooltip" style="display:none;"></div>
<script>window.__CARDS__ = ${cardDictJson};</script>
<div class="sim-page"><div class="sim-container">
    <div class="sim-header">
        <h1>Simulation</h1>
        <div class="sim-meta">${config.AT_BATS_PER_MATCHUP} at-bats per matchup${config.SEED ? ' \u2022 Seed: "' + escapeHtml(config.SEED) + '"' : ''}</div>
    </div>

    <div class="sim-tabs sim-mode-tabs">
        <button class="sim-tab active" data-mode="on">Icons ON</button>
        <button class="sim-tab" data-mode="off">Icons OFF</button>
        <button class="sim-tab" data-mode="enh">Enhanced (R/RY)</button>
    </div>

    ${modePanel('on', 'Icons ON', on, true)}
    ${modePanel('off', 'Icons OFF', off, false)}
    ${modePanel('enh', 'Enhanced', enh, false)}
</div></div>
<script>${script}</script>
</body></html>`;
}
