/**
 * Dice rolling and chart resolution helpers.
 */

export function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

export function parseRange(range) {
    if (!range) return null;
    if (range.includes('-')) {
        const [low, high] = range.split('-').map(Number);
        if (high < low) return { low, high: low };
        return { low, high };
    }
    if (range.includes('+')) {
        return { low: parseInt(range.split('+')[0]), high: 99 };
    }
    const num = Number(range);
    if (isNaN(num)) return null;
    return { low: num, high: num };
}

export function resolveChart(chart, roll, isHitter) {
    const fields = isHitter
        ? [['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['SPlus','SPlus'],['DB','DB'],['TR','TR']]
        : [['PU','PU'],['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['DB','DB']];
    for (const [field, outcome] of fields) {
        const range = parseRange(chart[field]);
        if (range && roll >= range.low && roll <= range.high) return outcome;
    }
    const hrRange = parseRange(chart.HR);
    if (hrRange && roll >= hrRange.low) return 'HR';
    return 'FB';
}
