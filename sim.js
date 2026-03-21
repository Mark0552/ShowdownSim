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
 *   --seed <string>   RNG seed for reproducibility (default: 'showdown-sim-2024')
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
    const ab = stats.atBats - stats.walks;
    const singles = stats.hits - stats.doubles - stats.triples - stats.homeRuns - stats.singleplus;
    const totalBases = singles + (2 * stats.singleplus) + (2 * stats.doubles) + (3 * stats.triples) + (4 * stats.homeRuns);

    const battingAverage = ab === 0 ? 0 : stats.hits / ab;
    const onBasePercentage = stats.atBats === 0 ? 0 : (stats.hits + stats.walks) / stats.atBats;
    const sluggingPercentage = ab === 0 ? 0 : totalBases / ab;

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
    const vObpImpact = stats.atBats > 0 ? vHitsEstimate / stats.atBats : 0;
    const sSlgImpact = ab > 0 ? iconImpact.S.tbGained / ab : 0;
    const hrSlgImpact = ab > 0 ? iconImpact.HR.tbGained / ab : 0;
    const totalIconSlgImpact = sSlgImpact + hrSlgImpact;

    const vWobaImpact = stats.atBats > 0 ? (vHitsEstimate * w.single) / stats.atBats : 0;
    const sWobaImpact = stats.atBats > 0 ? (iconImpact.S.doublesFromSingles * (w.double - w.single)) / stats.atBats : 0;
    const hrWobaImpact = stats.atBats > 0 ? ((iconImpact.HR.hrsFromDoubles * (w.hr - w.double)) + (iconImpact.HR.hrsFromTriples * (w.hr - w.triple))) / stats.atBats : 0;
    const totalIconWobaImpact = vWobaImpact + sWobaImpact + hrWobaImpact;

    const { iconList, hasV, hasS, hasHR, iconImpact: _, gameAbCount, gameVuses, gameSused, gameHRused, ...exportStats } = stats;
    return {
        ...exportStats,
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        ops: onBasePercentage + sluggingPercentage,
        woba,
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

function calculatePitcherIconImpact(pitchers) {
    pitchers.forEach(p => {
        if (!p.iconImpact) return;

        p.kIconHRsBlocked = p.iconImpact.K.hrsBlocked;
        p.kIconTBSaved = p.iconImpact.K.tbSaved;
        p.kIconSlgImpact = p.iconImpact.K.tbSaved / (p.battersFaced || 1);

        p.twentyIconAdvantageSwings = p.iconImpact.twenty.advantageSwings;
        p.twentyIconSwingRate = p.twentyUsed > 0
            ? (p.iconImpact.twenty.advantageSwings / p.twentyUsed)
            : 0;

        p.rpIconAdvantageSwings = p.iconImpact.RP.advantageSwings;
        p.rpIconSwingRate = p.RPused > 0
            ? (p.iconImpact.RP.advantageSwings / p.RPused)
            : 0;

        p.totalIconSlgReduction = p.kIconSlgImpact;

        delete p.iconImpact;
        delete p.iconCounts;
        delete p.ranges;
    });
}

// ============================================================================
// HTML EXPORT
// ============================================================================

function generateChartTooltip(chart, isHitter) {
    if (!chart) return '';
    if (isHitter) {
        return `SO: ${chart.SO} | GB: ${chart.GB} | FB: ${chart.FB} | W: ${chart.W} | S: ${chart.S} | S+: ${chart.SPlus} | DB: ${chart.DB} | TR: ${chart.TR} | HR: ${chart.HR}`;
    }
    return `PU: ${chart.PU} | SO: ${chart.SO} | GB: ${chart.GB} | FB: ${chart.FB} | W: ${chart.W} | S: ${chart.S} | DB: ${chart.DB} | HR: ${chart.HR}`;
}

function generateHtmlTable(data, columns, isHitter = true) {
    if (!data || data.length === 0) return '<p>No data</p>';

    const headers = columns.map(col => `<th onclick="sortTable(this)">${col.label}</th>`).join('');
    const rows = data.map(row => {
        const cells = columns.map(col => {
            let val = row[col.key];
            if (val === undefined || val === null) val = '';
            if (typeof val === 'number') {
                val = col.decimals !== undefined ? val.toFixed(col.decimals) : val;
            }
            if (col.key === 'name' && row.chart) {
                const tooltip = generateChartTooltip(row.chart, isHitter);
                return `<td class="name-cell" data-tooltip="${tooltip}">${val}</td>`;
            }
            return `<td>${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function exportToHtml(hittersData, pitchersData, filename) {
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
        { key: 'valueRating', label: 'Value', decimals: 0 },
        { key: 'name', label: 'Name' },
        { key: 'points', label: 'Pts', decimals: 0 },
        { key: 'onBase', label: 'OB', decimals: 0 },
        { key: 'icons', label: 'Icons' },
        { key: 'battingAverage', label: 'AVG', decimals: 3 },
        { key: 'onBasePercentage', label: 'OBP', decimals: 3 },
        { key: 'sluggingPercentage', label: 'SLG', decimals: 3 },
        { key: 'ops', label: 'OPS', decimals: 3 },
        { key: 'opsPercentile', label: 'OPS%', decimals: 0 },
        { key: 'woba', label: 'wOBA', decimals: 3 },
        { key: 'wobaPercentile', label: 'wOBA%', decimals: 0 },
        { key: 'opsDeviation', label: 'OPS Dev', decimals: 3 },
        { key: 'wobaDeviation', label: 'wOBA Dev', decimals: 3 },
        { key: 'Vused', label: 'V Used', decimals: 0 },
        { key: 'Sused', label: 'S Used', decimals: 0 },
        { key: 'HRused', label: 'HR Used', decimals: 0 },
        { key: 'totalIconSlgImpact', label: 'Icon SLG+', decimals: 3 },
        { key: 'totalIconWobaImpact', label: 'Icon wOBA+', decimals: 3 }
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
        { key: 'valueRating', label: 'Value', decimals: 0 },
        { key: 'name', label: 'Name' },
        { key: 'points', label: 'Pts', decimals: 0 },
        { key: 'Control', label: 'Ctrl', decimals: 0 },
        { key: 'Icons', label: 'Icons' },
        { key: 'whip', label: 'WHIP', decimals: 3 },
        { key: 'whipPercentile', label: 'WHIP%', decimals: 0 },
        { key: 'mWHIP', label: 'mWHIP', decimals: 3 },
        { key: 'mWHIPPercentile', label: 'mWHIP%', decimals: 0 },
        { key: 'whipDeviation', label: 'WHIP Dev', decimals: 3 },
        { key: 'mWHIPDeviation', label: 'mWHIP Dev', decimals: 3 },
        { key: 'kIconHRsBlocked', label: 'K HRs', decimals: 0 },
        { key: 'kIconSlgImpact', label: 'K SLG-', decimals: 3 },
        { key: 'twentyIconAdvantageSwings', label: '20 Swings', decimals: 0 },
        { key: 'rpIconAdvantageSwings', label: 'RP Swings', decimals: 0 }
    ];

    let pitcherTabs = '';
    let pitcherContent = '';

    Object.entries(pitchersByRole).forEach(([role, pitchers], idx) => {
        calculatePitcherIconImpact(pitchers);
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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MLB Showdown Simulation Results</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #eee; }
        h1, h2 { color: #fff; }
        .tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
        .tab { padding: 8px 16px; border: none; background: #16213e; color: #eee; cursor: pointer; border-radius: 5px 5px 0 0; }
        .tab:hover { background: #1f4068; }
        .tab.active { background: #1f4068; font-weight: bold; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        table { border-collapse: collapse; width: 100%; background: #16213e; margin-bottom: 30px; }
        th, td { padding: 8px 12px; text-align: left; border: 1px solid #1f4068; white-space: nowrap; }
        th { background: #1f4068; cursor: pointer; user-select: none; position: sticky; top: 0; }
        th:hover { background: #e94560; }
        tr:nth-child(even) { background: #1a1a2e; }
        tr:hover { background: #0f3460; }
        .section { margin-bottom: 40px; }
        .table-container { overflow-x: auto; max-height: 600px; overflow-y: auto; }
        td:first-child { font-weight: bold; }
        .name-cell { position: relative; cursor: help; }
        .name-cell::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 0;
            top: 100%;
            background: #0f3460;
            color: #fff;
            padding: 10px 15px;
            border-radius: 5px;
            white-space: nowrap;
            z-index: 1000;
            font-size: 13px;
            font-weight: normal;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s;
            border: 1px solid #e94560;
        }
        .name-cell:hover::after {
            opacity: 1;
            visibility: visible;
        }
    </style>
</head>
<body>
    <h1>MLB Showdown Simulation Results</h1>

    <div class="section">
        <h2>Hitters</h2>
        <div class="tabs">${hitterTabs}</div>
        <div class="table-container">${hitterContent}</div>
    </div>

    <div class="section">
        <h2>Pitchers</h2>
        <div class="tabs">${pitcherTabs}</div>
        <div class="table-container">${pitcherContent}</div>
    </div>

    <script>
        function showTab(id) {
            const section = id.startsWith('hitter') ? 'hitter' : 'pitcher';
            document.querySelectorAll('[id^="' + section + '-"]').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tabs .tab').forEach(el => {
                if (el.onclick.toString().includes(section)) {
                    el.classList.remove('active');
                }
            });
            document.getElementById(id).classList.add('active');
            event.target.classList.add('active');
        }

        function sortTable(th) {
            const table = th.closest('table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const idx = Array.from(th.parentNode.children).indexOf(th);
            const asc = th.dataset.sort !== 'asc';

            rows.sort((a, b) => {
                let aVal = a.children[idx].textContent;
                let bVal = b.children[idx].textContent;
                const aNum = parseFloat(aVal);
                const bNum = parseFloat(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return asc ? aNum - bNum : bNum - aNum;
                }
                return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });

            th.dataset.sort = asc ? 'asc' : 'desc';
            rows.forEach(row => tbody.appendChild(row));
        }
    </script>
</body>
</html>`;

    fs.writeFileSync(filename, html);
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
        calculatePitcherIconImpact(pitchers);
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
    const rng = seedrandom(config.SEED);
    const rollDie = () => Math.floor(rng() * 20) + 1;

    const hitters = JSON.parse(fs.readFileSync('./hitters.json'));
    const pitchers = JSON.parse(fs.readFileSync('./pitchers.json'));

    console.log(`Hitters: ${hitters.length} | Pitchers: ${pitchers.length} | At-bats/matchup: ${config.AT_BATS_PER_MATCHUP}`);
    console.log(`Seed: "${config.SEED}" | Output: ${config.OUTPUT} (${config.FORMAT})`);
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
        exportToHtml(hittersResults, pitchersResults, config.OUTPUT);
    }

    console.log(`Results exported to ${config.OUTPUT}`);
    return simTime;
}

if (require.main === module) {
    const config = parseArgs(process.argv);
    runSimulation(config);
}

module.exports = { runSimulation, parseRange, rollInRange, determineOutcome, applyHitterIcons, validateData };
