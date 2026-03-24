/**
 * Chart resolution — ported from simulation/sim.js
 */
import type { HitterCard, PitcherCard } from '../types/cards';
import type { Outcome } from '../types/gameState';

interface Range {
    low: number;
    high: number;
}

export function parseRange(range: string | null): Range | null {
    if (!range) return null;
    if (range.includes('-')) {
        const [low, high] = range.split('-').map(Number);
        // Handle bad data like "3-0" where high < low
        if (high < low) return { low, high: low };
        return { low, high };
    }
    if (range.includes('+')) {
        return { low: parseInt(range.split('+')[0]), high: 20 };
    }
    const num = Number(range);
    return { low: num, high: num };
}

function rollInRange(roll: number, range: Range | null): boolean {
    return !!range && roll >= range.low && roll <= range.high;
}

const HITTER_CHART_FIELDS: { field: keyof HitterCard['chart']; outcome: Outcome }[] = [
    { field: 'SO', outcome: 'SO' },
    { field: 'GB', outcome: 'GB' },
    { field: 'FB', outcome: 'FB' },
    { field: 'W', outcome: 'W' },
    { field: 'S', outcome: 'S' },
    { field: 'SPlus', outcome: 'SPlus' },
    { field: 'DB', outcome: 'DB' },
    { field: 'TR', outcome: 'TR' },
];

const PITCHER_CHART_FIELDS: { field: keyof PitcherCard['chart']; outcome: Outcome }[] = [
    { field: 'PU', outcome: 'PU' },
    { field: 'SO', outcome: 'SO' },
    { field: 'GB', outcome: 'GB' },
    { field: 'FB', outcome: 'FB' },
    { field: 'W', outcome: 'W' },
    { field: 'S', outcome: 'S' },
    { field: 'DB', outcome: 'DB' },
];

export function resolveHitterChart(card: HitterCard, roll: number): Outcome {
    for (const { field, outcome } of HITTER_CHART_FIELDS) {
        const range = parseRange(card.chart[field]);
        if (rollInRange(roll, range)) return outcome;
    }
    // HR check (uses >= threshold)
    const hrRange = parseRange(card.chart.HR);
    if (hrRange && roll >= hrRange.low) return 'HR';
    return 'FB'; // fallback
}

export function resolvePitcherChart(card: PitcherCard, roll: number): Outcome {
    for (const { field, outcome } of PITCHER_CHART_FIELDS) {
        const range = parseRange(card.chart[field]);
        if (rollInRange(roll, range)) return outcome;
    }
    const hrRange = parseRange(card.chart.HR);
    if (hrRange && roll >= hrRange.low) return 'HR';
    return 'FB'; // fallback
}

export function resolvePitch(pitcherControl: number, hitterOnBase: number, pitchRoll: number, modifier: number = 0): {
    total: number;
    usePitcherChart: boolean;
} {
    const total = pitchRoll + pitcherControl + modifier;
    return {
        total,
        usePitcherChart: total > hitterOnBase,
    };
}
