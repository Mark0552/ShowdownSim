/**
 * Web Worker that runs the MLB Showdown simulation off the main thread.
 *
 * Messages:
 *   → from main: { type: 'run'; config: SimConfig; hitters: RawHitter[]; pitchers: RawPitcher[] }
 *   → from main: { type: 'cancel' }
 *   ← from worker: { type: 'progress'; phase: 'icons-on' | 'icons-off' | 'enhanced'; done: number; total: number; elapsedMs: number }
 *   ← from worker: { type: 'done'; data: SimExportData; elapsedMs: number }
 *   ← from worker: { type: 'error'; message: string }
 */

/// <reference lib="webworker" />

import seedrandom from 'seedrandom';
import {
    precomputeRanges, initializePitcher, createHitterStats,
    simulateAtBat, updateHitterStats, updatePitcherStats,
    type IconsMode, type SimConfig, type RawHitter, type RawPitcher,
    type PreparedHitter, type PreparedPitcher, type PitcherState,
} from './simEngine';
import { calculateFinalStats, calculatePitcherFinalStats, type HitterFinal, type PitcherFinal } from './simStats';
import type { SimExportData } from './simHtmlExport';

interface RunMsg {
    type: 'run';
    config: SimConfig;
    hitters: RawHitter[];
    pitchers: RawPitcher[];
}
interface CancelMsg { type: 'cancel' }
type InMsg = RunMsg | CancelMsg;

type PhaseName = 'icons-on' | 'icons-off' | 'enhanced';

let cancelled = false;

self.onmessage = (e: MessageEvent<InMsg>) => {
    const msg = e.data;
    if (msg.type === 'cancel') { cancelled = true; return; }
    if (msg.type === 'run') {
        cancelled = false;
        try {
            runSimulation(msg);
        } catch (err: any) {
            (self as any).postMessage({ type: 'error', message: err?.message || String(err) });
        }
    }
};

function runPhase(
    hitters: PreparedHitter[], pitchers: PreparedPitcher[],
    config: SimConfig, rng: () => number, mode: IconsMode,
    phase: PhaseName, startTime: number,
): { hitters: HitterFinal[]; pitchers: PitcherFinal[] } | null {
    const rollDie = () => Math.floor(rng() * 20) + 1;
    const pitcherData: PitcherState[] = pitchers.map(initializePitcher);
    const hitterResults: HitterFinal[] = [];
    const total = hitters.length;

    let lastPost = 0;
    for (let i = 0; i < total; i++) {
        if (cancelled) return null;
        const hitter = hitters[i];
        const stats = createHitterStats(hitter);

        for (const pitcher of pitcherData) {
            pitcher.iconCounts = { '20': 0, K: 0, RP: 0, RY: 0 };
            for (let ab = 0; ab < config.AT_BATS_PER_MATCHUP; ab++) {
                const outcome = simulateAtBat(hitter, pitcher, stats, rollDie, rng, mode);
                updateHitterStats(stats, outcome);
                updatePitcherStats(pitcher, outcome, config.WEIGHTS);
            }
        }
        hitterResults.push(calculateFinalStats(stats, config.WEIGHTS));

        const now = Date.now();
        if (now - lastPost > 100 || i === total - 1) {
            (self as any).postMessage({
                type: 'progress',
                phase,
                done: i + 1,
                total,
                elapsedMs: now - startTime,
            });
            lastPost = now;
        }
    }

    const pitcherFinals = calculatePitcherFinalStats(pitcherData, config.WEIGHTS);
    return { hitters: hitterResults, pitchers: pitcherFinals };
}

function runSimulation(msg: RunMsg) {
    const startTime = Date.now();

    const hitters = msg.hitters as PreparedHitter[];
    const pitchers = msg.pitchers as PreparedPitcher[];

    precomputeRanges(hitters, ['SO', 'GB', 'FB', 'W', 'S', 'SPlus', 'DB', 'TR', 'HR']);
    precomputeRanges(pitchers, ['PU', 'SO', 'GB', 'FB', 'W', 'S', 'DB', 'HR']);

    const seed = msg.config.SEED || String(Date.now());

    // Same seed across the three modes so outcomes are directly comparable.
    const rngOn = seedrandom(seed);
    const onResults = runPhase(hitters, pitchers, msg.config, rngOn, 'on', 'icons-on', startTime);
    if (!onResults) return;

    const rngOff = seedrandom(seed);
    const offResults = runPhase(hitters, pitchers, msg.config, rngOff, 'off', 'icons-off', startTime);
    if (!offResults) return;

    const rngEnhanced = seedrandom(seed);
    const enhResults = runPhase(hitters, pitchers, msg.config, rngEnhanced, 'enhanced', 'enhanced', startTime);
    if (!enhResults) return;

    const data: SimExportData = {
        hittersOn: onResults.hitters,
        pitchersOn: onResults.pitchers,
        hittersOff: offResults.hitters,
        pitchersOff: offResults.pitchers,
        hittersEnhanced: enhResults.hitters,
        pitchersEnhanced: enhResults.pitchers,
    };
    (self as any).postMessage({ type: 'done', data, elapsedMs: Date.now() - startTime });
}

export {};
