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
import './SimulationPage.css';

const BASE = import.meta.env.BASE_URL || '/';

interface Props { onBack: () => void; }

type Phase = 'idle' | 'loading' | 'running' | 'done' | 'error';

interface ProgressMsg { type: 'progress'; phase: 'icons-on' | 'icons-off'; done: number; total: number; elapsedMs: number }
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
    { key: 'battersFaced', label: 'BF', decimals: 0, desc: 'Batters Faced.' },
    { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts.' },
    { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks.' },
    { key: 'homeruns', label: 'HR', decimals: 0, desc: 'Home runs allowed.' },
    { key: 'kIconHRsBlocked', label: 'K*', decimals: 0, desc: 'K icon uses — HRs converted to strikeouts (once per 9 innings).' },
    { key: 'twentyIconAdvantageSwings', label: '20*', decimals: 0, desc: '20 icon advantage swings — +3 control bonus flipped from hitter to pitcher chart.' },
    { key: 'rpIconAdvantageSwings', label: 'RP*', decimals: 0, desc: 'RP icon advantage swings — first-inning +3 control bonus flipped chart.' },
];

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
        for (const pos of posList) {
            if (HITTER_POSITIONS.includes(pos)) out[pos].push(p);
            if (pos === 'IF') ['1B', '2B', '3B', 'SS'].forEach(pp => out[pp].push(p));
            if (pos === 'OF') ['LF-RF', 'CF'].forEach(pp => out[pp].push(p));
        }
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
    const [atBats, setAtBats] = useState(50);
    const [seed, setSeed] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [iconsOnProgress, setIconsOnProgress] = useState({ done: 0, total: 0 });
    const [iconsOffProgress, setIconsOffProgress] = useState({ done: 0, total: 0 });
    const [elapsedMs, setElapsedMs] = useState(0);
    const [results, setResults] = useState<SimExportData | null>(null);
    const [usedConfig, setUsedConfig] = useState<SimConfig | null>(null);
    const [rawData, setRawData] = useState<{ hitters: RawHitter[]; pitchers: RawPitcher[] } | null>(null);

    // View-state (tabs)
    const [viewMode, setViewMode] = useState<'on' | 'off'>('on');
    const [viewKind, setViewKind] = useState<'hitters' | 'pitchers'>('hitters');
    const [viewPosition, setViewPosition] = useState('All Hitters');
    const [viewRole, setViewRole] = useState('Starters');

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
        setElapsedMs(0);
        setResults(null);

        const config: SimConfig = {
            ...DEFAULT_CONFIG,
            AT_BATS_PER_MATCHUP: atBats,
            SEED: seed.trim() || null,
        };
        setUsedConfig(config);

        terminateWorker();
        const worker = new Worker(new URL('../sim/simWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent<WorkerOut>) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                if (msg.phase === 'icons-on') setIconsOnProgress({ done: msg.done, total: msg.total });
                else setIconsOffProgress({ done: msg.done, total: msg.total });
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
    }, [rawData, atBats, seed, terminateWorker]);

    const cancel = useCallback(() => {
        terminateWorker();
        setPhase('idle');
    }, [terminateWorker]);

    const exportHtml = useCallback(() => {
        if (!results || !usedConfig) return;
        const html = buildHtmlReport(results, usedConfig);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `showdown-sim-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [results, usedConfig]);

    const hittersGrouped = useMemo(
        () => results ? groupHittersByPosition(viewMode === 'on' ? results.hittersOn : results.hittersOff) : null,
        [results, viewMode]
    );
    const pitchersGrouped = useMemo(
        () => results ? groupPitchersByRole(viewMode === 'on' ? results.pitchersOn : results.pitchersOff) : null,
        [results, viewMode]
    );

    const onPct = iconsOnProgress.total ? Math.round((iconsOnProgress.done / iconsOnProgress.total) * 100) : 0;
    const offPct = iconsOffProgress.total ? Math.round((iconsOffProgress.done / iconsOffProgress.total) * 100) : 0;
    const totalMatchups = rawData ? rawData.hitters.length * rawData.pitchers.length * atBats * 2 : 0;

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
                                type="number" min={1} max={2000} value={atBats}
                                disabled={phase === 'running' || phase === 'loading'}
                                onChange={e => setAtBats(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                        </label>
                        <label>
                            Seed (optional)
                            <input
                                type="text" value={seed} placeholder="random"
                                disabled={phase === 'running' || phase === 'loading'}
                                onChange={e => setSeed(e.target.value)}
                            />
                        </label>
                        <div className="sim-run-controls">
                            {phase === 'running' ? (
                                <button className="sim-btn sim-btn-danger" onClick={cancel}>Cancel</button>
                            ) : (
                                <button className="sim-btn sim-btn-primary" onClick={run} disabled={phase === 'loading' || !rawData}>
                                    {phase === 'loading' ? 'Loading cards…' : 'Run Simulation'}
                                </button>
                            )}
                        </div>
                    </div>
                    {rawData && (
                        <div className="sim-estimate">
                            {rawData.hitters.length.toLocaleString()} hitters × {rawData.pitchers.length.toLocaleString()} pitchers ×
                            {' '}{atBats} AB × 2 modes = {totalMatchups.toLocaleString()} at-bats
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
                        <div className="sim-elapsed">Elapsed: {(elapsedMs / 1000).toFixed(1)}s</div>
                    </div>
                )}

                {results && phase === 'done' && (
                    <div className="sim-results">
                        <div className="sim-results-head">
                            <span>Simulation complete in {(elapsedMs / 1000).toFixed(1)}s</span>
                            <button className="sim-btn sim-btn-primary" onClick={exportHtml}>Export HTML</button>
                        </div>

                        <div className="sim-tabs">
                            <button className={`sim-tab ${viewMode === 'on' ? 'active' : ''}`} onClick={() => setViewMode('on')}>Icons ON</button>
                            <button className={`sim-tab ${viewMode === 'off' ? 'active' : ''}`} onClick={() => setViewMode('off')}>Icons OFF</button>
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
                                            <tr>{HITTER_VIEW_COLS.map(c => (
                                                <th key={c.key as string} title={c.desc}>{c.label}</th>
                                            ))}</tr>
                                        </thead>
                                        <tbody>
                                            {hittersGrouped[viewPosition].map(p => (
                                                <tr key={p.name}>
                                                    {HITTER_VIEW_COLS.map(c => {
                                                        const val = p[c.key];
                                                        return (
                                                            <td key={c.key as string} className={cellClass(c, val)}>
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
                                            <tr>{PITCHER_VIEW_COLS.map(c => (
                                                <th key={c.key as string} title={c.desc}>{c.label}</th>
                                            ))}</tr>
                                        </thead>
                                        <tbody>
                                            {pitchersGrouped[viewRole].map(p => (
                                                <tr key={p.name}>
                                                    {PITCHER_VIEW_COLS.map(c => {
                                                        const val = p[c.key];
                                                        return (
                                                            <td key={c.key as string} className={cellClass(c, val)}>
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
