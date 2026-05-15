/**
 * Pricing regression verification script.
 *
 * Loads the live card catalog and runs all three pricing models
 * (hitters, starters, bullpen). Prints fit quality, coefficient table,
 * and the top under/overpriced cards in each category so we can
 * gut-check whether the numbers make sense.
 *
 * Run with: npx tsx scripts/verify-pricing.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RawHitter, RawPitcher } from '../src/sim/simEngine';
import {
    fitHitterPricing, fitStarterPricing, fitBullpenPricing,
    type PricingFit, type PricingRow,
} from '../src/pricing/pricingRegression';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const hitters: RawHitter[] = JSON.parse(readFileSync(resolve(REPO_ROOT, 'simulation', 'hitters.json'), 'utf8'));
const pitchers: RawPitcher[] = JSON.parse(readFileSync(resolve(REPO_ROOT, 'simulation', 'pitchers.json'), 'utf8'));

function fmt(n: number): string {
    return n.toFixed(2).padStart(8);
}

function printSection(label: string) {
    console.log('\n' + '='.repeat(80));
    console.log(label);
    console.log('='.repeat(80));
}

function printCoefs(fit: PricingFit, label: string) {
    printSection(`${label} — fit diagnostics`);
    console.log(`  rows:              ${fit.rows.length}`);
    console.log(`  R²:                ${fit.rSquared.toFixed(4)}`);
    console.log(`  MAE (raw resid):   ${fit.meanAbsResidual.toFixed(2)} pts`);

    const meanActual = fit.rows.reduce((s, r) => s + r.actualPoints, 0) / fit.rows.length;
    console.log(`  Mean actual price: ${meanActual.toFixed(1)} pts`);
    console.log(`  MAE as %:          ${(fit.meanAbsResidual / meanActual * 100).toFixed(1)}%`);

    // Count negative predictions (the fix-1 target).
    const negPredCount = fit.rows.filter(r => r.predictedPoints === 0 && r.actualPoints > 0).length;
    console.log(`  Cards w/ predicted clamped at 0 (raw was ≤ 0): ${negPredCount}`);

    // Count null overUnderPct (fix-2 guard fires).
    const nullPctCount = fit.rows.filter(r => r.overUnderPct === null).length;
    console.log(`  Cards w/ undefined over/under % (predicted = 0): ${nullPctCount}`);

    printSection(`${label} — coefficients (sorted by |value|)`);
    const sorted = fit.featureNames
        .map((name, i) => ({ name, value: fit.coefficients[i] }))
        .sort((a, b) => {
            if (a.name === '(intercept)') return -1;
            if (b.name === '(intercept)') return 1;
            return Math.abs(b.value) - Math.abs(a.value);
        });
    for (const c of sorted) {
        const arrow = c.name === '(intercept)' ? '  ' : c.value > 0 ? ' +' : c.value < 0 ? ' -' : '  ';
        console.log(`  ${arrow} ${c.name.padEnd(28)} ${fmt(c.value)}`);
    }
}

function printExtremes(fit: PricingFit, label: string, topN: number = 10) {
    // Sort by overUnderPct, treating nulls as missing.
    const valid = fit.rows.filter(r => r.overUnderPct !== null) as (PricingRow & { overUnderPct: number })[];
    const sorted = [...valid].sort((a, b) => a.overUnderPct - b.overUnderPct);

    printSection(`${label} — top ${topN} UNDERPRICED (good buys)`);
    console.log('  ' + 'Card'.padEnd(50) + 'Actual'.padStart(8) + 'Pred'.padStart(8) + 'Resid'.padStart(8) + ' Over/Under%');
    for (const r of sorted.slice(0, topN)) {
        console.log(
            '  ' + r.name.slice(0, 49).padEnd(50)
            + r.actualPoints.toString().padStart(8)
            + r.predictedPoints.toFixed(0).padStart(8)
            + r.residual.toFixed(0).padStart(8)
            + ' ' + r.overUnderPct.toFixed(1) + '%'
        );
    }

    printSection(`${label} — top ${topN} OVERPRICED (bad value)`);
    console.log('  ' + 'Card'.padEnd(50) + 'Actual'.padStart(8) + 'Pred'.padStart(8) + 'Resid'.padStart(8) + ' Over/Under%');
    for (const r of sorted.slice(-topN).reverse()) {
        console.log(
            '  ' + r.name.slice(0, 49).padEnd(50)
            + r.actualPoints.toString().padStart(8)
            + r.predictedPoints.toFixed(0).padStart(8)
            + r.residual.toFixed(0).padStart(8)
            + ' ' + r.overUnderPct.toFixed(1) + '%'
        );
    }
}

function sanityCheck(fit: PricingFit, label: string, names: string[]) {
    printSection(`${label} — sanity check on named cards`);
    for (const needle of names) {
        const match = fit.rows.find(r => r.name.toLowerCase().includes(needle.toLowerCase()));
        if (!match) {
            console.log(`  (no match for "${needle}")`);
            continue;
        }
        console.log(
            `  ${match.name.slice(0, 50).padEnd(52)}`
            + ` Actual ${String(match.actualPoints).padStart(4)}`
            + ` Pred ${match.predictedPoints.toFixed(0).padStart(4)}`
            + ` Resid ${(match.residual > 0 ? '+' : '') + match.residual.toFixed(0)}`
            + ` (${match.overUnderPct === null ? '—' : (match.overUnderPct > 0 ? '+' : '') + match.overUnderPct.toFixed(1) + '%'})`
        );
    }
}

// =============================================================================
// RUN

const hitterFit = fitHitterPricing(hitters);
const starterFit = fitStarterPricing(pitchers);
const bullpenFit = fitBullpenPricing(pitchers);

printCoefs(hitterFit, 'HITTERS');
printExtremes(hitterFit, 'HITTERS');
sanityCheck(hitterFit, 'HITTERS', ['Pujols', 'Bonds', 'Suzuki', 'Jeter']);

printCoefs(starterFit, 'STARTERS');
printExtremes(starterFit, 'STARTERS');
sanityCheck(starterFit, 'STARTERS', ['Santana', 'Halladay', 'Schilling', 'Pedro Martinez']);

printCoefs(bullpenFit, 'BULLPEN');
printExtremes(bullpenFit, 'BULLPEN');
sanityCheck(bullpenFit, 'BULLPEN', ['Rivera', 'Gagne', 'Smoltz', 'Nathan']);

printSection('Summary');
console.log(`  Hitters:  ${hitterFit.rows.length} cards, R² ${hitterFit.rSquared.toFixed(3)}, MAE ${hitterFit.meanAbsResidual.toFixed(1)} pts`);
console.log(`  Starters: ${starterFit.rows.length} cards, R² ${starterFit.rSquared.toFixed(3)}, MAE ${starterFit.meanAbsResidual.toFixed(1)} pts`);
console.log(`  Bullpen:  ${bullpenFit.rows.length} cards, R² ${bullpenFit.rSquared.toFixed(3)}, MAE ${bullpenFit.meanAbsResidual.toFixed(1)} pts`);
