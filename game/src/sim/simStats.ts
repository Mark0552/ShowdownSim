/**
 * Stat finalization, regression, percentiles, and value-score helpers.
 * Ported from simulation/sim.js.
 */

import { linearRegression, mean, standardDeviation } from 'simple-statistics';
import type { HitterState, PitcherState, SimConfig } from './simEngine';

// Final, display-ready hitter row (post-simulation)
export interface HitterFinal {
    name: string; points: number; icons: string | null;
    onBase: number; Speed: number; Position: string; hand: string; team: string;
    edition: string; year: string | null; expansion: string | null; imagePath?: string;
    chart: Record<string, string>;
    hits: number; singleplus: number; doubles: number; triples: number; homeRuns: number;
    walks: number; strikeouts: number; popups: number; flyballs: number; groundballs: number;
    atBats: number;
    Vused: number; Sused: number; HRused: number;
    ryUsed: number; rAdjustmentAbs: number; rAdjustmentNet: number;
    singles: number;
    battingAverage: number; onBasePercentage: number; sluggingPercentage: number;
    iso: number; ops: number; woba: number;
    kPct: number; bbPct: number; hrPct: number; babip: number; gbFbRatio: number;
    vIconOutsAvoided: number; vIconObpImpact: number;
    sIconUpgrades: number; sIconSlgImpact: number;
    hrIconUpgrades: number; hrIconSlgImpact: number;
    totalIconSlgImpact: number; totalIconWobaImpact: number;
    // Computed later (regressions, percentiles, value)
    opsDeviation?: number; wobaDeviation?: number;
    opsPercentile?: number; wobaPercentile?: number;
    valueScore?: number; valueRating?: number;
    // Pricing residual from the hedonic regression (actual - predicted).
    // Populated in SimulationPage from a per-catalog fit.
    priceResidual?: number;
    // Combined z-score within position group: z(OPS dev) - z(price resid).
    combinedScore?: number;
}

export interface PitcherFinal extends Omit<PitcherState, 'iconImpact' | 'iconCounts' | 'ranges'> {
    kPct: number; bbPct: number; kBbRatio: number; hr9: number; gbPct: number;
    oppAvg: number; oppOps: number;
    kIconHRsBlocked: number; kIconTBSaved: number; kIconSlgImpact: number;
    twentyIconAdvantageSwings: number; twentyIconSwingRate: number;
    rpIconAdvantageSwings: number; rpIconSwingRate: number;
    totalIconSlgReduction: number;
    whipDeviation?: number; mWHIPDeviation?: number;
    whipPercentile?: number; mWHIPPercentile?: number;
    valueScore?: number; valueRating?: number;
    priceResidual?: number;
    // Combined z-score within role group: -z(WHIP dev) - z(price resid).
    combinedScore?: number;
}

export function calculateFinalStats(stats: HitterState, weights: SimConfig['WEIGHTS']): HitterFinal {
    const pa = stats.atBats;
    const ab = pa - stats.walks;
    const singles = stats.hits - stats.doubles - stats.triples - stats.homeRuns - stats.singleplus;
    const totalBases = singles + (2 * stats.singleplus) + (2 * stats.doubles) + (3 * stats.triples) + (4 * stats.homeRuns);

    const battingAverage = ab === 0 ? 0 : stats.hits / ab;
    const onBasePercentage = pa === 0 ? 0 : (stats.hits + stats.walks) / pa;
    const sluggingPercentage = ab === 0 ? 0 : totalBases / ab;
    const iso = sluggingPercentage - battingAverage;

    const kPct = pa === 0 ? 0 : stats.strikeouts / pa;
    const bbPct = pa === 0 ? 0 : stats.walks / pa;
    const hrPct = ab === 0 ? 0 : stats.homeRuns / ab;

    const babipDenom = ab - stats.strikeouts - stats.homeRuns;
    const babip = babipDenom <= 0 ? 0 : (stats.hits - stats.homeRuns) / babipDenom;
    const gbFbRatio = stats.flyballs === 0 ? 0 : stats.groundballs / stats.flyballs;

    const w = weights;
    const woba = (ab + stats.walks) === 0 ? 0 : (
        w.walk * stats.walks +
        w.single * singles +
        w.singlePlus * stats.singleplus +
        w.double * stats.doubles +
        w.triple * stats.triples +
        w.hr * stats.homeRuns
    ) / (ab + stats.walks);

    const iconImpact = stats.iconImpact;
    const vHitsEstimate = iconImpact.V.outsAvoided * 0.30;
    const vObpImpact = pa > 0 ? vHitsEstimate / pa : 0;
    const sSlgImpact = ab > 0 ? iconImpact.S.tbGained / ab : 0;
    const hrSlgImpact = ab > 0 ? iconImpact.HR.tbGained / ab : 0;
    const totalIconSlgImpact = sSlgImpact + hrSlgImpact;

    const vWobaImpact = pa > 0 ? (vHitsEstimate * w.single) / pa : 0;
    const sWobaImpact = pa > 0 ? (iconImpact.S.doublesFromSingles * (w.double - w.single)) / pa : 0;
    const hrWobaImpact = pa > 0 ? (
        (iconImpact.HR.hrsFromDoubles * (w.hr - w.double)) +
        (iconImpact.HR.hrsFromTriples * (w.hr - w.triple))
    ) / pa : 0;
    const totalIconWobaImpact = vWobaImpact + sWobaImpact + hrWobaImpact;

    return {
        name: stats.name,
        points: stats.points,
        icons: stats.icons,
        onBase: stats.onBase, Speed: stats.Speed, Position: stats.Position, hand: stats.hand,
        team: stats.team, edition: stats.edition, year: stats.year, expansion: stats.expansion,
        imagePath: stats.imagePath, chart: stats.chart,
        hits: stats.hits, singleplus: stats.singleplus,
        doubles: stats.doubles, triples: stats.triples, homeRuns: stats.homeRuns,
        walks: stats.walks, strikeouts: stats.strikeouts,
        popups: stats.popups, flyballs: stats.flyballs, groundballs: stats.groundballs,
        atBats: stats.atBats,
        Vused: stats.Vused, Sused: stats.Sused, HRused: stats.HRused,
        ryUsed: stats.ryUsed,
        rAdjustmentAbs: stats.rAdjustmentAbs,
        rAdjustmentNet: stats.rAdjustmentNet,
        singles,
        battingAverage, onBasePercentage, sluggingPercentage,
        iso, ops: onBasePercentage + sluggingPercentage, woba,
        kPct, bbPct, hrPct, babip, gbFbRatio,
        vIconOutsAvoided: iconImpact.V.outsAvoided,
        vIconObpImpact: vObpImpact,
        sIconUpgrades: iconImpact.S.doublesFromSingles,
        sIconSlgImpact: sSlgImpact,
        hrIconUpgrades: iconImpact.HR.hrsFromDoubles + iconImpact.HR.hrsFromTriples,
        hrIconSlgImpact: hrSlgImpact,
        totalIconSlgImpact,
        totalIconWobaImpact,
    };
}

// ============================================================================
// REGRESSION / PERCENTILES / VALUE
// ============================================================================

export function calculateRegressions<T extends Record<string, any>>(
    players: T[], xField: string, yFields: { value: string; deviation: string }[]
) {
    if (!players || players.length < 2) {
        players.forEach(p => yFields.forEach(f => ((p as any)[f.deviation] = 0)));
        return;
    }
    yFields.forEach(({ value, deviation }) => {
        const data = players.map(p => [p[xField] as number, p[value] as number]);
        const model = linearRegression(data);
        players.forEach(p => {
            const expected = model.m * p[xField] + model.b;
            (p as any)[deviation] = p[value] - expected;
        });
    });
}

export function calculatePercentiles<T extends Record<string, any>>(players: T[], fields: string[]) {
    if (!players || players.length === 0) return;
    fields.forEach(field => {
        const sorted = [...players].sort((a, b) => (a[field] as number) - (b[field] as number));
        const n = sorted.length;
        sorted.forEach((player, index) => {
            (player as any)[`${field}Percentile`] = Math.round((index / (n - 1 || 1)) * 100);
        });
    });
}

export function calculateHitterValueScore(players: HitterFinal[]) {
    if (!players || players.length < 2) {
        players.forEach(p => { p.valueScore = 0; p.valueRating = 50; });
        return;
    }
    const opsDeviations = players.map(p => p.opsDeviation || 0);
    const wobaDeviations = players.map(p => p.wobaDeviation || 0);
    const opsMean = mean(opsDeviations);
    const opsStd = standardDeviation(opsDeviations) || 1;
    const wobaMean = mean(wobaDeviations);
    const wobaStd = standardDeviation(wobaDeviations) || 1;

    players.forEach(p => {
        const opsZ = ((p.opsDeviation || 0) - opsMean) / opsStd;
        const wobaZ = ((p.wobaDeviation || 0) - wobaMean) / wobaStd;
        p.valueScore = (opsZ + wobaZ) / 2;
        p.valueRating = Math.max(0, Math.min(100, Math.round(50 + (p.valueScore * 15))));
    });
}

export function calculatePitcherValueScore(pitchers: PitcherFinal[]) {
    if (!pitchers || pitchers.length < 2) {
        pitchers.forEach(p => { p.valueScore = 0; p.valueRating = 50; });
        return;
    }
    const whipDeviations = pitchers.map(p => p.whipDeviation || 0);
    const mWhipDeviations = pitchers.map(p => p.mWHIPDeviation || 0);
    const whipMean = mean(whipDeviations);
    const whipStd = standardDeviation(whipDeviations) || 1;
    const mWhipMean = mean(mWhipDeviations);
    const mWhipStd = standardDeviation(mWhipDeviations) || 1;

    pitchers.forEach(p => {
        const whipZ = -((p.whipDeviation || 0) - whipMean) / whipStd;
        const mWhipZ = -((p.mWHIPDeviation || 0) - mWhipMean) / mWhipStd;
        p.valueScore = (whipZ + mWhipZ) / 2;
        p.valueRating = Math.max(0, Math.min(100, Math.round(50 + (p.valueScore * 15))));
    });
}

export function calculatePitcherFinalStats(pitchers: PitcherState[], _weights: SimConfig['WEIGHTS']): PitcherFinal[] {
    return pitchers.map(p => {
        const bf = p.battersFaced || 1;
        const ip = p.outs / 3 || 1;
        const totalHits = p.singles + p.singlepluses + p.doubles + p.triples + p.homeruns;
        const ab = bf - p.walks;

        const kPct = p.strikeouts / bf;
        const bbPct = p.walks / bf;
        const kBbRatio = p.walks === 0 ? p.strikeouts : p.strikeouts / p.walks;
        const hr9 = (p.homeruns / ip) * 9;
        const gbPct = (bf - p.walks) === 0 ? 0 : p.groundballs / (bf - p.walks);
        const oppAvg = ab === 0 ? 0 : totalHits / ab;

        const oppSingles = totalHits - p.doubles - p.triples - p.homeruns;
        const totalBases = oppSingles + (2 * p.singlepluses) + (2 * p.doubles) + (3 * p.triples) + (4 * p.homeruns);
        const oppObp = bf === 0 ? 0 : (totalHits + p.walks) / bf;
        const oppSlg = ab === 0 ? 0 : totalBases / ab;
        const oppOps = oppObp + oppSlg;

        const kIconSlgImpact = p.iconImpact.K.tbSaved / bf;
        const twentyIconSwingRate = p.twentyUsed > 0 ? (p.iconImpact.twenty.advantageSwings / p.twentyUsed) : 0;
        const rpIconSwingRate = p.RPused > 0 ? (p.iconImpact.RP.advantageSwings / p.RPused) : 0;

        const { iconImpact: _ii, iconCounts: _ic, ranges: _rg, ...rest } = p;
        void _ii; void _ic; void _rg;

        return {
            ...rest,
            kPct, bbPct, kBbRatio, hr9, gbPct, oppAvg, oppOps,
            kIconHRsBlocked: p.iconImpact.K.hrsBlocked,
            kIconTBSaved: p.iconImpact.K.tbSaved,
            kIconSlgImpact,
            twentyIconAdvantageSwings: p.iconImpact.twenty.advantageSwings,
            twentyIconSwingRate,
            rpIconAdvantageSwings: p.iconImpact.RP.advantageSwings,
            rpIconSwingRate,
            totalIconSlgReduction: kIconSlgImpact,
        };
    });
}
