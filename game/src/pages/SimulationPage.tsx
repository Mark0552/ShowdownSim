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
const HITTER_VIEW_COLS: { key: keyof HitterFinal; label: string; decimals?: number }[] = [
    { key: 'valueRating', label: 'Value', decimals: 0 },
    { key: 'name', label: 'Name' },
    { key: 'points', label: 'Pts' },
    { key: 'onBase', label: 'OB' },
    { key: 'Speed', label: 'Spd' },
    { key: 'Position', label: 'Pos' },
    { key: 'battingAverage', label: 'AVG', decimals: 3 },
    { key: 'onBasePercentage', label: 'OBP', decimals: 3 },
    { key: 'sluggingPercentage', label: 'SLG', decimals: 3 },
    { key: 'ops', label: 'OPS', decimals: 3 },
    { key: 'woba', label: 'wOBA', decimals: 3 },
    { key: 'opsDeviation', label: 'OPS Dev', decimals: 3 },
    { key: 'hits', label: 'H', decimals: 0 },
    { key: 'homeRuns', label: 'HR', decimals: 0 },
    { key: 'walks', label: 'BB', decimals: 0 },
    { key: 'strikeouts', label: 'SO', decimals: 0 },
];

const PITCHER_VIEW_COLS: { key: keyof PitcherFinal; label: string; decimals?: number }[] = [
    { key: 'valueRating', label: 'Value', decimals: 0 },
    { key: 'name', label: 'Name' },
    { key: 'points', label: 'Pts' },
    { key: 'Control', label: 'Ctrl' },
    { key: 'IP', label: 'IP' },
    { key: 'whip', label: 'WHIP', decimals: 3 },
    { key: 'mWHIP', label: 'mWHIP', decimals: 3 },
    { key: 'oppAvg', label: 'Opp AVG', decimals: 3 },
    { key: 'oppOps', label: 'Opp OPS', decimals: 3 },
    { key: 'kPct', label: 'K%', decimals: 3 },
    { key: 'bbPct', label: 'BB%', decimals: 3 },
    { key: 'hr9', label: 'HR/9', decimals: 2 },
    { key: 'whipDeviation', label: 'WHIP Dev', decimals: 3 },
    { key: 'battersFaced', label: 'BF', decimals: 0 },
    { key: 'strikeouts', label: 'SO', decimals: 0 },
];

function formatCell(val: unknown, decimals?: number): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return decimals !== undefined ? val.toFixed(decimals) : String(val);
    return String(val);
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
                                            <tr>{HITTER_VIEW_COLS.map(c => <th key={c.key as string}>{c.label}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {hittersGrouped[viewPosition].map(p => (
                                                <tr key={p.name}>
                                                    {HITTER_VIEW_COLS.map(c => (
                                                        <td key={c.key as string}>{formatCell(p[c.key], c.decimals)}</td>
                                                    ))}
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
                                            <tr>{PITCHER_VIEW_COLS.map(c => <th key={c.key as string}>{c.label}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {pitchersGrouped[viewRole].map(p => (
                                                <tr key={p.name}>
                                                    {PITCHER_VIEW_COLS.map(c => (
                                                        <td key={c.key as string}>{formatCell(p[c.key], c.decimals)}</td>
                                                    ))}
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
