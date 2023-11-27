const xlsx = require('xlsx');
const fs = require('fs');
const ss = require('simple-statistics');

const hitters = JSON.parse(fs.readFileSync('./hitters.json'));
const pitchers = JSON.parse(fs.readFileSync('./pitchers.json'));
let hittersResults = {};
let pitchersResults = {};
console.log("# of Hitters:" + hitters.length)
console.log("# of Pitchers:" + pitchers.length)
console.log("Please Wait ...")

function calculatePositionalRegressions(players) {
    const regressionDataOPS = players.map(player => [player.points, player.ops]);
    const regressionModelOPS = ss.linearRegression(regressionDataOPS);
    const regressionDataWOBA = players.map(player => [player.points, player.woba]);
    const regressionModelWOBA = ss.linearRegression(regressionDataWOBA);

    players.forEach(player => {
        const expectedOPS = regressionModelOPS.m * player.points + regressionModelOPS.b;
        player.opsDeviation = player.ops - expectedOPS;
        const expectedWOBA = regressionModelWOBA.m * player.points + regressionModelWOBA.b;
        player.wobaDeviation = player.woba - expectedWOBA;
    });
}

function calculatePitcherRegressions(pitchers) {
    const regressionDataMWHIP = pitchers.map(pitcher => [pitcher.points, pitcher.mWHIP]);
    const regressionModelMWHIP = ss.linearRegression(regressionDataMWHIP);

    const regressionDataWHIP = pitchers.map(pitcher => [pitcher.points, pitcher.whip]);
    const regressionModelWHIP = ss.linearRegression(regressionDataWHIP);

    pitchers.forEach(pitcher => {
        const expectedWHIP = regressionModelWHIP.m * pitcher.points + regressionModelWHIP.b;
        pitcher.whipDeviation = pitcher.whip - expectedWHIP;

        const expectedMWHIP = regressionModelMWHIP.m * pitcher.points + regressionModelMWHIP.b;
        pitcher.mWHIPDeviation = pitcher.mWHIP - expectedMWHIP;
    });
}

function exportToExcel(hittersData, pitchersData, filename) {
    const wb = xlsx.utils.book_new();
    const positions = ["C", "1B", "2B", "3B", "SS", "LF-RF", "CF", "DH", "All Hitters"];
    const playersByPosition = {};
    positions.forEach(position => {
        playersByPosition[position] = [];
    });

    Object.values(hittersData).forEach(player => {
        const playerPositions = player.Position.split(',').map(pos => pos.trim().split('+')[0]);
        playerPositions.forEach(pos => {
            if (positions.includes(pos)) {
                playersByPosition[pos].push(player);
            }
            if (pos === "IF") {
                ["1B", "2B", "3B", "SS"].forEach(infieldPos => playersByPosition[infieldPos].push(player));
            } else if (pos === "OF") {
                ["LF-RF", "CF"].forEach(outfieldPos => playersByPosition[outfieldPos].push(player));
            }
        });
        playersByPosition["All Hitters"].push(player);
    });
    
    positions.forEach(position => {
        calculatePositionalRegressions(playersByPosition[position]);
        const ws = xlsx.utils.json_to_sheet(playersByPosition[position]);
        xlsx.utils.book_append_sheet(wb, ws, position);
    });

    const pitchersByRole = { 'Starters': [], 'Relievers+Closers': [] };
    Object.values(pitchersData).forEach(pitcher => {
        const role = pitcher.Position;
        if (role === 'Starter') {
            pitchersByRole['Starters'].push(pitcher);
        } else if (role === 'Reliever' || role === 'Closer') {
            pitchersByRole['Relievers+Closers'].push(pitcher);
        }
    });

    Object.keys(pitchersByRole).forEach(role => {
        calculatePitcherRegressions(pitchersByRole[role]);
        const ws = xlsx.utils.json_to_sheet(pitchersByRole[role]);
        xlsx.utils.book_append_sheet(wb, ws, role);
    });

    xlsx.writeFile(wb, filename);
}

pitchers.forEach(pitcher => {
    pitcher.points = pitcher.Points;
    pitcher.battersFaced = 0;
    pitcher.outs = 0;
    pitcher.strikeouts = 0;
    pitcher.popups = 0;
    pitcher.groundballs = 0;
    pitcher.flyballs = 0;
    pitcher.walks = 0;
    pitcher.singles = 0;
    pitcher.singlepluses = 0;
    pitcher.doubles = 0;
    pitcher.triples = 0;
    pitcher.homeruns = 0;
    pitcher.kused = 0;
    pitcher.twentyUsed = 0;
    pitcher.RPused = 0;
    pitcher.iconCounts = { '20': 0, 'K': 0, 'RP': 0 };
    pitchersResults[`${pitcher.Name} ${pitcher["Yr."]} ${pitcher.Ed} ${pitcher["#"]} ${pitcher.Team}`] = pitcher;
});

for (const hitter of hitters) {
    let hitterFullName = `${hitter.Name} ${hitter["Yr."]} ${hitter.Ed} ${hitter["#"]} ${hitter.Team}`;
    let hitterStats = {
        name: hitterFullName,
        points: hitter.Points,
        icons: hitter.Icons,
        onBase: hitter.onBase,
        Speed: hitter.Speed,
        Position: hitter.Position,
        H: hitter.H,
        SO: hitter.SO,
        GB: hitter.GB,
        FB: hitter.FB,
        W: hitter.W,
        S: hitter.S,
        SPlus: hitter.SPlus,
        DB: hitter.DB,
        TR: hitter.TR,
        HR: hitter.HR,
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
        iconCounts: {
            R: 0,
            RY: 0,
            G: 0,
            S: 0,
            HR: 0,
            V: 0
        },
        useIconThisAtBat: {
            R: true,
            RY: true,
            G: true,
            S: true,
            HR: true,
            V: true
        },
        Vused: 0,
        Sused: 0,
        HRused: 0
    };

    for (const pitcher of pitchers) {
        for (let i = 0; i < 500; i++) {
            let result = simulateAtBat(hitter, pitcher, hitterStats);
            hitterStats = updateHitterStats(hitterStats, result);
            updatePitcherStats(pitcher, result);
        }
        pitchersResults[`${pitcher.Name} ${pitcher["Yr."]} ${pitcher.Ed} ${pitcher["#"]} ${pitcher.Team}`] = pitcher;
    }
    hittersResults[hitterFullName] = calculateStats(hitterStats);
}

function rollDie() {
    return Math.floor(Math.random() * 20) + 1;
}

function simulateAtBat(hitter, pitcher, hitterStats) {
    for (const icon in hitterStats.useIconThisAtBat) {
        hitterStats.useIconThisAtBat[icon] = false;
    }

    if (hitter.Icons) {
        const icons = hitter.Icons.split(' ');
        for (const icon of icons) {
            if (hitterStats.iconCounts[icon] >= 3) {
                hitterStats.useIconThisAtBat[icon] = true;
            }
        }
    }

    let pitcherRoll = rollDie() + pitcher.Control;
    const hitterRoll = rollDie();

    if (pitcher.Icons && pitcher.Icons.includes('RP') && pitcher.iconCounts['RP'] === 0) {
        pitcherRoll += 3;
        pitcher.iconCounts['RP'] = 1;
        pitcher.RPused++;
    }

    if (pitcher.Icons && pitcher.Icons.includes('20') && pitcher.iconCounts['20'] < 1) {
        pitcherRoll += 3;
        pitcher.iconCounts['20']++;
        pitcher.twentyUsed++;
    }

    let result;
    if (pitcherRoll > hitter.onBase) {
        result = determineOutcomeFromPitcherChart(pitcher, hitterRoll, hitterStats);
    } else {
        result = determineOutcomeFromHitterChart(hitter, hitterRoll, hitterStats);
    }

    for (const icon in hitterStats.iconCounts) {
        if (hitterStats.useIconThisAtBat[icon]) {
            hitterStats.iconCounts[icon] = 0;
        } else {
            hitterStats.iconCounts[icon]++;
        }
    }

    if (result === 'homeRun' && pitcher.Icons && pitcher.Icons.includes('K') && pitcher.iconCounts['K'] < 1) {
        result = 'strikeout';
        pitcher.kused++;
        pitcher.iconCounts['K']++;
    }

    if (pitcher.outs % 27 === 0) {
        pitcher.iconCounts['K'] = 0;
    }

    if (pitcher.outs % 3 === 0) {
        pitcher.iconCounts['20'] = 0;

        // Handling RP icon cooldown
        if (pitcher.iconCounts['RP'] > 0) {
            pitcher.iconCounts['RP']++;
        }
        if (pitcher.iconCounts['RP'] > 3) {
            pitcher.iconCounts['RP'] = 0;
        }
    }

    return result;
}

function determineOutcomeFromHitterChart(hitter, hitterRoll, hitterStats) {
    function parseRange(range) {
        if (range.includes("-")) {
            return range.split("-").map(Number);
        } else {
            const number = Number(range);
            return [number, number];
        }
    }

    let outcome;

    if (hitter.SO) {
        const [low, high] = parseRange(hitter.SO);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'strikeout';
    }
    if (!outcome && hitter.GB) {
        const [low, high] = parseRange(hitter.GB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'groundball';
    }
    if (!outcome && hitter.FB) {
        const [low, high] = parseRange(hitter.FB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'flyball';
    }
    if (!outcome && hitter.W) {
        const [low, high] = parseRange(hitter.W);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'walk';
    }
    if (!outcome && hitter.S) {
        const [low, high] = parseRange(hitter.S);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'single';
    }
    if (!outcome && hitter.SPlus) {
        const [low, high] = parseRange(hitter.SPlus);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'singleplus';
    }
    if (!outcome && hitter.DB) {
        const [low, high] = parseRange(hitter.DB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'double';
    }
    if (!outcome && hitter.TR) {
        const [low, high] = parseRange(hitter.TR);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'triple';
    }
    if (!outcome && hitter.HR && hitterRoll >= parseInt(hitter.HR.split("+")[0])) {
        outcome = 'homeRun';
    }
    if (hitterStats.useIconThisAtBat.V && ['strikeout', 'groundball', 'flyball'].includes(outcome)) {
        hitterStats.Vused++;
        const reroll = rollDie();
        outcome = determineOutcomeFromHitterChart(hitter, reroll, hitterStats);
    }
    if (hitterStats.useIconThisAtBat.HR && outcome === 'triple') {
        hitterStats.HRused++;
        outcome = 'homeRun';
    }
    if (hitterStats.useIconThisAtBat.HR && outcome === 'double') {
        hitterStats.HRused++;
        outcome = 'homeRun';
    }
    if (hitterStats.useIconThisAtBat.S && outcome === 'singleplus') {
        hitterStats.Sused++;
        outcome = 'double';
    }
    if (hitterStats.useIconThisAtBat.S && outcome === 'single') {
        hitterStats.Sused++;
        outcome = 'double';
    }
    return outcome;
}

function determineOutcomeFromPitcherChart(pitcher, hitterRoll, hitterStats) {
    function parseRange(range) {
        if (range.includes("-")) {
            return range.split("-").map(Number);
        } else {
            const number = Number(range);
            return [number, number];
        }
    }

    let outcome;

    if (pitcher.PU) {
        const [low, high] = parseRange(pitcher.PU);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'popup';
    }
    if (!outcome && pitcher.SO) {
        const [low, high] = parseRange(pitcher.SO);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'strikeout';
    }
    if (!outcome && pitcher.GB) {
        const [low, high] = parseRange(pitcher.GB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'groundball';
    }
    if (!outcome && pitcher.FB) {
        const [low, high] = parseRange(pitcher.FB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'flyball';
    }
    if (!outcome && pitcher.W) {
        const [low, high] = parseRange(pitcher.W);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'walk';
    }
    if (!outcome && pitcher.S) {
        const [low, high] = parseRange(pitcher.S);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'single';
    }
    if (!outcome && pitcher.DB) {
        const [low, high] = parseRange(pitcher.DB);
        if (hitterRoll >= low && hitterRoll <= high) outcome = 'double';
    }
    if (!outcome && pitcher.HR && hitterRoll >= parseInt(pitcher.HR.split("+")[0])) {
        outcome = 'homeRun';
    }
    if (hitterStats.useIconThisAtBat.HR && (outcome === 'double')) {
        hitterStats.HRused++;
        outcome = 'homeRun';
    }
    if (hitterStats.useIconThisAtBat.S && outcome === 'single') {
        hitterStats.Sused++;
        outcome = 'double';
    }
    return outcome;
}

function updateHitterStats(currentStats, atBatResult) {
    currentStats.atBats += 1;
    switch (atBatResult) {
        case 'single':
            currentStats.hits += 1;
            break;
        case 'singleplus':
            currentStats.hits += 1;
            currentStats.singleplus += 1;
            break;
        case 'double':
            currentStats.hits += 1;
            currentStats.doubles += 1;
            break;
        case 'triple':
            currentStats.hits += 1;
            currentStats.triples += 1;
            break;
        case 'homeRun':
            currentStats.hits += 1;
            currentStats.homeRuns += 1;
            break;
        case 'walk':
            currentStats.walks += 1;
            break;
        case 'strikeout':
            currentStats.strikeouts += 1;
            break;
        case 'popup':
            currentStats.popups += 1;
            break;
        case 'flyball':
            currentStats.flyballs += 1;
            break;
        case 'groundball':
            currentStats.groundballs += 1;
            break;
    }
    return currentStats;
}

function updatePitcherStats(pitcher, result) {
    switch (result) {
        case 'strikeout':
            pitcher.strikeouts++;
            pitcher.outs++;
            break;
        case 'popup':
            pitcher.popups++;
            pitcher.outs++;
            break;
        case 'flyball':
            pitcher.flyballs++;
            pitcher.outs++;
            break;
        case 'groundball':
            pitcher.groundballs++;
            pitcher.outs++;
            break;
        case 'walk':
            pitcher.walks++;
            break;
        case 'single':
            pitcher.singles++;
            break;
        case 'singleplus':
            pitcher.singlepluses++;
            break;
        case 'double':
            pitcher.doubles++;
            break;
        case 'triple':
            pitcher.triples++;
            break;
        case 'homeRun':
            pitcher.homeruns++;
            break;
    }

    if (pitcher.outs % 3 === 0) {
        const inningsPitched = pitcher.outs / 3;
        pitcher.whip = (pitcher.walks + pitcher.singles + pitcher.singlepluses + pitcher.doubles + pitcher.triples + pitcher.homeruns) / inningsPitched;
    }
    if (pitcher.outs % 3 === 0) {
        const inningsPitched = pitcher.outs / 3;
        const weightWalk = .69
        const weightSingle = .88;
        const weightSinglePlus = 1.08;
        const weightDouble = 1.24;
        const weightTriple = 1.56;
        const weightHR = 1.95;
        pitcher.mWHIP = (pitcher.walks * weightWalk + weightSingle * pitcher.singles + weightSinglePlus * pitcher.singlepluses + weightDouble * pitcher.doubles +
            weightTriple * pitcher.triples + weightHR * pitcher.homeruns) / inningsPitched;
    }
}

function calculateStats(stats) {
    const atBats = stats.atBats - stats.walks;
    const battingAverage = atBats === 0 ? 0 : stats.hits / atBats;
    const onBasePercentage = stats.atBats === 0 ? 0 : (stats.hits + stats.walks) / stats.atBats;
    const sluggingPercentage = atBats === 0 ? 0 : (stats.hits + (1.5 * stats.singleplus) + (2 * stats.doubles) + (3 * stats.triples) + (4 * stats.homeRuns)) / atBats;
    const woba = ((0.69 * stats.walks) + (0.88 * (stats.hits - stats.doubles - stats.triples - stats.homeRuns - stats.singleplus)) + (1.24 * stats.doubles) + (1.56 * stats.triples) + (1.95 * stats.homeRuns) + (1.08 * stats.singleplus)) / (atBats + stats.walks);
    const { iconCounts, useIconThisAtBat, ...exportStats } = stats;
    return {
        ...exportStats,
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        ops: onBasePercentage + sluggingPercentage,
        woba
    };
}

exportToExcel(hittersResults, pitchersResults, 'results.xlsx');