/**
 * MLB Showdown Simulator
 *
 * Monte Carlo simulation of MLB Showdown card game matchups.
 * Pits every hitter against every pitcher for N at-bats each,
 * then exports stats with regression analysis and value ratings.
 *
 * Usage:
 *   node sim.js [options]
 *
 * Options:
 *   --at-bats <n>     At-bats per matchup (default: 500)
 *   --seed <string>   RNG seed for reproducible results (default: random)
 *   --output <file>   Output filename (default: 'results.html')
 *   --format <type>   Output format: 'html' or 'xlsx' (default: based on extension)
 *   --help            Show this help message
 */

const fs = require('fs');
const ss = require('simple-statistics');
const seedrandom = require('seedrandom');
const defaultConfig = require('./config');

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(argv) {
    const args = argv.slice(2);
    const config = { ...defaultConfig };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--at-bats':
                config.AT_BATS_PER_MATCHUP = parseInt(args[++i], 10);
                if (isNaN(config.AT_BATS_PER_MATCHUP) || config.AT_BATS_PER_MATCHUP < 1) {
                    console.error('Error: --at-bats must be a positive integer');
                    process.exit(1);
                }
                break;
            case '--seed':
                config.SEED = args[++i];
                break;
            case '--output':
                config.OUTPUT = args[++i];
                break;
            case '--format':
                config.FORMAT = args[++i];
                if (!['html', 'xlsx'].includes(config.FORMAT)) {
                    console.error('Error: --format must be "html" or "xlsx"');
                    process.exit(1);
                }
                break;
            case '--help':
                console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[0]);
                process.exit(0);
                break;
            default:
                console.error(`Unknown option: ${args[i]}. Use --help for usage.`);
                process.exit(1);
        }
    }

    // Infer format from output extension if not explicitly set
    if (!args.includes('--format') && config.OUTPUT.endsWith('.xlsx')) {
        config.FORMAT = 'xlsx';
    }

    return config;
}

// ============================================================================
// OUTCOME CONSTANTS
// ============================================================================

const OUTCOME = {
    STRIKEOUT: 'strikeout',
    GROUNDBALL: 'groundball',
    FLYBALL: 'flyball',
    POPUP: 'popup',
    WALK: 'walk',
    SINGLE: 'single',
    SINGLEPLUS: 'singleplus',
    DOUBLE: 'double',
    TRIPLE: 'triple',
    HOMERUN: 'homeRun'
};

const HITTER_CHART_FIELDS = [
    { field: 'SO', outcome: OUTCOME.STRIKEOUT },
    { field: 'GB', outcome: OUTCOME.GROUNDBALL },
    { field: 'FB', outcome: OUTCOME.FLYBALL },
    { field: 'W', outcome: OUTCOME.WALK },
    { field: 'S', outcome: OUTCOME.SINGLE },
    { field: 'SPlus', outcome: OUTCOME.SINGLEPLUS },
    { field: 'DB', outcome: OUTCOME.DOUBLE },
    { field: 'TR', outcome: OUTCOME.TRIPLE }
];

const PITCHER_CHART_FIELDS = [
    { field: 'PU', outcome: OUTCOME.POPUP },
    { field: 'SO', outcome: OUTCOME.STRIKEOUT },
    { field: 'GB', outcome: OUTCOME.GROUNDBALL },
    { field: 'FB', outcome: OUTCOME.FLYBALL },
    { field: 'W', outcome: OUTCOME.WALK },
    { field: 'S', outcome: OUTCOME.SINGLE },
    { field: 'DB', outcome: OUTCOME.DOUBLE }
];

const OUT_OUTCOMES = [OUTCOME.STRIKEOUT, OUTCOME.GROUNDBALL, OUTCOME.FLYBALL, OUTCOME.POPUP];

// ============================================================================
// UTILITIES
// ============================================================================

function parseRange(range) {
    if (!range) return null;
    if (range.includes('-')) {
        const [low, high] = range.split('-').map(Number);
        // Handle bad data like "3-0" or "1-0" where high < low — treat as single number
        if (high < low) return { low, high: low };
        return { low, high };
    }
    if (range.includes('+')) {
        return { low: parseInt(range.split('+')[0]), high: 20 };
    }
    const num = Number(range);
    return { low: num, high: num };
}

function rollInRange(roll, range) {
    return range && roll >= range.low && roll <= range.high;
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const REQUIRED_HITTER_FIELDS = ['Name', 'Team', 'Points', 'onBase', 'Speed', 'Position'];
const REQUIRED_PITCHER_FIELDS = ['Name', 'Team', 'Points', 'Control', 'Position'];
const RANGE_FIELDS_HITTER = ['SO', 'GB', 'FB', 'W', 'S', 'SPlus', 'DB', 'TR', 'HR'];
const RANGE_FIELDS_PITCHER = ['PU', 'SO', 'GB', 'FB', 'W', 'S', 'DB', 'HR'];

function validatePlayer(player, requiredFields, rangeFields, type, index) {
    const errors = [];
    const name = player.Name || `${type} #${index}`;

    for (const field of requiredFields) {
        if (player[field] === undefined || player[field] === null) {
            errors.push(`${name}: missing required field "${field}"`);
        }
    }

    for (const field of rangeFields) {
        if (player[field]) {
            const parsed = parseRange(player[field]);
            if (!parsed || isNaN(parsed.low) || isNaN(parsed.high)) {
                errors.push(`${name}: invalid range "${player[field]}" for field "${field}"`);
            }
        }
    }

    const hasChart = rangeFields.some(f => player[f]);
    if (!hasChart) {
        errors.push(`${name}: no chart fields found (needs at least one of: ${rangeFields.join(', ')})`);
    }

    return errors;
}

function validateData(hitters, pitchers) {
    const errors = [];

    hitters.forEach((h, i) => {
        errors.push(...validatePlayer(h, REQUIRED_HITTER_FIELDS, RANGE_FIELDS_HITTER, 'Hitter', i));
    });

    pitchers.forEach((p, i) => {
        errors.push(...validatePlayer(p, REQUIRED_PITCHER_FIELDS, RANGE_FIELDS_PITCHER, 'Pitcher', i));
    });

    [...hitters, ...pitchers].forEach(player => {
        const name = player.Name || 'Unknown';
        const fields = player.Control !== undefined ? RANGE_FIELDS_PITCHER : RANGE_FIELDS_HITTER;
        const covered = new Set();

        for (const field of fields) {
            if (!player[field]) continue;
            const range = parseRange(player[field]);
            if (!range) continue;

            for (let r = range.low; r <= range.high; r++) {
                if (covered.has(r)) {
                    errors.push(`${name}: overlapping range at roll ${r} in field "${field}"`);
                    break;
                }
                covered.add(r);
            }
        }
    });

    if (errors.length > 0) {
        console.warn(`\nValidation warnings (${errors.length}):`);
        errors.forEach(e => console.warn(`  - ${e}`));
        console.warn('');
    }

    return errors;
}

// ============================================================================
// DATA PREPROCESSING
// ============================================================================

function precomputeRanges(players, fields) {
    players.forEach(player => {
        player.ranges = {};
        fields.forEach(f => {
            player.ranges[f] = parseRange(player[f]);
        });
        if (player.HR) {
            player.ranges.HR = parseRange(player.HR);
        }
    });
}

function initializePitcher(pitcher) {
    return {
        ...pitcher,
        name: `${pitcher.Name} ${pitcher["Yr."]} ${pitcher.Ed} ${pitcher["#"]} ${pitcher.Team}`,
        points: pitcher.Points,
        hand: pitcher.H,
        team: pitcher.Team,
        edition: pitcher.Ed,
        chart: {
            PU: pitcher.PU || '-',
            SO: pitcher.SO || '-',
            GB: pitcher.GB || '-',
            FB: pitcher.FB || '-',
            W: pitcher.W || '-',
            S: pitcher.S || '-',
            DB: pitcher.DB || '-',
            HR: pitcher.HR || '-'
        },
        battersFaced: 0,
        outs: 0,
        strikeouts: 0,
        popups: 0,
        groundballs: 0,
        flyballs: 0,
        walks: 0,
        singles: 0,
        singlepluses: 0,
        doubles: 0,
        triples: 0,
        homeruns: 0,
        kused: 0,
        twentyUsed: 0,
        RPused: 0,
        iconCounts: { '20': 0, 'K': 0, 'RP': 0 },
        hasRP: pitcher.Icons?.includes('RP') || false,
        has20: pitcher.Icons?.includes('20') || false,
        hasK: pitcher.Icons?.includes('K') || false,
        iconImpact: {
            K: { hrsBlocked: 0, tbSaved: 0 },
            twenty: { advantageSwings: 0 },
            RP: { advantageSwings: 0 }
        }
    };
}

function createHitterStats(hitter) {
    const icons = hitter.Icons ? hitter.Icons.split(' ') : [];
    return {
        name: `${hitter.Name} ${hitter["Yr."]} ${hitter.Ed} ${hitter["#"]} ${hitter.Team}`,
        points: hitter.Points,
        icons: hitter.Icons,
        onBase: hitter.onBase,
        Speed: hitter.Speed,
        Position: hitter.Position,
        hand: hitter.H,
        team: hitter.Team,
        edition: hitter.Ed,
        chart: {
            SO: hitter.SO || '-',
            GB: hitter.GB || '-',
            FB: hitter.FB || '-',
            W: hitter.W || '-',
            S: hitter.S || '-',
            SPlus: hitter.SPlus || '-',
            DB: hitter.DB || '-',
            TR: hitter.TR || '-',
            HR: hitter.HR || '-'
        },
        hits: 0,
        singleplus: 0,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        walks: 0,
        strikeouts: 0,
        popups: 0,
        flyballs: 0,
        groundballs: 0,
        atBats: 0,
        gameAbCount: 0,
        gameVuses: 0,
        gameSused: false,
        gameHRused: false,
        Vused: 0,
        Sused: 0,
        HRused: 0,
        iconImpact: {
            V: { outsAvoided: 0, hitsGained: 0, extrasGained: 0 },
            S: { doublesFromSingles: 0, tbGained: 0 },
            HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 }
        },
        iconList: icons,
        hasV: icons.includes('V'),
        hasS: icons.includes('S'),
        hasHR: icons.includes('HR')
    };
}

// ============================================================================
// SIMULATION CORE
// ============================================================================

function determineOutcome(player, roll, isHitter) {
    const fields = isHitter ? HITTER_CHART_FIELDS : PITCHER_CHART_FIELDS;

    for (const { field, outcome } of fields) {
        if (rollInRange(roll, player.ranges[field])) {
            return outcome;
        }
    }

    if (player.ranges.HR && roll >= player.ranges.HR.low) {
        return OUTCOME.HOMERUN;
    }

    console.warn(`Warning: roll ${roll} did not match any chart range for ${player.Name || 'unknown'}, defaulting to flyball`);
    return OUTCOME.FLYBALL;
}

function applyHitterIcons(outcome, stats, usingHitterChart) {
    if (stats.hasV && stats.gameVuses < 2 && usingHitterChart && OUT_OUTCOMES.includes(outcome)) {
        stats.gameVuses++;
        stats.Vused++;
        stats.iconImpact.V.outsAvoided++;
        return null;
    }

    if (stats.hasHR && !stats.gameHRused && (outcome === OUTCOME.DOUBLE || outcome === OUTCOME.TRIPLE)) {
        stats.gameHRused = true;
        stats.HRused++;
        if (outcome === OUTCOME.DOUBLE) {
            stats.iconImpact.HR.hrsFromDoubles++;
            stats.iconImpact.HR.tbGained += 2;
        } else {
            stats.iconImpact.HR.hrsFromTriples++;
            stats.iconImpact.HR.tbGained += 1;
        }
        return OUTCOME.HOMERUN;
    }

    if (stats.hasS && !stats.gameSused && (outcome === OUTCOME.SINGLE || outcome === OUTCOME.SINGLEPLUS)) {
        stats.gameSused = true;
        stats.Sused++;
        stats.iconImpact.S.doublesFromSingles++;
        stats.iconImpact.S.tbGained += 1;
        return OUTCOME.DOUBLE;
    }

    return outcome;
}

function simulateAtBat(hitter, pitcher, stats, rollDie) {
    stats.gameAbCount++;
    if (stats.gameAbCount > 5) {
        stats.gameAbCount = 1;
        stats.gameVuses = 0;
        stats.gameSused = false;
        stats.gameHRused = false;
    }

    const baseRoll = rollDie() + pitcher.Control;
    let pitcherRoll = baseRoll;
    const hitterRoll = rollDie();

    const wouldUsePitcherChartWithoutIcons = baseRoll > hitter.onBase;

    const outsInCurrentGame = pitcher.outs % 27;
    if (pitcher.hasRP && outsInCurrentGame < 3) {
        pitcherRoll += 3;
        if (pitcher.iconCounts['RP'] === 0) {
            pitcher.RPused++;
            pitcher.iconCounts['RP'] = 1;
        }
        if (!wouldUsePitcherChartWithoutIcons && pitcherRoll > hitter.onBase) {
            pitcher.iconImpact.RP.advantageSwings++;
        }
    }

    if (pitcher.has20 && pitcher.iconCounts['20'] < 1) {
        const rollBefore20 = pitcherRoll;
        pitcherRoll += 3;
        pitcher.iconCounts['20']++;
        pitcher.twentyUsed++;
        if (rollBefore20 <= hitter.onBase && pitcherRoll > hitter.onBase) {
            pitcher.iconImpact.twenty.advantageSwings++;
        }
    }

    const usePitcherChart = pitcherRoll > hitter.onBase;
    const usingHitterChart = !usePitcherChart;
    let outcome;

    do {
        outcome = usePitcherChart
            ? determineOutcome(pitcher, hitterRoll, false)
            : determineOutcome(hitter, hitterRoll, true);
        outcome = applyHitterIcons(outcome, stats, usingHitterChart);
    } while (outcome === null);

    if (outcome === OUTCOME.HOMERUN && pitcher.hasK && pitcher.iconCounts['K'] < 1) {
        outcome = OUTCOME.STRIKEOUT;
        pitcher.kused++;
        pitcher.iconCounts['K']++;
        pitcher.iconImpact.K.hrsBlocked++;
        pitcher.iconImpact.K.tbSaved += 4;
    }

    if (pitcher.outs > 0 && pitcher.outs % 27 === 0) {
        pitcher.iconCounts['K'] = 0;
        pitcher.iconCounts['RP'] = 0;
    }
    if (pitcher.outs > 0 && pitcher.outs % 3 === 0) {
        pitcher.iconCounts['20'] = 0;
    }

    return outcome;
}

// ============================================================================
// STATS TRACKING
// ============================================================================

const STAT_UPDATES = {
    [OUTCOME.SINGLE]: s => { s.hits++; },
    [OUTCOME.SINGLEPLUS]: s => { s.hits++; s.singleplus++; },
    [OUTCOME.DOUBLE]: s => { s.hits++; s.doubles++; },
    [OUTCOME.TRIPLE]: s => { s.hits++; s.triples++; },
    [OUTCOME.HOMERUN]: s => { s.hits++; s.homeRuns++; },
    [OUTCOME.WALK]: s => { s.walks++; },
    [OUTCOME.STRIKEOUT]: s => { s.strikeouts++; },
    [OUTCOME.POPUP]: s => { s.popups++; },
    [OUTCOME.FLYBALL]: s => { s.flyballs++; },
    [OUTCOME.GROUNDBALL]: s => { s.groundballs++; }
};

const PITCHER_STAT_UPDATES = {
    [OUTCOME.STRIKEOUT]: p => { p.strikeouts++; p.outs++; },
    [OUTCOME.POPUP]: p => { p.popups++; p.outs++; },
    [OUTCOME.FLYBALL]: p => { p.flyballs++; p.outs++; },
    [OUTCOME.GROUNDBALL]: p => { p.groundballs++; p.outs++; },
    [OUTCOME.WALK]: p => { p.walks++; },
    [OUTCOME.SINGLE]: p => { p.singles++; },
    [OUTCOME.SINGLEPLUS]: p => { p.singlepluses++; },
    [OUTCOME.DOUBLE]: p => { p.doubles++; },
    [OUTCOME.TRIPLE]: p => { p.triples++; },
    [OUTCOME.HOMERUN]: p => { p.homeruns++; }
};

function updateHitterStats(stats, outcome) {
    stats.atBats++;
    STAT_UPDATES[outcome]?.(stats);
    return stats;
}

function updatePitcherStats(pitcher, outcome, weights) {
    pitcher.battersFaced++;
    PITCHER_STAT_UPDATES[outcome]?.(pitcher);

    if (pitcher.outs > 0 && pitcher.outs % 3 === 0) {
        const ip = pitcher.outs / 3;
        const hits = pitcher.singles + pitcher.singlepluses + pitcher.doubles + pitcher.triples + pitcher.homeruns;
        pitcher.whip = (pitcher.walks + hits) / ip;

        const w = weights;
        pitcher.mWHIP = (
            pitcher.walks * w.walk +
            pitcher.singles * w.single +
            pitcher.singlepluses * w.singlePlus +
            pitcher.doubles * w.double +
            pitcher.triples * w.triple +
            pitcher.homeruns * w.hr
        ) / ip;
    }
}

function calculateFinalStats(stats, weights) {
    const pa = stats.atBats; // plate appearances
    const ab = pa - stats.walks; // at-bats (excluding walks)
    const singles = stats.hits - stats.doubles - stats.triples - stats.homeRuns - stats.singleplus;
    const totalBases = singles + (2 * stats.singleplus) + (2 * stats.doubles) + (3 * stats.triples) + (4 * stats.homeRuns);
    const totalOuts = stats.strikeouts + stats.popups + stats.flyballs + stats.groundballs;

    const battingAverage = ab === 0 ? 0 : stats.hits / ab;
    const onBasePercentage = pa === 0 ? 0 : (stats.hits + stats.walks) / pa;
    const sluggingPercentage = ab === 0 ? 0 : totalBases / ab;
    const iso = sluggingPercentage - battingAverage;

    // K%, BB%, HR%
    const kPct = pa === 0 ? 0 : stats.strikeouts / pa;
    const bbPct = pa === 0 ? 0 : stats.walks / pa;
    const hrPct = ab === 0 ? 0 : stats.homeRuns / ab;

    // BABIP = (H - HR) / (AB - K - HR + SF) — no SF in showdown, so (AB - K - HR)
    const babipDenom = ab - stats.strikeouts - stats.homeRuns;
    const babip = babipDenom <= 0 ? 0 : (stats.hits - stats.homeRuns) / babipDenom;

    // GB/FB ratio
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
    const hrWobaImpact = pa > 0 ? ((iconImpact.HR.hrsFromDoubles * (w.hr - w.double)) + (iconImpact.HR.hrsFromTriples * (w.hr - w.triple))) / pa : 0;
    const totalIconWobaImpact = vWobaImpact + sWobaImpact + hrWobaImpact;

    const { iconList, hasV, hasS, hasHR, iconImpact: _, gameAbCount, gameVuses, gameSused, gameHRused, ...exportStats } = stats;
    return {
        ...exportStats,
        singles,
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        iso,
        ops: onBasePercentage + sluggingPercentage,
        woba,
        kPct,
        bbPct,
        hrPct,
        babip,
        gbFbRatio,
        vIconOutsAvoided: iconImpact.V.outsAvoided,
        vIconObpImpact: vObpImpact,
        sIconUpgrades: iconImpact.S.doublesFromSingles,
        sIconSlgImpact: sSlgImpact,
        hrIconUpgrades: iconImpact.HR.hrsFromDoubles + iconImpact.HR.hrsFromTriples,
        hrIconSlgImpact: hrSlgImpact,
        totalIconSlgImpact,
        totalIconWobaImpact
    };
}

// ============================================================================
// REGRESSION, PERCENTILES & VALUE
// ============================================================================

function calculateRegressions(players, xField, yFields) {
    if (!players || players.length < 2) {
        players.forEach(p => yFields.forEach(f => p[f.deviation] = 0));
        return;
    }

    yFields.forEach(({ value, deviation }) => {
        const data = players.map(p => [p[xField], p[value]]);
        const model = ss.linearRegression(data);
        players.forEach(p => {
            const expected = model.m * p[xField] + model.b;
            p[deviation] = p[value] - expected;
        });
    });
}

function calculatePercentiles(players, fields) {
    if (!players || players.length === 0) return;

    fields.forEach(field => {
        const sorted = [...players].sort((a, b) => a[field] - b[field]);
        const n = sorted.length;
        sorted.forEach((player, index) => {
            player[`${field}Percentile`] = Math.round((index / (n - 1 || 1)) * 100);
        });
    });
}

function calculateValueScore(players) {
    if (!players || players.length < 2) {
        players.forEach(p => p.valueScore = 0);
        return;
    }

    const opsDeviations = players.map(p => p.opsDeviation || 0);
    const wobaDeviations = players.map(p => p.wobaDeviation || 0);

    const opsMean = ss.mean(opsDeviations);
    const opsStd = ss.standardDeviation(opsDeviations) || 1;
    const wobaMean = ss.mean(wobaDeviations);
    const wobaStd = ss.standardDeviation(wobaDeviations) || 1;

    players.forEach(p => {
        const opsZ = ((p.opsDeviation || 0) - opsMean) / opsStd;
        const wobaZ = ((p.wobaDeviation || 0) - wobaMean) / wobaStd;
        p.valueScore = (opsZ + wobaZ) / 2;
        p.valueRating = Math.round(50 + (p.valueScore * 15));
        p.valueRating = Math.max(0, Math.min(100, p.valueRating));
    });
}

function calculatePitcherValueScore(pitchers) {
    if (!pitchers || pitchers.length < 2) {
        pitchers.forEach(p => p.valueScore = 0);
        return;
    }

    const whipDeviations = pitchers.map(p => p.whipDeviation || 0);
    const mWhipDeviations = pitchers.map(p => p.mWHIPDeviation || 0);

    const whipMean = ss.mean(whipDeviations);
    const whipStd = ss.standardDeviation(whipDeviations) || 1;
    const mWhipMean = ss.mean(mWhipDeviations);
    const mWhipStd = ss.standardDeviation(mWhipDeviations) || 1;

    pitchers.forEach(p => {
        const whipZ = -((p.whipDeviation || 0) - whipMean) / whipStd;
        const mWhipZ = -((p.mWHIPDeviation || 0) - mWhipMean) / mWhipStd;
        p.valueScore = (whipZ + mWhipZ) / 2;
        p.valueRating = Math.round(50 + (p.valueScore * 15));
        p.valueRating = Math.max(0, Math.min(100, p.valueRating));
    });
}

function calculatePitcherFinalStats(pitchers, weights) {
    pitchers.forEach(p => {
        const bf = p.battersFaced || 1;
        const ip = p.outs / 3 || 1;
        const totalHits = p.singles + p.singlepluses + p.doubles + p.triples + p.homeruns;
        const ab = bf - p.walks; // at-bats against (exclude walks)

        // Rate stats
        p.kPct = p.strikeouts / bf;
        p.bbPct = p.walks / bf;
        p.kBbRatio = p.walks === 0 ? p.strikeouts : p.strikeouts / p.walks;
        p.hr9 = (p.homeruns / ip) * 9;
        p.gbPct = (bf - p.walks) === 0 ? 0 : p.groundballs / (bf - p.walks);
        p.oppAvg = ab === 0 ? 0 : totalHits / ab;

        // Opponent OPS
        const oppSingles = totalHits - p.doubles - p.triples - p.homeruns;
        const totalBases = oppSingles + (2 * p.singlepluses) + (2 * p.doubles) + (3 * p.triples) + (4 * p.homeruns);
        const oppObp = bf === 0 ? 0 : (totalHits + p.walks) / bf;
        const oppSlg = ab === 0 ? 0 : totalBases / ab;
        p.oppOps = oppObp + oppSlg;

        // Icon impact
        if (p.iconImpact) {
            p.kIconHRsBlocked = p.iconImpact.K.hrsBlocked;
            p.kIconTBSaved = p.iconImpact.K.tbSaved;
            p.kIconSlgImpact = p.iconImpact.K.tbSaved / bf;

            p.twentyIconAdvantageSwings = p.iconImpact.twenty.advantageSwings;
            p.twentyIconSwingRate = p.twentyUsed > 0
                ? (p.iconImpact.twenty.advantageSwings / p.twentyUsed)
                : 0;

            p.rpIconAdvantageSwings = p.iconImpact.RP.advantageSwings;
            p.rpIconSwingRate = p.RPused > 0
                ? (p.iconImpact.RP.advantageSwings / p.RPused)
                : 0;

            p.totalIconSlgReduction = p.kIconSlgImpact;
        }

        delete p.iconImpact;
        delete p.iconCounts;
        delete p.ranges;
    });
}

// ============================================================================
// HTML EXPORT
// ============================================================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateTooltipHtml(row, isHitter) {
    const chart = row.chart;
    if (!chart) return '';

    if (isHitter) {
        const pos = escapeHtml(row.Position || '-');
        const spd = row.Speed || '-';
        const hand = escapeHtml(row.hand || '-');
        const team = escapeHtml(row.team || '-');
        const edition = escapeHtml(row.edition || '-');
        const icons = escapeHtml(row.icons || 'None');
        return `<div class='tt-section'><b>${escapeHtml(row.name)}</b></div>`
            + `<div class='tt-section'><span class='tt-label'>Team:</span> ${team} | <span class='tt-label'>Ed:</span> ${edition} | <span class='tt-label'>Hand:</span> ${hand}</div>`
            + `<div class='tt-section'><span class='tt-label'>Position:</span> ${pos} | <span class='tt-label'>Speed:</span> ${spd} | <span class='tt-label'>OB:</span> ${row.onBase}</div>`
            + `<div class='tt-section'><span class='tt-label'>Icons:</span> ${icons}</div>`
            + `<div class='tt-divider'></div>`
            + `<div class='tt-section tt-chart'>`
            + `<span class='tt-label'>SO:</span> ${chart.SO} | <span class='tt-label'>GB:</span> ${chart.GB} | <span class='tt-label'>FB:</span> ${chart.FB} | <span class='tt-label'>W:</span> ${chart.W}<br>`
            + `<span class='tt-label'>S:</span> ${chart.S} | <span class='tt-label'>S+:</span> ${chart.SPlus} | <span class='tt-label'>DB:</span> ${chart.DB} | <span class='tt-label'>TR:</span> ${chart.TR} | <span class='tt-label'>HR:</span> ${chart.HR}`
            + `</div>`
            + (row.Vused || row.Sused || row.HRused ? `<div class='tt-divider'></div><div class='tt-section'>`
                + (row.Vused ? `<span class='tt-label'>V:</span> ${row.vIconOutsAvoided} outs avoided, +${(row.vIconObpImpact || 0).toFixed(3)} OBP est.<br>` : '')
                + (row.Sused ? `<span class='tt-label'>S:</span> ${row.sIconUpgrades} upgrades, +${(row.sIconSlgImpact || 0).toFixed(3)} SLG<br>` : '')
                + (row.HRused ? `<span class='tt-label'>HR:</span> ${row.hrIconUpgrades} upgrades, +${(row.hrIconSlgImpact || 0).toFixed(3)} SLG` : '')
                + `</div>` : '');
    } else {
        const role = escapeHtml(row.Position || '-');
        const ip = row.IP || '-';
        const hand = escapeHtml(row.hand || '-');
        const team = escapeHtml(row.team || '-');
        const edition = escapeHtml(row.edition || '-');
        const icons = escapeHtml(row.Icons || 'None');
        return `<div class='tt-section'><b>${escapeHtml(row.name)}</b></div>`
            + `<div class='tt-section'><span class='tt-label'>Team:</span> ${team} | <span class='tt-label'>Ed:</span> ${edition} | <span class='tt-label'>Hand:</span> ${hand}</div>`
            + `<div class='tt-section'><span class='tt-label'>Role:</span> ${role} | <span class='tt-label'>IP:</span> ${ip} | <span class='tt-label'>Control:</span> ${row.Control}</div>`
            + `<div class='tt-section'><span class='tt-label'>Icons:</span> ${icons}</div>`
            + `<div class='tt-divider'></div>`
            + `<div class='tt-section tt-chart'>`
            + `<span class='tt-label'>PU:</span> ${chart.PU} | <span class='tt-label'>SO:</span> ${chart.SO} | <span class='tt-label'>GB:</span> ${chart.GB} | <span class='tt-label'>FB:</span> ${chart.FB}<br>`
            + `<span class='tt-label'>W:</span> ${chart.W} | <span class='tt-label'>S:</span> ${chart.S} | <span class='tt-label'>DB:</span> ${chart.DB} | <span class='tt-label'>HR:</span> ${chart.HR}`
            + `</div>`
            + (row.kIconHRsBlocked || row.twentyIconAdvantageSwings || row.rpIconAdvantageSwings ? `<div class='tt-divider'></div><div class='tt-section'>`
                + (row.kIconHRsBlocked ? `<span class='tt-label'>K:</span> ${row.kIconHRsBlocked} HRs blocked, -${(row.kIconSlgImpact || 0).toFixed(3)} SLG<br>` : '')
                + (row.twentyIconAdvantageSwings ? `<span class='tt-label'>20:</span> ${row.twentyIconAdvantageSwings} advantage swings<br>` : '')
                + (row.rpIconAdvantageSwings ? `<span class='tt-label'>RP:</span> ${row.rpIconAdvantageSwings} advantage swings` : '')
                + `</div>` : '');
    }
}

function generateHtmlTable(data, columns, isHitter = true) {
    if (!data || data.length === 0) return '<p>No data</p>';

    const headers = columns.map((col, i) => {
        const title = col.desc ? ` title="${escapeHtml(col.desc)}"` : '';
        return `<th onclick="sortTable(this)" data-col="${i}"${title}>${col.label}</th>`;
    }).join('');

    // Filter row: text input for string columns, min/max for numeric
    const filters = columns.map((col, i) => {
        if (col.filter === 'text' || col.key === 'name' || col.key === 'icons' || col.key === 'Icons'
            || col.key === 'Position' || col.key === 'hand' || col.key === 'edition') {
            return `<th class="filter-cell"><input type="text" class="filter-input" data-col="${i}" data-type="text" placeholder="filter..." oninput="applyFilters(this)"></th>`;
        }
        return `<th class="filter-cell"><div class="filter-range">`
            + `<input type="number" class="filter-input filter-min" data-col="${i}" data-type="min" placeholder="min" oninput="applyFilters(this)" step="any">`
            + `<input type="number" class="filter-input filter-max" data-col="${i}" data-type="max" placeholder="max" oninput="applyFilters(this)" step="any">`
            + `</div></th>`;
    }).join('');

    const rows = data.map(row => {
        const tooltipHtml = (row.chart) ? generateTooltipHtml(row, isHitter) : '';
        const cells = columns.map(col => {
            let val = row[col.key];
            if (val === undefined || val === null) val = '';
            if (typeof val === 'number') {
                val = col.decimals !== undefined ? val.toFixed(col.decimals) : val;
            }
            let cls = '';
            if (col.colorCode && typeof row[col.key] === 'number') {
                const v = row[col.key];
                if (col.colorCode === 'positive-good') {
                    if (v > 0.02) cls = ' val-good';
                    else if (v < -0.02) cls = ' val-bad';
                } else if (col.colorCode === 'negative-good') {
                    if (v < -0.02) cls = ' val-good';
                    else if (v > 0.02) cls = ' val-bad';
                }
            }
            if (col.key === 'name') {
                return `<td class="name-cell${cls}" data-tooltip-html="${escapeHtml(tooltipHtml)}">${val}</td>`;
            }
            return `<td class="${cls}">${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `<table><thead><tr>${headers}</tr><tr class="filter-row">${filters}</tr></thead><tbody>${rows}</tbody></table>`;
}

function exportToHtml(hittersData, pitchersData, filename, config) {
    const positions = ["C", "1B", "2B", "3B", "SS", "LF-RF", "CF", "DH", "All Hitters"];
    const playersByPosition = Object.fromEntries(positions.map(p => [p, []]));

    Object.values(hittersData).forEach(player => {
        if (!player.Position) {
            playersByPosition["All Hitters"].push(player);
            return;
        }
        const positionList = player.Position.split(',').map(p => p.trim().split('+')[0]);
        positionList.forEach(pos => {
            if (positions.includes(pos)) playersByPosition[pos].push(player);
            if (pos === "IF") ["1B", "2B", "3B", "SS"].forEach(p => playersByPosition[p].push(player));
            if (pos === "OF") ["LF-RF", "CF"].forEach(p => playersByPosition[p].push(player));
        });
        playersByPosition["All Hitters"].push(player);
    });

    const hitterColumns = [
        { key: 'valueRating', label: 'Value', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of OPS and wOBA deviation from regression, scaled to 0-100 centered at 50. Higher = better value for the card\'s point cost.' },
        { key: 'name', label: 'Name', desc: 'Player name, year, edition, card number, team. Hover for full card details.' },
        { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost for team building. Higher points = stronger card.' },
        { key: 'onBase', label: 'OB', decimals: 0, desc: 'On-Base number. Pitcher must roll d20 + Control > this to use pitcher\'s chart. Higher = better hitter.' },
        { key: 'Speed', label: 'Spd', decimals: 0, desc: 'Speed rating. Used for stolen bases and fielding in the physical game.' },
        { key: 'Position', label: 'Pos', desc: 'Fielding position(s). +N is the fielding bonus.' },
        { key: 'hand', label: 'Hand', desc: 'Batting hand. L = Left, R = Right, S = Switch.' },
        { key: 'icons', label: 'Icons', desc: 'Special ability icons. V = Vision (reroll outs), S = Speed (upgrade 1B to 2B), HR = Power (upgrade 2B/3B to HR), SB = Stolen Base, R = Running.' },
        { key: 'battingAverage', label: 'AVG', decimals: 3, desc: 'Batting Average = H / AB. Measures how often the hitter gets a hit per at-bat (excludes walks).' },
        { key: 'onBasePercentage', label: 'OBP', decimals: 3, desc: 'On-Base Percentage = (H + BB) / PA. Fraction of plate appearances reaching base.' },
        { key: 'sluggingPercentage', label: 'SLG', decimals: 3, desc: 'Slugging Percentage = Total Bases / AB. Where TB = 1B + 2\u00d71B+ + 2\u00d72B + 3\u00d73B + 4\u00d7HR. Measures power.' },
        { key: 'ops', label: 'OPS', decimals: 3, desc: 'On-base Plus Slugging = OBP + SLG. Combined measure of reaching base and hitting for power.' },
        { key: 'woba', label: 'wOBA', decimals: 3, desc: 'Weighted On-Base Average = (0.69\u00d7BB + 0.88\u00d71B + 1.08\u00d71B+ + 1.24\u00d72B + 1.56\u00d73B + 1.95\u00d7HR) / PA. Weights each outcome by its run value.' },
        { key: 'iso', label: 'ISO', decimals: 3, desc: 'Isolated Power = SLG - AVG. Measures raw extra-base power independent of batting average.' },
        { key: 'babip', label: 'BABIP', decimals: 3, desc: 'Batting Average on Balls In Play = (H - HR) / (AB - SO - HR). Shows hit rate on non-HR contact.' },
        { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout Rate = SO / PA. Fraction of plate appearances ending in a strikeout.' },
        { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk Rate = BB / PA. Fraction of plate appearances ending in a walk.' },
        { key: 'hrPct', label: 'HR%', decimals: 3, desc: 'Home Run Rate = HR / AB. Fraction of at-bats resulting in a home run.' },
        { key: 'gbFbRatio', label: 'GB/FB', decimals: 2, desc: 'Ground Ball to Fly Ball Ratio = GB / FB. Higher = more ground balls, lower = more fly balls.' },
        { key: 'opsPercentile', label: 'OPS%', decimals: 0, desc: 'OPS Percentile (0-100) within this position group. 90 = better OPS than 90% of players at this position.' },
        { key: 'wobaPercentile', label: 'wOBA%', decimals: 0, desc: 'wOBA Percentile (0-100) within this position group. 90 = better wOBA than 90% of players at this position.' },
        { key: 'opsDeviation', label: 'OPS Dev', decimals: 3, colorCode: 'positive-good', desc: 'OPS Deviation from regression. Linear regression of OPS vs Points within position group. Positive (green) = overperforming for cost. Negative (red) = underperforming.' },
        { key: 'wobaDeviation', label: 'wOBA Dev', decimals: 3, colorCode: 'positive-good', desc: 'wOBA Deviation from regression. Linear regression of wOBA vs Points within position group. Positive (green) = overperforming for cost. Negative (red) = underperforming.' },
        { key: 'atBats', label: 'PA', decimals: 0, desc: 'Plate Appearances. Total times this hitter batted across all matchups.' },
        { key: 'hits', label: 'H', decimals: 0, desc: 'Hits. Total hits (1B + 1B+ + 2B + 3B + HR).' },
        { key: 'singles', label: '1B', decimals: 0, desc: 'Singles. Regular singles (1 base).' },
        { key: 'singleplus', label: '1B+', decimals: 0, desc: 'Singles Plus. Enhanced singles worth ~1.5 bases in weighted stats.' },
        { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles (2 bases).' },
        { key: 'triples', label: '3B', decimals: 0, desc: 'Triples (3 bases).' },
        { key: 'homeRuns', label: 'HR', decimals: 0, desc: 'Home Runs (4 bases).' },
        { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks (base on balls). Reaches base but does not count as an at-bat.' },
        { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts. Out, does not put ball in play.' },
        { key: 'groundballs', label: 'GB', decimals: 0, desc: 'Ground Balls. Out on a ground ball.' },
        { key: 'flyballs', label: 'FB', decimals: 0, desc: 'Fly Balls. Out on a fly ball.' },
        { key: 'popups', label: 'PU', decimals: 0, desc: 'Popups. Out on a popup.' },
        { key: 'Vused', label: 'V Used', decimals: 0, desc: 'Vision Icon Uses. Times the V icon triggered a reroll on an out result (max 2 per 5-AB game).' },
        { key: 'Sused', label: 'S Used', decimals: 0, desc: 'Speed Icon Uses. Times the S icon upgraded a single/single+ to a double (once per game).' },
        { key: 'HRused', label: 'HR Used', decimals: 0, desc: 'HR Icon Uses. Times the HR icon upgraded a double/triple to a home run (once per game).' },
        { key: 'totalIconSlgImpact', label: 'Icon SLG+', decimals: 3, colorCode: 'positive-good', desc: 'Icon SLG Impact = (S icon TB gained + HR icon TB gained) / AB. Estimated SLG boost from S and HR icon upgrades.' },
        { key: 'totalIconWobaImpact', label: 'Icon wOBA+', decimals: 3, colorCode: 'positive-good', desc: 'Icon wOBA Impact. Estimated wOBA boost from all icons (V rerolls, S upgrades, HR upgrades) using linear weights.' }
    ];

    let hitterTabs = '';
    let hitterContent = '';

    positions.forEach((pos, idx) => {
        const players = playersByPosition[pos];
        calculateRegressions(players, 'points', [
            { value: 'ops', deviation: 'opsDeviation' },
            { value: 'woba', deviation: 'wobaDeviation' }
        ]);
        calculatePercentiles(players, ['ops', 'woba', 'battingAverage', 'onBasePercentage', 'sluggingPercentage']);
        calculateValueScore(players);
        players.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));

        const activeClass = idx === 0 ? 'active' : '';
        hitterTabs += `<button class="tab ${activeClass}" onclick="showTab('hitter-${pos}')">${pos}</button>`;
        hitterContent += `<div id="hitter-${pos}" class="tab-content ${activeClass}">${generateHtmlTable(players, hitterColumns, true)}</div>`;
    });

    const pitchersByRole = { 'Starters': [], 'Relievers+Closers': [] };
    Object.values(pitchersData).forEach(p => {
        if (p.Position === 'Starter') pitchersByRole['Starters'].push(p);
        else if (p.Position === 'Reliever' || p.Position === 'Closer') pitchersByRole['Relievers+Closers'].push(p);
    });

    const pitcherColumns = [
        { key: 'valueRating', label: 'Value', decimals: 0, desc: 'Value Rating (0-100). Combined z-score of WHIP and mWHIP deviation from regression, scaled to 0-100 centered at 50. Higher = better value for the card\'s point cost.' },
        { key: 'name', label: 'Name', desc: 'Player name, year, edition, card number, team. Hover for full card details.' },
        { key: 'points', label: 'Pts', decimals: 0, desc: 'Card point cost for team building. Higher points = stronger card.' },
        { key: 'Control', label: 'Ctrl', decimals: 0, desc: 'Control. Added to the pitcher\'s d20 roll. Higher Control = more likely to use pitcher\'s chart.' },
        { key: 'IP', label: 'IP', decimals: 0, desc: 'Innings Pitched capacity on the card.' },
        { key: 'hand', label: 'Hand', desc: 'Throwing hand. L = Left, R = Right.' },
        { key: 'Icons', label: 'Icons', desc: 'Special ability icons. K = block HR, 20 = +3 control once/inning, RP = +3 control first inning.' },
        { key: 'whip', label: 'WHIP', decimals: 3, desc: 'Walks + Hits per Inning Pitched = (BB + H) / IP. Lower = better. Measures baserunners allowed per inning.' },
        { key: 'mWHIP', label: 'mWHIP', decimals: 3, desc: 'Modified WHIP = (0.69\u00d7BB + 0.88\u00d71B + 1.08\u00d71B+ + 1.24\u00d72B + 1.56\u00d73B + 1.95\u00d7HR) / IP. Weights baserunners by damage using linear weights. Lower = better.' },
        { key: 'oppAvg', label: 'Opp AVG', decimals: 3, desc: 'Opponent Batting Average = H allowed / AB against. Lower = better.' },
        { key: 'oppOps', label: 'Opp OPS', decimals: 3, desc: 'Opponent OPS = Opp OBP + Opp SLG. Combined measure of how much offense the pitcher allows. Lower = better.' },
        { key: 'kPct', label: 'K%', decimals: 3, desc: 'Strikeout Rate = SO / BF. Fraction of batters faced that are struck out. Higher = better.' },
        { key: 'bbPct', label: 'BB%', decimals: 3, desc: 'Walk Rate = BB / BF. Fraction of batters faced that are walked. Lower = better.' },
        { key: 'kBbRatio', label: 'K/BB', decimals: 2, desc: 'Strikeout-to-Walk Ratio = SO / BB. Measures command. Higher = better.' },
        { key: 'hr9', label: 'HR/9', decimals: 2, desc: 'Home Runs per 9 Innings = (HR / IP) \u00d7 9. Lower = better.' },
        { key: 'gbPct', label: 'GB%', decimals: 3, desc: 'Ground Ball Percentage = GB / (BF - BB). Fraction of balls in play that are ground balls.' },
        { key: 'whipPercentile', label: 'WHIP%', decimals: 0, desc: 'WHIP Percentile (0-100) within role group. 90 = better WHIP than 90% of pitchers in this role.' },
        { key: 'mWHIPPercentile', label: 'mWHIP%', decimals: 0, desc: 'mWHIP Percentile (0-100) within role group. 90 = better mWHIP than 90% of pitchers in this role.' },
        { key: 'whipDeviation', label: 'WHIP Dev', decimals: 3, colorCode: 'negative-good', desc: 'WHIP Deviation from regression. Linear regression of WHIP vs Points within role group. Negative (green) = better than expected for cost. Positive (red) = worse.' },
        { key: 'mWHIPDeviation', label: 'mWHIP Dev', decimals: 3, colorCode: 'negative-good', desc: 'mWHIP Deviation from regression. Linear regression of mWHIP vs Points within role group. Negative (green) = better than expected. Positive (red) = worse.' },
        { key: 'battersFaced', label: 'BF', decimals: 0, desc: 'Batters Faced. Total plate appearances against this pitcher across all matchups.' },
        { key: 'outs', label: 'Outs', decimals: 0, desc: 'Total Outs recorded (SO + GB + FB + PU).' },
        { key: 'strikeouts', label: 'SO', decimals: 0, desc: 'Strikeouts. Total strikeouts recorded.' },
        { key: 'walks', label: 'BB', decimals: 0, desc: 'Walks allowed.' },
        { key: 'singles', label: '1B', decimals: 0, desc: 'Singles allowed.' },
        { key: 'singlepluses', label: '1B+', decimals: 0, desc: 'Singles Plus allowed.' },
        { key: 'doubles', label: '2B', decimals: 0, desc: 'Doubles allowed.' },
        { key: 'triples', label: '3B', decimals: 0, desc: 'Triples allowed.' },
        { key: 'homeruns', label: 'HR', decimals: 0, desc: 'Home Runs allowed.' },
        { key: 'groundballs', label: 'GB', decimals: 0, desc: 'Ground Ball outs recorded.' },
        { key: 'flyballs', label: 'FB', decimals: 0, desc: 'Fly Ball outs recorded.' },
        { key: 'popups', label: 'PU', decimals: 0, desc: 'Popup outs recorded.' },
        { key: 'kIconHRsBlocked', label: 'K HRs', decimals: 0, desc: 'K Icon: Home Runs Blocked. Times the K icon converted a HR into a strikeout (once per 9 innings).' },
        { key: 'kIconSlgImpact', label: 'K SLG-', decimals: 3, desc: 'K Icon SLG Reduction = TB saved / BF. Estimated SLG reduction from K icon blocking home runs.' },
        { key: 'twentyIconAdvantageSwings', label: '20 Swings', decimals: 0, desc: '20 Icon: Advantage Swings. Times the +3 control bonus flipped the chart from hitter to pitcher (once per inning).' },
        { key: 'rpIconAdvantageSwings', label: 'RP Swings', decimals: 0, desc: 'RP Icon: Advantage Swings. Times the +3 relief bonus flipped the chart from hitter to pitcher (first inning per game).' }
    ];

    let pitcherTabs = '';
    let pitcherContent = '';

    Object.entries(pitchersByRole).forEach(([role, pitchers], idx) => {
        calculatePitcherFinalStats(pitchers, config.WEIGHTS);
        calculateRegressions(pitchers, 'points', [
            { value: 'whip', deviation: 'whipDeviation' },
            { value: 'mWHIP', deviation: 'mWHIPDeviation' }
        ]);
        calculatePercentiles(pitchers, ['whip', 'mWHIP']);
        calculatePitcherValueScore(pitchers);
        pitchers.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));

        const activeClass = idx === 0 ? 'active' : '';
        pitcherTabs += `<button class="tab ${activeClass}" onclick="showTab('pitcher-${role}')">${role}</button>`;
        pitcherContent += `<div id="pitcher-${role}" class="tab-content ${activeClass}">${generateHtmlTable(pitchers, pitcherColumns, false)}</div>`;
    });

    const html = buildHtmlPage(hitterTabs, hitterContent, pitcherTabs, pitcherContent, config);
    fs.writeFileSync(filename, html);
}

function buildHtmlPage(hitterTabs, hitterContent, pitcherTabs, pitcherContent, config) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MLB Showdown Simulation Results</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #eee; }
        h1, h2 { color: #fff; }
        h1 { margin-bottom: 5px; }
        .sim-info { color: #888; font-size: 13px; margin-bottom: 20px; }
        .tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
        .tab { padding: 8px 16px; border: none; background: #16213e; color: #eee; cursor: pointer; border-radius: 5px 5px 0 0; font-size: 14px; }
        .tab:hover { background: #1f4068; }
        .tab.active { background: #1f4068; font-weight: bold; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        table { border-collapse: collapse; width: 100%; background: #16213e; margin-bottom: 30px; font-size: 13px; }
        th, td { padding: 6px 10px; text-align: left; border: 1px solid #1f4068; white-space: nowrap; }
        th { background: #1f4068; cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 11; font-size: 12px; border-bottom: 2px dotted #556; }
        th:hover { background: #e94560; }
        th[title] { cursor: help; }
        tr:nth-child(even) { background: #1a1a2e; }
        tr:hover { background: #0f3460; }
        .section { margin-bottom: 40px; }
        .table-container { overflow-x: auto; max-height: 700px; overflow-y: auto; }
        td:first-child { font-weight: bold; }
        .val-good { color: #4ade80; }
        .val-bad { color: #f87171; }
        .name-cell { cursor: help; }
        /* Filter row */
        .filter-row th { background: #0f1f3a; position: sticky; top: 29px; z-index: 10; padding: 3px 4px; cursor: default; }
        .filter-row th:hover { background: #0f1f3a; }
        .filter-input { width: 100%; background: #16213e; color: #eee; border: 1px solid #1f4068; border-radius: 3px; padding: 3px 5px; font-size: 11px; }
        .filter-input:focus { outline: none; border-color: #e94560; }
        .filter-input::placeholder { color: #556; }
        .filter-range { display: flex; gap: 2px; }
        .filter-range .filter-input { width: 50%; }
        .filter-cell { cursor: default !important; }
        /* Match count */
        .match-count { color: #888; font-size: 12px; margin-top: 4px; }
        /* Clear filters button */
        .clear-filters { padding: 4px 12px; border: 1px solid #1f4068; background: #16213e; color: #888; cursor: pointer; border-radius: 3px; font-size: 12px; margin-left: 10px; }
        .clear-filters:hover { background: #1f4068; color: #eee; border-color: #e94560; }
        /* Tooltip */
        #tooltip {
            display: none; position: fixed; background: #0a1628; color: #eee;
            padding: 12px 16px; border-radius: 8px; border: 1px solid #e94560;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6); z-index: 10000;
            font-size: 13px; line-height: 1.5; max-width: 500px; pointer-events: none;
        }
        #tooltip .tt-section { margin-bottom: 4px; }
        #tooltip .tt-label { color: #e94560; font-weight: 600; }
        #tooltip .tt-divider { border-top: 1px solid #1f4068; margin: 6px 0; }
        #tooltip .tt-chart { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; }
    </style>
</head>
<body>
    <h1>MLB Showdown Simulation Results</h1>
    <div class="sim-info">${config.AT_BATS_PER_MATCHUP} at-bats per matchup${config.SEED ? ' | Seed: "' + config.SEED + '"' : ''}</div>
    <div id="tooltip"></div>

    <div class="section" id="hitter-section">
        <h2>Hitters <button class="clear-filters" onclick="clearFilters('hitter-section')">Clear Filters</button></h2>
        <div class="tabs">${hitterTabs}</div>
        <div class="table-container">${hitterContent}</div>
        <div class="match-count" id="hitter-match-count"></div>
    </div>

    <div class="section" id="pitcher-section">
        <h2>Pitchers <button class="clear-filters" onclick="clearFilters('pitcher-section')">Clear Filters</button></h2>
        <div class="tabs">${pitcherTabs}</div>
        <div class="table-container">${pitcherContent}</div>
        <div class="match-count" id="pitcher-match-count"></div>
    </div>

    <script>
        // Tab switching
        function showTab(id) {
            const section = id.startsWith('hitter') ? 'hitter' : 'pitcher';
            document.querySelectorAll('[id^="' + section + '-"].tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tabs .tab').forEach(el => {
                if (el.onclick.toString().includes(section)) el.classList.remove('active');
            });
            document.getElementById(id).classList.add('active');
            event.target.classList.add('active');
        }

        // Sorting
        function sortTable(th) {
            if (th.closest('.filter-row')) return;
            const table = th.closest('table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const idx = Array.from(th.parentNode.children).indexOf(th);
            const asc = th.dataset.sort !== 'asc';
            rows.sort((a, b) => {
                const aNum = parseFloat(a.children[idx].textContent);
                const bNum = parseFloat(b.children[idx].textContent);
                if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
                return asc ? a.children[idx].textContent.localeCompare(b.children[idx].textContent)
                           : b.children[idx].textContent.localeCompare(a.children[idx].textContent);
            });
            th.dataset.sort = asc ? 'asc' : 'desc';
            rows.forEach(row => tbody.appendChild(row));
        }

        // Filtering
        function applyFilters(input) {
            const table = input.closest('table');
            const filterRow = table.querySelector('.filter-row');
            const inputs = filterRow.querySelectorAll('.filter-input');
            const tbody = table.querySelector('tbody');
            const rows = tbody.querySelectorAll('tr');
            let visible = 0;

            rows.forEach(row => {
                let show = true;
                inputs.forEach(fi => {
                    const col = parseInt(fi.dataset.col);
                    const type = fi.dataset.type;
                    const val = fi.value.trim();
                    if (!val) return;
                    const cellText = row.children[col]?.textContent || '';

                    if (type === 'text') {
                        if (!cellText.toLowerCase().includes(val.toLowerCase())) show = false;
                    } else if (type === 'min') {
                        const cellNum = parseFloat(cellText);
                        if (isNaN(cellNum) || cellNum < parseFloat(val)) show = false;
                    } else if (type === 'max') {
                        const cellNum = parseFloat(cellText);
                        if (isNaN(cellNum) || cellNum > parseFloat(val)) show = false;
                    }
                });
                row.style.display = show ? '' : 'none';
                if (show) visible++;
            });

            // Update match count
            const section = table.closest('.section');
            const countEl = section.querySelector('.match-count');
            if (countEl) {
                const total = rows.length;
                const hasFilters = Array.from(inputs).some(i => i.value.trim());
                countEl.textContent = hasFilters ? visible + ' of ' + total + ' shown' : '';
            }
        }

        function clearFilters(sectionId) {
            const section = document.getElementById(sectionId);
            section.querySelectorAll('.filter-input').forEach(input => {
                input.value = '';
            });
            section.querySelectorAll('tbody tr').forEach(row => {
                row.style.display = '';
            });
            const countEl = section.querySelector('.match-count');
            if (countEl) countEl.textContent = '';
        }

        // Rich tooltip
        const tooltip = document.getElementById('tooltip');
        document.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.name-cell');
            if (cell && cell.dataset.tooltipHtml) {
                tooltip.innerHTML = cell.dataset.tooltipHtml;
                tooltip.style.display = 'block';
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (tooltip.style.display === 'block') {
                tooltip.style.left = Math.min(e.clientX + 15, window.innerWidth - tooltip.offsetWidth - 20) + 'px';
                tooltip.style.top = Math.min(e.clientY + 15, window.innerHeight - tooltip.offsetHeight - 20) + 'px';
            }
        });
        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('.name-cell')) tooltip.style.display = 'none';
        });
    </script>
</body>
</html>`;
}

// ============================================================================
// XLSX EXPORT
// ============================================================================

function exportToXlsx(hittersData, pitchersData, filename) {
    const xlsx = require('xlsx');
    const wb = xlsx.utils.book_new();

    const positions = ["C", "1B", "2B", "3B", "SS", "LF-RF", "CF", "DH", "All Hitters"];
    const playersByPosition = Object.fromEntries(positions.map(p => [p, []]));

    Object.values(hittersData).forEach(player => {
        if (!player.Position) {
            playersByPosition["All Hitters"].push(player);
            return;
        }
        const positionList = player.Position.split(',').map(p => p.trim().split('+')[0]);
        positionList.forEach(pos => {
            if (positions.includes(pos)) playersByPosition[pos].push(player);
            if (pos === "IF") ["1B", "2B", "3B", "SS"].forEach(p => playersByPosition[p].push(player));
            if (pos === "OF") ["LF-RF", "CF"].forEach(p => playersByPosition[p].push(player));
        });
        playersByPosition["All Hitters"].push(player);
    });

    positions.forEach(position => {
        const players = playersByPosition[position];
        calculateRegressions(players, 'points', [
            { value: 'ops', deviation: 'opsDeviation' },
            { value: 'woba', deviation: 'wobaDeviation' }
        ]);
        calculateValueScore(players);
        players.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
        const ws = xlsx.utils.json_to_sheet(players);
        xlsx.utils.book_append_sheet(wb, ws, position);
    });

    const pitchersByRole = { 'Starters': [], 'Relievers+Closers': [] };
    Object.values(pitchersData).forEach(p => {
        if (p.Position === 'Starter') pitchersByRole['Starters'].push(p);
        else if (p.Position === 'Reliever' || p.Position === 'Closer') pitchersByRole['Relievers+Closers'].push(p);
    });

    Object.entries(pitchersByRole).forEach(([role, pitchers]) => {
        calculatePitcherFinalStats(pitchers, defaultConfig.WEIGHTS);
        calculateRegressions(pitchers, 'points', [
            { value: 'whip', deviation: 'whipDeviation' },
            { value: 'mWHIP', deviation: 'mWHIPDeviation' }
        ]);
        calculatePitcherValueScore(pitchers);
        pitchers.sort((a, b) => (b.valueRating || 0) - (a.valueRating || 0));
        const ws = xlsx.utils.json_to_sheet(pitchers);
        xlsx.utils.book_append_sheet(wb, ws, role);
    });

    xlsx.writeFile(wb, filename);
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

function printProgress(current, total, startTime) {
    const percent = Math.round(current / total * 100);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = current / elapsed;
    const remaining = current > 0 ? Math.round((total - current) / rate) : 0;
    const barWidth = 30;
    const filled = Math.round(barWidth * current / total);
    const bar = '#'.repeat(filled) + '-'.repeat(barWidth - filled);

    process.stdout.write(`\r  [${bar}] ${percent}% (${current}/${total}) ${remaining}s remaining  `);
}

// ============================================================================
// MAIN SIMULATION
// ============================================================================

function runSimulation(config) {
    const startTime = Date.now();
    const rng = config.SEED ? seedrandom(config.SEED) : Math.random;
    const rollDie = () => Math.floor(rng() * 20) + 1;

    const hitters = JSON.parse(fs.readFileSync('./hitters.json'));
    const pitchers = JSON.parse(fs.readFileSync('./pitchers.json'));

    console.log(`Hitters: ${hitters.length} | Pitchers: ${pitchers.length} | At-bats/matchup: ${config.AT_BATS_PER_MATCHUP}`);
    console.log(`Seed: ${config.SEED ? '"' + config.SEED + '"' : 'random'} | Output: ${config.OUTPUT} (${config.FORMAT})`);
    console.log(`Total matchups: ${(hitters.length * pitchers.length).toLocaleString()} | Total at-bats: ${(hitters.length * pitchers.length * config.AT_BATS_PER_MATCHUP).toLocaleString()}`);

    validateData(hitters, pitchers);

    console.log('Pre-computing ranges...');
    precomputeRanges(hitters, ['SO', 'GB', 'FB', 'W', 'S', 'SPlus', 'DB', 'TR', 'HR']);
    precomputeRanges(pitchers, ['PU', 'SO', 'GB', 'FB', 'W', 'S', 'DB', 'HR']);

    const pitcherData = pitchers.map(initializePitcher);
    const pitchersResults = {};
    pitcherData.forEach(p => {
        pitchersResults[`${p.Name} ${p["Yr."]} ${p.Ed} ${p["#"]} ${p.Team}`] = p;
    });

    console.log('Simulating...');
    const hittersResults = {};
    const totalHitters = hitters.length;

    hitters.forEach((hitter, index) => {
        printProgress(index, totalHitters, startTime);

        const stats = createHitterStats(hitter);

        for (const pitcher of pitcherData) {
            pitcher.iconCounts = { '20': 0, 'K': 0, 'RP': 0 };

            for (let i = 0; i < config.AT_BATS_PER_MATCHUP; i++) {
                const outcome = simulateAtBat(hitter, pitcher, stats, rollDie);
                updateHitterStats(stats, outcome);
                updatePitcherStats(pitcher, outcome, config.WEIGHTS);
            }
        }

        hittersResults[stats.name] = calculateFinalStats(stats, config.WEIGHTS);
    });

    printProgress(totalHitters, totalHitters, startTime);
    console.log('');

    const simTime = Date.now() - startTime;
    console.log(`Simulation complete in ${(simTime / 1000).toFixed(2)}s`);
    console.log('Exporting results...');

    if (config.FORMAT === 'xlsx') {
        exportToXlsx(hittersResults, pitchersResults, config.OUTPUT);
    } else {
        exportToHtml(hittersResults, pitchersResults, config.OUTPUT, config);
    }

    console.log(`Results exported to ${config.OUTPUT}`);
    return simTime;
}

if (require.main === module) {
    const config = parseArgs(process.argv);
    runSimulation(config);
}

module.exports = { runSimulation, parseRange, rollInRange, determineOutcome, applyHitterIcons, validateData };
