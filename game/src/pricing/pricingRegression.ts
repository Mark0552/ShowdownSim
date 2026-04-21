/**
 * Hedonic pricing regression for MLB Showdown cards.
 *
 * Fits a linear model that predicts a card's point cost from its attributes
 * (OB / Control / chart coverage / icons / position / fielding), then uses the
 * residual (actual - predicted) to flag over- and under-priced cards.
 *
 * Negative residual = cheaper than the stats predict = good value.
 * Positive residual = more expensive than the stats predict = bad value.
 *
 * Matrix math is done in-place here (plain arrays) to keep the bundle small —
 * we have ~20 features x ~800 rows per model, so Gauss-Jordan on a 20x20
 * matrix is plenty fast and avoids pulling in a linear algebra library.
 */

import { parseRange } from '../sim/simEngine';
import type { RawHitter, RawPitcher } from '../sim/simEngine';

// ============================================================================
// FEATURE SPEC
// ============================================================================

const HITTER_ICON_LIST = ['V', 'HR', 'S', 'SB', 'G', 'R', 'RY'] as const;
const HITTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF-RF', 'CF', 'DH'] as const;
// Chart-width dummies: each card's 9 widths sum to 20 which would be perfectly
// collinear with the intercept. We drop W (walks) as the reference category.
const HITTER_CHART_OUTCOMES = ['SO', 'GB', 'FB', 'S', 'SPlus', 'DB', 'TR', 'HR'] as const;

const PITCHER_ICON_LIST = ['K', '20', 'RP', 'G', 'CY', 'R', 'RY'] as const;
const PITCHER_ROLES = ['Starter', 'Reliever', 'Closer'] as const;
// Same dropping trick — W is the chart-width reference for pitchers too.
const PITCHER_CHART_OUTCOMES = ['PU', 'SO', 'GB', 'FB', 'S', 'DB', 'HR'] as const;

export interface HitterFeatureSpec {
    type: 'hitter';
    names: string[];          // human-readable feature labels aligned with columns of X
}
export interface PitcherFeatureSpec {
    type: 'pitcher';
    names: string[];
}

export function hitterFeatureNames(): string[] {
    const names = ['(intercept)', 'On-Base', 'Speed', 'Fielding (max)'];
    for (const c of HITTER_CHART_OUTCOMES) names.push(`chart: ${c}`);
    for (const ic of HITTER_ICON_LIST) names.push(`icon: ${ic}`);
    // All positions except DH — DH is reference; indicators measure premium over DH
    for (const p of HITTER_POSITIONS) if (p !== 'DH') names.push(`pos: ${p}`);
    return names;
}

export function pitcherFeatureNames(): string[] {
    const names = ['(intercept)', 'Control', 'IP'];
    for (const c of PITCHER_CHART_OUTCOMES) names.push(`chart: ${c}`);
    for (const ic of PITCHER_ICON_LIST) names.push(`icon: ${ic}`);
    for (const r of PITCHER_ROLES) if (r !== 'Reliever') names.push(`role: ${r}`);
    return names;
}

/** Starter-only feature list: no role dummies since every row is a Starter. */
export function starterFeatureNames(): string[] {
    const names = ['(intercept)', 'Control', 'IP'];
    for (const c of PITCHER_CHART_OUTCOMES) names.push(`chart: ${c}`);
    for (const ic of PITCHER_ICON_LIST) names.push(`icon: ${ic}`);
    return names;
}

/** Bullpen feature list: Reliever + Closer combined, with Reliever as the
 *  reference category and Closer as the only role indicator. */
export function bullpenFeatureNames(): string[] {
    const names = ['(intercept)', 'Control', 'IP'];
    for (const c of PITCHER_CHART_OUTCOMES) names.push(`chart: ${c}`);
    for (const ic of PITCHER_ICON_LIST) names.push(`icon: ${ic}`);
    names.push('role: Closer');
    return names;
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

function rangeWidth(range: string | null | undefined): number {
    const r = parseRange(range);
    if (!r) return 0;
    return r.high - r.low + 1;
}

function iconsIncludes(icons: string | null | undefined, name: string): boolean {
    if (!icons) return false;
    return icons.split(/\s+/).filter(Boolean).includes(name);
}

/** Returns the max fielding value across a hitter's positions, or 0 if none. */
function maxFielding(position: string | null | undefined): number {
    if (!position) return 0;
    let best = 0;
    for (const part of position.split(',')) {
        const m = part.trim().match(/([+-]?\d+)/);
        if (m) {
            const v = parseInt(m[1], 10);
            if (v > best) best = v;
        }
    }
    return best;
}

/** True if the card lists this position token anywhere (including IF/OF groups). */
function hasHitterPosition(position: string | null | undefined, token: string): 0 | 1 {
    if (!position) return 0;
    const tokens = position.split(',').map(p => p.trim().split('+')[0].split('-')[0]);
    // Handle LF-RF which we stringify back together
    const pos = position.split(',').map(p => p.trim().split('+')[0]);
    if (token === 'LF-RF') return pos.includes('LF-RF') || tokens.some(t => t === 'LF' || t === 'RF') || pos.some(p => p === 'OF') ? 1 : 0;
    if (token === 'CF') return pos.includes('CF') || pos.some(p => p === 'OF') ? 1 : 0;
    if (['1B', '2B', '3B', 'SS'].includes(token)) {
        return pos.includes(token) || pos.some(p => p === 'IF') ? 1 : 0;
    }
    if (token === 'C') return pos.includes('C') ? 1 : 0;
    if (token === 'DH') return pos.length === 1 && pos[0] === 'DH' ? 1 : 0;
    return 0;
}

export function hitterFeatureRow(h: RawHitter): number[] {
    const row: number[] = [1, h.onBase || 0, h.Speed || 0, maxFielding(h.Position)];
    for (const c of HITTER_CHART_OUTCOMES) {
        row.push(rangeWidth((h as any)[c] ?? null));
    }
    for (const ic of HITTER_ICON_LIST) row.push(iconsIncludes(h.Icons, ic) ? 1 : 0);
    for (const p of HITTER_POSITIONS) if (p !== 'DH') row.push(hasHitterPosition(h.Position, p));
    return row;
}

export function pitcherFeatureRow(p: RawPitcher): number[] {
    const row: number[] = [1, p.Control || 0, p.IP || 0];
    for (const c of PITCHER_CHART_OUTCOMES) {
        row.push(rangeWidth((p as any)[c] ?? null));
    }
    for (const ic of PITCHER_ICON_LIST) row.push(iconsIncludes(p.Icons, ic) ? 1 : 0);
    // Role dummies — Reliever is the reference
    for (const r of PITCHER_ROLES) if (r !== 'Reliever') row.push(p.Position === r ? 1 : 0);
    return row;
}

export function starterFeatureRow(p: RawPitcher): number[] {
    const row: number[] = [1, p.Control || 0, p.IP || 0];
    for (const c of PITCHER_CHART_OUTCOMES) row.push(rangeWidth((p as any)[c] ?? null));
    for (const ic of PITCHER_ICON_LIST) row.push(iconsIncludes(p.Icons, ic) ? 1 : 0);
    return row;
}

export function bullpenFeatureRow(p: RawPitcher): number[] {
    const row: number[] = [1, p.Control || 0, p.IP || 0];
    for (const c of PITCHER_CHART_OUTCOMES) row.push(rangeWidth((p as any)[c] ?? null));
    for (const ic of PITCHER_ICON_LIST) row.push(iconsIncludes(p.Icons, ic) ? 1 : 0);
    row.push(p.Position === 'Closer' ? 1 : 0);
    return row;
}

// ============================================================================
// LINEAR ALGEBRA (just what we need — no external deps)
// ============================================================================

function transpose(M: number[][]): number[][] {
    const rows = M.length, cols = M[0].length;
    const T: number[][] = Array.from({ length: cols }, () => new Array(rows));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) T[j][i] = M[i][j];
    return T;
}

function matMul(A: number[][], B: number[][]): number[][] {
    const ar = A.length, ac = A[0].length, bc = B[0].length;
    const R: number[][] = Array.from({ length: ar }, () => new Array(bc).fill(0));
    for (let i = 0; i < ar; i++) {
        for (let k = 0; k < ac; k++) {
            const a = A[i][k];
            if (a === 0) continue;
            for (let j = 0; j < bc; j++) R[i][j] += a * B[k][j];
        }
    }
    return R;
}

function matVec(A: number[][], x: number[]): number[] {
    const ar = A.length, ac = A[0].length;
    const r = new Array(ar).fill(0);
    for (let i = 0; i < ar; i++) {
        let s = 0;
        for (let j = 0; j < ac; j++) s += A[i][j] * x[j];
        r[i] = s;
    }
    return r;
}

/** Gauss-Jordan elimination to invert a square matrix. Returns null if singular. */
function invert(M: number[][]): number[][] | null {
    const n = M.length;
    // Augment [M | I]
    const A: number[][] = M.map((row, i) => {
        const out = row.slice();
        for (let j = 0; j < n; j++) out.push(i === j ? 1 : 0);
        return out;
    });
    for (let col = 0; col < n; col++) {
        // Partial pivot
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        }
        if (Math.abs(A[pivot][col]) < 1e-12) return null;
        if (pivot !== col) { const tmp = A[col]; A[col] = A[pivot]; A[pivot] = tmp; }
        const div = A[col][col];
        for (let j = 0; j < 2 * n; j++) A[col][j] /= div;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const factor = A[r][col];
            if (factor === 0) continue;
            for (let j = 0; j < 2 * n; j++) A[r][j] -= factor * A[col][j];
        }
    }
    return A.map(row => row.slice(n));
}

// ============================================================================
// RIDGE REGRESSION
// ============================================================================

/**
 * Ridge regression: β = (XᵀX + λI)⁻¹ Xᵀy. The intercept (column 0) is not
 * penalized. Small λ adds numerical stability for near-collinear features
 * without materially biasing the estimates.
 */
export function fitRidge(X: number[][], y: number[], lambda: number = 0.5): number[] {
    const p = X[0].length;
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    // Add λI, but skip the intercept
    for (let i = 1; i < p; i++) XtX[i][i] += lambda;
    const inv = invert(XtX);
    if (!inv) {
        // Fall back to heavy ridge
        for (let i = 1; i < p; i++) XtX[i][i] += 10;
        const inv2 = invert(XtX);
        if (!inv2) throw new Error('Failed to invert XᵀX + λI even with heavy ridge');
        const Xty = matVec(Xt, y);
        return matVec(inv2, Xty);
    }
    const Xty = matVec(Xt, y);
    return matVec(inv, Xty);
}

// ============================================================================
// DIAGNOSTICS & PER-CARD RESULT
// ============================================================================

export interface PricingRow {
    name: string;                // display name
    team: string;
    year: string;
    edition: string;
    cardNum: number;
    imagePath: string;
    position: string;            // Position or Role
    icons: string | null;
    actualPoints: number;
    predictedPoints: number;
    residual: number;            // actual - predicted (negative = underpriced = good)
    // Residual as % of actual points. + = overpriced, − = underpriced.
    // Always well-defined because actual > 0 for every card.
    overUnderPct: number;
    onBaseOrControl: number;     // for display
    speedOrIp: number;           // for display; may be 0 if not applicable
}

export interface PricingFit {
    coefficients: number[];
    featureNames: string[];
    rows: PricingRow[];
    rSquared: number;
    meanAbsResidual: number;
}

function rSquaredOf(y: number[], yHat: number[]): number {
    const mean = y.reduce((a, b) => a + b, 0) / y.length;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < y.length; i++) {
        ssRes += (y[i] - yHat[i]) ** 2;
        ssTot += (y[i] - mean) ** 2;
    }
    return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function meanAbs(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + Math.abs(b), 0) / arr.length;
}

export function fitHitterPricing(hitters: RawHitter[], lambda: number = 0.5): PricingFit {
    const X = hitters.map(hitterFeatureRow);
    const y = hitters.map(h => h.Points || 0);
    const beta = fitRidge(X, y, lambda);
    const yHat = matVec(X, beta);
    const rows: PricingRow[] = hitters.map((h, i) => ({
        name: `${h.Name} ${h['Yr.']} ${h.Ed} ${h['#']} ${h.Team}`,
        team: h.Team,
        year: h['Yr.'],
        edition: h.Ed,
        cardNum: h['#'],
        imagePath: h.imagePath || '',
        position: h.Position,
        icons: h.Icons,
        actualPoints: y[i],
        predictedPoints: yHat[i],
        residual: y[i] - yHat[i],
        // Residual as a % of the card's actual price. + overpriced, − underpriced.
        // Using actual (always > 0) as the denominator sidesteps the negative-
        // predicted blowup the old `actual / predicted` formula suffered.
        overUnderPct: y[i] > 0 ? ((y[i] - yHat[i]) / y[i]) * 100 : 0,
        onBaseOrControl: h.onBase,
        speedOrIp: h.Speed || 0,
    }));
    return {
        coefficients: beta,
        featureNames: hitterFeatureNames(),
        rows,
        rSquared: rSquaredOf(y, yHat),
        meanAbsResidual: meanAbs(y.map((v, i) => v - yHat[i])),
    };
}

function fitPitcherSubset(
    pitchers: RawPitcher[],
    featureRow: (p: RawPitcher) => number[],
    featureNames: string[],
    lambda: number,
): PricingFit {
    const X = pitchers.map(featureRow);
    const y = pitchers.map(p => p.Points || 0);
    const beta = fitRidge(X, y, lambda);
    const yHat = matVec(X, beta);
    const rows: PricingRow[] = pitchers.map((p, i) => ({
        name: `${p.Name} ${p['Yr.']} ${p.Ed} ${p['#']} ${p.Team}`,
        team: p.Team, year: p['Yr.'], edition: p.Ed, cardNum: p['#'],
        imagePath: p.imagePath || '',
        position: p.Position, icons: p.Icons,
        actualPoints: y[i], predictedPoints: yHat[i],
        residual: y[i] - yHat[i],
        overUnderPct: y[i] > 0 ? ((y[i] - yHat[i]) / y[i]) * 100 : 0,
        onBaseOrControl: p.Control, speedOrIp: p.IP || 0,
    }));
    return {
        coefficients: beta, featureNames, rows,
        rSquared: rSquaredOf(y, yHat),
        meanAbsResidual: meanAbs(y.map((v, i) => v - yHat[i])),
    };
}

/** Fit a Starter-only pricing model. No role dummies — every row is a Starter. */
export function fitStarterPricing(pitchers: RawPitcher[], lambda: number = 0.5): PricingFit {
    const starters = pitchers.filter(p => p.Position === 'Starter');
    return fitPitcherSubset(starters, starterFeatureRow, starterFeatureNames(), lambda);
}

/** Fit a Bullpen (Reliever + Closer) pricing model with a single Closer dummy. */
export function fitBullpenPricing(pitchers: RawPitcher[], lambda: number = 0.5): PricingFit {
    const bullpen = pitchers.filter(p => p.Position === 'Reliever' || p.Position === 'Closer');
    return fitPitcherSubset(bullpen, bullpenFeatureRow, bullpenFeatureNames(), lambda);
}

export function fitPitcherPricing(pitchers: RawPitcher[], lambda: number = 0.5): PricingFit {
    const X = pitchers.map(pitcherFeatureRow);
    const y = pitchers.map(p => p.Points || 0);
    const beta = fitRidge(X, y, lambda);
    const yHat = matVec(X, beta);
    const rows: PricingRow[] = pitchers.map((p, i) => ({
        name: `${p.Name} ${p['Yr.']} ${p.Ed} ${p['#']} ${p.Team}`,
        team: p.Team,
        year: p['Yr.'],
        edition: p.Ed,
        cardNum: p['#'],
        imagePath: p.imagePath || '',
        position: p.Position,
        icons: p.Icons,
        actualPoints: y[i],
        predictedPoints: yHat[i],
        residual: y[i] - yHat[i],
        // Residual as a % of the card's actual price. + overpriced, − underpriced.
        overUnderPct: y[i] > 0 ? ((y[i] - yHat[i]) / y[i]) * 100 : 0,
        onBaseOrControl: p.Control,
        speedOrIp: p.IP || 0,
    }));
    return {
        coefficients: beta,
        featureNames: pitcherFeatureNames(),
        rows,
        rSquared: rSquaredOf(y, yHat),
        meanAbsResidual: meanAbs(y.map((v, i) => v - yHat[i])),
    };
}
