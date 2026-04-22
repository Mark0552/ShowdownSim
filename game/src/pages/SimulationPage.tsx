import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { SimConfig, RawHitter, RawPitcher } from '../sim/simEngine';
import { DEFAULT_CONFIG } from '../sim/simEngine';
import type { HitterFinal, PitcherFinal } from '../sim/simStats';
import {
    calculateRegressions, calculatePercentiles,
    calculateHitterValueScore, calculatePitcherValueScore,
} from '../sim/simStats';
import type { SimExportData } from '../sim/simHtmlExport';
import { buildHtmlReport } from '../sim/simHtmlExport';
import type { Card } from '../types/cards';
import CardTooltip from '../components/cards/CardTooltip';
import { hitterFinalToCard, pitcherFinalToCard } from '../components/cards/cardAdapters';
import { fitHitterPricing, fitStarterPricing, fitBullpenPricing } from '../pricing/pricingRegression';
import './SimulationPage.css';

function stdev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    let s = 0;
    for (const v of values) s += (v - mean) ** 2;
    return Math.sqrt(s / values.length);
}
function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Compute combined z-score = avg(perf z-scores) - z(price residual) per row
 *  within the passed group. Pass one or more performance getters; they are
 *  z-scored separately, then averaged so the performance axis stays balanced
 *  with the price axis regardless of how many perf signals you combine.
 *  perfHigherBetter=true for hitters (OPS/wOBA up=good);
 *  perfHigherBetter=false for pitchers (WHIP/mWHIP down=good). */
function assignCombinedScore<T extends { priceResidual?: number; combinedScore?: number }>(
    rows: T[],
    perfGetters: Array<(r: T) => number | undefined>,
    perfHigherBetter: boolean,
): void {
    if (rows.length < 2 || perfGetters.length === 0) {
        rows.forEach(r => { r.combinedScore = 0; });
        return;
    }
    // Pre-compute mean and std per perf getter so we can z-score each card's
    // value against its group on that specific metric.
    const perfStats = perfGetters.map(get => {
        const vals = rows.map(r => get(r) ?? 0);
        return { mean: mean(vals), std: stdev(vals) || 1 };
    });
    const priceVals = rows.map(r => r.priceResidual ?? 0);
    const mPrice = mean(priceVals), sPrice = stdev(priceVals) || 1;
    for (const r of rows) {
        // Average the per-metric z-scores so adding more signals doesn't
        // inflate the perf side vs the single price z-score.
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

const BASE = import.meta.env.BASE_URL || '/';

interface Props { onBack: () => void; }

type Phase = 'idle' | 'loading' | 'running' | 'done' | 'error';

interface ProgressMsg { type: 'progress'; phase: 'icons-on' | 'icons-off' | 'enhanced'; done: number; total: number; elapsedMs: number }
interface DoneMsg { type: 'done'; data: SimExportData; elapsedMs: number }
interface ErrorMsg { type: 'error'; message: string }
type WorkerOut = ProgressMsg | DoneMsg | ErrorMsg;

const HITTER_POSITIONS = ['All Hitters', 'C', '1B', '2B', '3B', 'SS', 'LF-RF', 'CF', 'DH'];
const PITCHER_ROLES = ['Starters', 'Relievers+Closers'];

// Columns to show in the in-app viewer (compact subset; export has the full set)
interface ViewCol<T> {
    key: keyof T;
    label: string;
    decimals?: number;
    desc?: string;
    colorCode?: 'positive-good' | 'negative-good';
}
const HITTER_VIEW_COLS: ViewCol<HitterFinal>[] = [
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
    { key: 'woba', label: 'wOBA', decimals: 3, desc: 'Weighted On-Base Avg — weights each outcome by run value: (0.69·BB + 0.88·1B + 1.08·1B+ + 1.24·2B + 1.56·3B + 1.95·HR) / PA.' },
    { key: 'iso', label: 'ISO', decimals: 3, desc: 'Isolated Power = SLG - AVG.' },
    { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout rate = SO / PA.' },
    { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk rate = BB / PA.' },
    { key: 'hrPct', label: 'HR%', decimals: 3, desc: 'HR rate = HR / AB.' },
    { key: 'opsDeviation', label: 'OPS±', decimals: 3, colorCode: 'positive-good', desc: 'OPS deviation from points regression within position. Positive (green) = overperforming for cost.' },
    { key: 'wobaDeviation', label: 'wOBA±', decimals: 3, colorCode: 'positive-good', desc: 'wOBA deviation from points regression. Positive (green) = overperforming for cost.' },
    { key: 'priceResidual', label: 'Pts±', decimals: 0, colorCode: 'negative-good', desc: 'Points residual from the pricing regression (actual - predicted). Negative (green) = card costs LESS than the stats-formula predicts = underpriced. Positive (red) = overpriced per the formula.' },
    { key: 'combinedScore', label: 'z+/−', decimals: 2, colorCode: 'positive-good', desc: 'Combined z-score within position group: avg[z(OPS±), z(wOBA±)] − z(Pts±). Higher (green) = outperforms AND/OR underpriced; lower (red) = the opposite. Performance averages both OPS and wOBA deviations (same pair that feeds Val) so offense signal is balanced against price.' },
    { key: 'hits', label: 'H', decimals: 0, desc: 'Hits = 1B + 1B+ + 2B + 3B + HR.' },
    { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles.' },
    { key: 'triples', label: '3B', decimals: 0, desc: 'Triples.' },
    { key: 'homeRuns', label: 'HR', decimals: 0, desc: 'Home runs.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'Vused', label: 'V', decimals: 0, desc: 'V (Vision) icon uses — rerolls of outs on hitter chart (max 2 per 5-AB game).' },
    { key: 'Sused', label: 'S', decimals: 0, desc: 'S (Speed) icon uses — singles upgraded to doubles (once per 5-AB game).' },
    { key: 'HRused', label: 'HR*', decimals: 0, desc: 'HR (Power) icon uses — doubles/triples upgraded to HRs (once per 5-AB game).' },
    { key: 'totalIconWobaImpact', label: 'Ico+', decimals: 3, colorCode: 'positive-good', desc: 'Total icon wOBA impact — estimated wOBA boost from all icons combined.' },
    { key: 'rAdjustmentAbs', label: 'RVar', decimals: 0, desc: 'R icon variance magnitude — cumulative sum of |±3| applied to swing rolls. Linear with PA count for hitters with R; expected ≈ 1.71 × PA. 0 if hitter lacks R.' },
    { key: 'rAdjustmentNet', label: 'RNet', decimals: 0, colorCode: 'positive-good', desc: 'R icon net luck — signed sum of all ±3 adjustments. Positive (green) = R helped this hitter (rolls ran high); negative (red) = R hurt them. Should average ~0 across many sims.' },
    { key: 'ryUsed', label: 'RY', decimals: 0, desc: 'RY icon uses — +3 swing bonuses applied on hitter-chart PAs (once per 5 ABs, Enhanced mode only).' },
];

const PITCHER_VIEW_COLS: ViewCol<PitcherFinal>[] = [
    { key: 'valueRating', label: 'Val', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of WHIP and mWHIP deviation vs points.' },
    { key: 'name', label: 'Name', desc: 'Pitcher name, year, edition, card number, team.' },
    { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost.' },
    { key: 'Control', label: 'Ctrl', decimals: 0, desc: 'Control — added to pitcher d20 roll.' },
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
    { key: 'whipDeviation', label: 'WHIP±', decimals: 3, colorCode: 'negative-good', desc: 'WHIP deviation from regression. Negative (green) = better than expected for cost.' },
    { key: 'mWHIPDeviation', label: 'mWHIP±', decimals: 3, colorCode: 'negative-good', desc: 'mWHIP deviation from regression. Negative (green) = better than expected.' },
    { key: 'priceResidual', label: 'Pts±', decimals: 0, colorCode: 'negative-good', desc: 'Points residual from pricing regression (actual - predicted). Negative (green) = underpriced per stats formula.' },
    { key: 'combinedScore', label: 'z+/−', decimals: 2, colorCode: 'positive-good', desc: 'Combined z-score within role group: −avg[z(WHIP±), z(mWHIP±)] − z(Pts±). Higher (green) = lower WHIP AND/OR underpriced; lower (red) = the opposite. Performance averages both WHIP metrics (same pair that feeds Val) so pitching signal is balanced against price.' },
    { key: 'battersFaced', label: 'BF', decimals: 0, desc: 'Batters Faced.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks.' },
    { key: 'homeruns', label: 'HR', decimals: 0, desc: 'Home runs allowed.' },
    { key: 'kIconHRsBlocked', label: 'K*', decimals: 0, desc: 'K icon uses — HRs converted to strikeouts (once per 9 innings).' },
    { key: 'twentyIconAdvantageSwings', label: '20*', decimals: 0, desc: '20 icon advantage swings — +3 control bonus flipped from hitter to pitcher chart.' },
    { key: 'rpIconAdvantageSwings', label: 'RP*', decimals: 0, desc: 'RP icon advantage swings — first-inning +3 control bonus flipped chart.' },
    { key: 'rAdjustmentAbs', label: 'RVar', decimals: 0, desc: 'R icon variance magnitude — cumulative sum of |±3| applied to pitch rolls. Linear with BF for pitchers with R; expected ≈ 1.71 × BF. 0 if pitcher lacks R.' },
    { key: 'rAdjustmentNet', label: 'RNet', decimals: 0, colorCode: 'positive-good', desc: 'R icon net luck — signed sum of all ±3 adjustments. Positive (green) = R helped this pitcher (rolls ran high → more pitcher-chart matchups); negative (red) = R hurt them. Should average ~0 across many sims.' },
    { key: 'ryUsed', label: 'RY', decimals: 0, desc: 'RY icon uses — +3 pitch bonuses applied (once per 27 outs, Enhanced mode only).' },
];

function sortRows<T extends Record<string, any>>(rows: T[], key: keyof T, dir: 'asc' | 'desc'): T[] {
    const mult = dir === 'desc' ? -1 : 1;
    const copy = [...rows];
    copy.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        // null/undefined always sort to the bottom regardless of direction
        const aNull = av === null || av === undefined || (typeof av === 'number' && Number.isNaN(av));
        const bNull = bv === null || bv === undefined || (typeof bv === 'number' && Number.isNaN(bv));
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
        return String(av).localeCompare(String(bv)) * mult;
    });
    return copy;
}

function formatCell(val: unknown, decimals?: number): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return decimals !== undefined ? val.toFixed(decimals) : String(val);
    return String(val);
}

function cellClass<T>(col: ViewCol<T>, val: unknown): string {
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

function groupHittersByPosition(hitters: HitterFinal[]): Record<string, HitterFinal[]> {
    const out: Record<string, HitterFinal[]> = Object.fromEntries(HITTER_POSITIONS.map(p => [p, [] as HitterFinal[]]));
    for (const p of hitters) {
        out['All Hitters'].push(p);
        if (!p.Position) continue;
        const posList = p.Position.split(',').map(pp => pp.trim().split('+')[0]);
        // Dedupe: a card like "3B+3, IF+1" shouldn't end up in 3B twice.
        const targets = new Set<string>();
        for (const pos of posList) {
            if (HITTER_POSITIONS.includes(pos)) targets.add(pos);
            if (pos === 'IF') ['1B', '2B', '3B', 'SS'].forEach(pp => targets.add(pp));
            if (pos === 'OF') ['LF-RF', 'CF'].forEach(pp => targets.add(pp));
        }
        targets.forEach(t => out[t].push(p));
    }
    // Compute per-group regression/percentile/value so the "Value" column matches the export
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

export default function SimulationPage({ onBack }: Props) {
    // Store the raw input string so the user can fully clear / retype without
    // the onChange handler snapping it back to a fallback number.
    const [atBatsInput, setAtBatsInput] = useState('50');
    const parsedAtBats = parseInt(atBatsInput, 10);
    const atBatsValid = !Number.isNaN(parsedAtBats) && parsedAtBats >= 1 && parsedAtBats <= 2000;
    const atBats = atBatsValid ? parsedAtBats : 0;
    const [phase, setPhase] = useState<Phase>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [iconsOnProgress, setIconsOnProgress] = useState({ done: 0, total: 0 });
    const [iconsOffProgress, setIconsOffProgress] = useState({ done: 0, total: 0 });
    const [enhancedProgress, setEnhancedProgress] = useState({ done: 0, total: 0 });
    const [elapsedMs, setElapsedMs] = useState(0);
    const [results, setResults] = useState<SimExportData | null>(null);
    const [usedConfig, setUsedConfig] = useState<SimConfig | null>(null);
    const [rawData, setRawData] = useState<{ hitters: RawHitter[]; pitchers: RawPitcher[] } | null>(null);

    // View-state (tabs)
    const [viewMode, setViewMode] = useState<'on' | 'off' | 'enhanced'>('on');
    const [viewKind, setViewKind] = useState<'hitters' | 'pitchers'>('hitters');
    const [viewPosition, setViewPosition] = useState('All Hitters');
    const [viewRole, setViewRole] = useState('Starters');

    // Sort state — null means use the default (value-rating desc) from grouping
    const [hitterSort, setHitterSort] = useState<{ key: keyof HitterFinal; dir: 'asc' | 'desc' } | null>(null);
    const [pitcherSort, setPitcherSort] = useState<{ key: keyof PitcherFinal; dir: 'asc' | 'desc' } | null>(null);

    // Hovered card popup — uses the same CardTooltip as the Team Builder.
    const [hoverCard, setHoverCard] = useState<Card | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const workerRef = useRef<Worker | null>(null);

    // Preload card data so the first run doesn't pay the fetch cost
    useEffect(() => {
        if (rawData) return;
        setPhase('loading');
        Promise.all([
            fetch(`${BASE}hitters.json`).then(r => r.json() as Promise<RawHitter[]>),
            fetch(`${BASE}pitchers.json`).then(r => r.json() as Promise<RawPitcher[]>),
        ]).then(([hitters, pitchers]) => {
            setRawData({ hitters, pitchers });
            setPhase('idle');
        }).catch((err) => {
            setErrorMsg(`Failed to load card data: ${err?.message || err}`);
            setPhase('error');
        });
    }, [rawData]);

    const terminateWorker = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
    }, []);

    useEffect(() => () => terminateWorker(), [terminateWorker]);

    const run = useCallback(() => {
        if (!rawData) return;
        setPhase('running');
        setErrorMsg('');
        setIconsOnProgress({ done: 0, total: rawData.hitters.length });
        setIconsOffProgress({ done: 0, total: rawData.hitters.length });
        setEnhancedProgress({ done: 0, total: rawData.hitters.length });
        setElapsedMs(0);
        setResults(null);

        const config: SimConfig = {
            ...DEFAULT_CONFIG,
            AT_BATS_PER_MATCHUP: atBats,
            SEED: null,
        };
        setUsedConfig(config);

        terminateWorker();
        const worker = new Worker(new URL('../sim/simWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent<WorkerOut>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                if (msg.phase === 'icons-on') setIconsOnProgress({ done: msg.done, total: msg.total });
                else if (msg.phase === 'icons-off') setIconsOffProgress({ done: msg.done, total: msg.total });
                else setEnhancedProgress({ done: msg.done, total: msg.total });
                setElapsedMs(msg.elapsedMs);
            } else if (msg.type === 'done') {
                setResults(msg.data);
                setElapsedMs(msg.elapsedMs);
                setPhase('done');
                terminateWorker();
            } else if (msg.type === 'error') {
                setErrorMsg(msg.message);
                setPhase('error');
                terminateWorker();
            }
        };
        worker.onerror = (err) => {
            setErrorMsg(err.message || 'Worker crashed');
            setPhase('error');
            terminateWorker();
        };

        worker.postMessage({
            type: 'run',
            config,
            hitters: rawData.hitters,
            pitchers: rawData.pitchers,
        });
    }, [rawData, atBats, terminateWorker]);

    const cancel = useCallback(() => {
        terminateWorker();
        setPhase('idle');
    }, [terminateWorker]);

    const exportHtml = useCallback(() => {
        if (!results || !usedConfig) return;
        const html = buildHtmlReport(results, usedConfig, rawData || undefined);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `showdown-sim-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [results, usedConfig, rawData]);

    const hittersForView = (mode: 'on' | 'off' | 'enhanced'): HitterFinal[] | null => {
        if (!results) return null;
        if (mode === 'on') return results.hittersOn;
        if (mode === 'off') return results.hittersOff;
        return results.hittersEnhanced;
    };
    const pitchersForView = (mode: 'on' | 'off' | 'enhanced'): PitcherFinal[] | null => {
        if (!results) return null;
        if (mode === 'on') return results.pitchersOn;
        if (mode === 'off') return results.pitchersOff;
        return results.pitchersEnhanced;
    };
    // Fit the pricing regression once per card catalog load — resulting
    // residuals and value ratios are merged into each sim row below.
    const hitterPriceMap = useMemo(() => {
        if (!rawData) return null;
        const fit = fitHitterPricing(rawData.hitters);
        const m = new Map<string, { residual: number }>();
        for (const r of fit.rows) m.set(r.name, { residual: r.residual });
        return m;
    }, [rawData]);
    const pitcherPriceMap = useMemo(() => {
        if (!rawData) return null;
        // Starters and bullpen have fundamentally different pricing scales
        // (IP range alone makes a combined fit noisy), so each group gets its
        // own model. Merge residuals into one name→residual map.
        const starterFit = fitStarterPricing(rawData.pitchers);
        const bullpenFit = fitBullpenPricing(rawData.pitchers);
        const m = new Map<string, { residual: number }>();
        for (const r of starterFit.rows) m.set(r.name, { residual: r.residual });
        for (const r of bullpenFit.rows) m.set(r.name, { residual: r.residual });
        return m;
    }, [rawData]);

    const hittersGrouped = useMemo(
        () => {
            const h = hittersForView(viewMode);
            if (!h) return null;
            const grouped = groupHittersByPosition(h);
            // After per-position regressions populate opsDeviation, enrich each
            // row with its pricing residual and compute a combined z-score
            // within the position group.
            if (hitterPriceMap) {
                for (const pos of Object.keys(grouped)) {
                    for (const row of grouped[pos]) {
                        const p = hitterPriceMap.get(row.name);
                        if (p) row.priceResidual = p.residual;
                    }
                    assignCombinedScore(grouped[pos], [r => r.opsDeviation, r => r.wobaDeviation], true);
                }
            }
            return grouped;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [results, viewMode, hitterPriceMap]
    );
    const pitchersGrouped = useMemo(
        () => {
            const p = pitchersForView(viewMode);
            if (!p) return null;
            const grouped = groupPitchersByRole(p);
            if (pitcherPriceMap) {
                for (const role of Object.keys(grouped)) {
                    for (const row of grouped[role]) {
                        const price = pitcherPriceMap.get(row.name);
                        if (price) row.priceResidual = price.residual;
                    }
                    // WHIP and mWHIP: lower is better, so flip the perf z-score.
                    assignCombinedScore(grouped[role], [r => r.whipDeviation, r => r.mWHIPDeviation], false);
                }
            }
            return grouped;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [results, viewMode, pitcherPriceMap]
    );

    // Apply the user's click-sort on top of the default-grouped order.
    const sortedHitterRows = useMemo(() => {
        const rows = hittersGrouped?.[viewPosition] || null;
        if (!rows) return rows;
        if (!hitterSort) return rows;
        return sortRows(rows, hitterSort.key, hitterSort.dir);
    }, [hittersGrouped, viewPosition, hitterSort]);

    const sortedPitcherRows = useMemo(() => {
        const rows = pitchersGrouped?.[viewRole] || null;
        if (!rows) return rows;
        if (!pitcherSort) return rows;
        return sortRows(rows, pitcherSort.key, pitcherSort.dir);
    }, [pitchersGrouped, viewRole, pitcherSort]);

    const handleHitterSort = (key: keyof HitterFinal) => {
        setHitterSort(prev => {
            if (prev && prev.key === key) {
                return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
            }
            // default: strings asc, numbers desc
            const col = HITTER_VIEW_COLS.find(c => c.key === key);
            const dir: 'asc' | 'desc' = col?.decimals === undefined && key !== 'valueRating' ? 'asc' : 'desc';
            return { key, dir };
        });
    };

    const handlePitcherSort = (key: keyof PitcherFinal) => {
        setPitcherSort(prev => {
            if (prev && prev.key === key) {
                return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
            }
            const col = PITCHER_VIEW_COLS.find(c => c.key === key);
            const dir: 'asc' | 'desc' = col?.decimals === undefined && key !== 'valueRating' ? 'asc' : 'desc';
            return { key, dir };
        });
    };

    const sortArrow = (active: boolean, dir: 'asc' | 'desc') => {
        if (!active) return '';
        return dir === 'desc' ? ' \u25BC' : ' \u25B2';
    };

    const showHitterPopup = (row: HitterFinal) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(hitterFinalToCard(row)), 200);
    };
    const showPitcherPopup = (row: PitcherFinal) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setHoverCard(pitcherFinalToCard(row)), 200);
    };
    const hidePopup = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setHoverCard(null);
    };

    // Hide the popup if the active tab (mode / kind / position / role) changes,
    // so it doesn't linger when the hovered row scrolls out of view.
    useEffect(() => { hidePopup(); }, [viewMode, viewKind, viewPosition, viewRole]);

    const onPct = iconsOnProgress.total ? Math.round((iconsOnProgress.done / iconsOnProgress.total) * 100) : 0;
    const offPct = iconsOffProgress.total ? Math.round((iconsOffProgress.done / iconsOffProgress.total) * 100) : 0;
    const enhPct = enhancedProgress.total ? Math.round((enhancedProgress.done / enhancedProgress.total) * 100) : 0;
    const totalMatchups = rawData ? rawData.hitters.length * rawData.pitchers.length * atBats * 3 : 0;

    return (
        <div className="sim-page">
            <div className="sim-container">
                <div className="sim-header">
                    <button className="sim-back" onClick={onBack}>&larr; Back</button>
                    <h1>Simulation</h1>
                    <div />
                </div>

                <div className="sim-config">
                    <div className="sim-config-row">
                        <label>
                            At-bats per matchup
                            <input
                                type="number" min={1} max={2000} value={atBatsInput}
                                disabled={phase === 'running' || phase === 'loading'}
                                onChange={e => setAtBatsInput(e.target.value)}
                            />
                            {!atBatsValid && (
                                <span style={{ color: 'var(--error, #f87171)', fontSize: 11 }}>
                                    Enter 1-2000
                                </span>
                            )}
                        </label>
                        <div className="sim-run-controls">
                            {phase === 'running' ? (
                                <button className="sim-btn sim-btn-danger" onClick={cancel}>Cancel</button>
                            ) : (
                                <button className="sim-btn sim-btn-primary" onClick={run} disabled={phase === 'loading' || !rawData || !atBatsValid}>
                                    {phase === 'loading' ? 'Loading cards…' : 'Run Simulation'}
                                </button>
                            )}
                        </div>
                    </div>
                    {rawData && (
                        <div className="sim-estimate">
                            {rawData.hitters.length.toLocaleString()} hitters × {rawData.pitchers.length.toLocaleString()} pitchers ×
                            {' '}{atBats} AB × 3 modes = {totalMatchups.toLocaleString()} at-bats
                            {atBats > 200 && <span className="sim-warn"> — will take a few minutes</span>}
                        </div>
                    )}
                </div>

                {phase === 'error' && <div className="sim-error">{errorMsg}</div>}

                {phase === 'running' && (
                    <div className="sim-progress-block">
                        <div className="sim-progress-label">Icons ON — {iconsOnProgress.done} / {iconsOnProgress.total}</div>
                        <div className="sim-progress-bar"><div className="sim-progress-fill" style={{ width: `${onPct}%` }} /></div>
                        <div className="sim-progress-label">Icons OFF — {iconsOffProgress.done} / {iconsOffProgress.total}</div>
                        <div className="sim-progress-bar"><div className="sim-progress-fill" style={{ width: `${offPct}%` }} /></div>
                        <div className="sim-progress-label">Enhanced (R/RY) — {enhancedProgress.done} / {enhancedProgress.total}</div>
                        <div className="sim-progress-bar"><div className="sim-progress-fill" style={{ width: `${enhPct}%` }} /></div>
                        <div className="sim-elapsed">Elapsed: {(elapsedMs / 1000).toFixed(1)}s</div>
                    </div>
                )}

                {hoverCard && <CardTooltip card={hoverCard} />}

                {results && phase === 'done' && (
                    <div className="sim-results">
                        <div className="sim-results-head">
                            <span>Simulation complete in {(elapsedMs / 1000).toFixed(1)}s</span>
                            <button className="sim-btn sim-btn-primary" onClick={exportHtml}>Export HTML</button>
                        </div>

                        <div className="sim-tabs">
                            <button className={`sim-tab ${viewMode === 'on' ? 'active' : ''}`} onClick={() => setViewMode('on')}>Icons ON</button>
                            <button className={`sim-tab ${viewMode === 'off' ? 'active' : ''}`} onClick={() => setViewMode('off')}>Icons OFF</button>
                            <button className={`sim-tab ${viewMode === 'enhanced' ? 'active' : ''}`} onClick={() => setViewMode('enhanced')}>Enhanced (R/RY)</button>
                        </div>

                        <div className="sim-tabs">
                            <button className={`sim-tab ${viewKind === 'hitters' ? 'active' : ''}`} onClick={() => setViewKind('hitters')}>Hitters</button>
                            <button className={`sim-tab ${viewKind === 'pitchers' ? 'active' : ''}`} onClick={() => setViewKind('pitchers')}>Pitchers</button>
                        </div>

                        {viewKind === 'hitters' && hittersGrouped && (
                            <>
                                <div className="sim-subtabs">
                                    {HITTER_POSITIONS.map(pos => (
                                        <button key={pos} className={`sim-subtab ${viewPosition === pos ? 'active' : ''}`} onClick={() => setViewPosition(pos)}>
                                            {pos} ({hittersGrouped[pos].length})
                                        </button>
                                    ))}
                                </div>
                                <div className="sim-table-wrap">
                                    <table className="sim-table">
                                        <thead>
                                            <tr>{HITTER_VIEW_COLS.map(c => {
                                                const active = hitterSort?.key === c.key;
                                                return (
                                                    <th
                                                        key={c.key as string}
                                                        title={c.desc}
                                                        className={`sim-th-sortable ${active ? 'sim-th-active' : ''}`}
                                                        onClick={() => handleHitterSort(c.key)}
                                                    >
                                                        {c.label}{sortArrow(active, hitterSort?.dir || 'desc')}
                                                    </th>
                                                );
                                            })}</tr>
                                        </thead>
                                        <tbody>
                                            {(sortedHitterRows || []).map(p => (
                                                <tr key={p.name}>
                                                    {HITTER_VIEW_COLS.map(c => {
                                                        const val = p[c.key];
                                                        const isName = c.key === 'name';
                                                        return (
                                                            <td
                                                                key={c.key as string}
                                                                className={`${cellClass(c, val)} ${isName ? 'sim-name-cell' : ''}`}
                                                                onMouseEnter={isName ? () => showHitterPopup(p) : undefined}
                                                                onMouseLeave={isName ? hidePopup : undefined}
                                                            >
                                                                {formatCell(val, c.decimals)}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {viewKind === 'pitchers' && pitchersGrouped && (
                            <>
                                <div className="sim-subtabs">
                                    {PITCHER_ROLES.map(role => (
                                        <button key={role} className={`sim-subtab ${viewRole === role ? 'active' : ''}`} onClick={() => setViewRole(role)}>
                                            {role} ({pitchersGrouped[role].length})
                                        </button>
                                    ))}
                                </div>
                                <div className="sim-table-wrap">
                                    <table className="sim-table">
                                        <thead>
                                            <tr>{PITCHER_VIEW_COLS.map(c => {
                                                const active = pitcherSort?.key === c.key;
                                                return (
                                                    <th
                                                        key={c.key as string}
                                                        title={c.desc}
                                                        className={`sim-th-sortable ${active ? 'sim-th-active' : ''}`}
                                                        onClick={() => handlePitcherSort(c.key)}
                                                    >
                                                        {c.label}{sortArrow(active, pitcherSort?.dir || 'desc')}
                                                    </th>
                                                );
                                            })}</tr>
                                        </thead>
                                        <tbody>
                                            {(sortedPitcherRows || []).map(p => (
                                                <tr key={p.name}>
                                                    {PITCHER_VIEW_COLS.map(c => {
                                                        const val = p[c.key];
                                                        const isName = c.key === 'name';
                                                        return (
                                                            <td
                                                                key={c.key as string}
                                                                className={`${cellClass(c, val)} ${isName ? 'sim-name-cell' : ''}`}
                                                                onMouseEnter={isName ? () => showPitcherPopup(p) : undefined}
                                                                onMouseLeave={isName ? hidePopup : undefined}
                                                            >
                                                                {formatCell(val, c.decimals)}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
