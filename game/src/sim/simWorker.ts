/**
 * Web Worker that runs the MLB Showdown simulation off the main thread.
 *
 * Messages:
 *   → from main: { type: 'run'; config: SimConfig; hitters: RawHitter[]; pitchers: RawPitcher[] }
 *   → from main: { type: 'cancel' }
 *   ← from worker: { type: 'progress'; phase: 'icons-on' | 'icons-off'; done: number; total: number; elapsedMs: number }
 *   ← from worker: { type: 'done'; data: SimExportData; elapsedMs: number }
 *   ← from worker: { type: 'error'; message: string }
 */

/// <reference lib="webworker" />

import seedrandom from 'seedrandom';
import {
    precomputeRanges, initializePitcher, createHitterStats,
    simulateAtBat, updateHitterStats, updatePitcherStats,
    type SimConfig, type RawHitter, type RawPitcher,
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
    config: SimConfig, rollDie: () => number, iconsEnabled: boolean,
    phase: 'icons-on' | 'icons-off', startTime: number,
): { hitters: HitterFinal[]; pitchers: PitcherFinal[] } | null {
    const pitcherData: PitcherState[] = pitchers.map(initializePitcher);
    const hitterResults: HitterFinal[] = [];
    const total = hitters.length;

    let lastPost = 0;
    for (let i = 0; i < total; i++) {
        if (cancelled) return null;
        const hitter = hitters[i];
        const stats = createHitterStats(hitter);

        for (const pitcher of pitcherData) {
            pitcher.iconCounts = { '20': 0, K: 0, RP: 0 };
            for (let ab = 0; ab < config.AT_BATS_PER_MATCHUP; ab++) {
                const outcome = simulateAtBat(hitter, pitcher, stats, rollDie, iconsEnabled);
                updateHitterStats(stats, outcome);
                updatePitcherStats(pitcher, outcome, config.WEIGHTS);
            }
        }
        hitterResults.push(calculateFinalStats(stats, config.WEIGHTS));

        // Post progress roughly every 100ms to avoid flooding the main thread
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

    // Mutates in place: adds `ranges` to each player
    precomputeRanges(hitters, ['SO', 'GB', 'FB', 'W', 'S', 'SPlus', 'DB', 'TR', 'HR']);
    precomputeRanges(pitchers, ['PU', 'SO', 'GB', 'FB', 'W', 'S', 'DB', 'HR']);

    const seed = msg.config.SEED || String(Date.now());
    const rng1 = seedrandom(seed);
    const rollDie1 = () => Math.floor(rng1() * 20) + 1;
    const onResults = runPhase(hitters, pitchers, msg.config, rollDie1, true, 'icons-on', startTime);
    if (!onResults) return; // cancelled

    const rng2 = seedrandom(seed);
    const rollDie2 = () => Math.floor(rng2() * 20) + 1;
    const offResults = runPhase(hitters, pitchers, msg.config, rollDie2, false, 'icons-off', startTime);
    if (!offResults) return;

    const data: SimExportData = {
        hittersOn: onResults.hitters,
        pitchersOn: onResults.pitchers,
        hittersOff: offResults.hitters,
        pitchersOff: offResults.pitchers,
    };
    (self as any).postMessage({ type: 'done', data, elapsedMs: Date.now() - startTime });
}

export {}; // make this a module
