/**
 * MLB Showdown Game Engine — Server version
 * Pure functions: (state, action) => newState
 */

// ============================================================================
// CHART RESOLUTION
// ============================================================================

function parseRange(range) {
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

function resolveChart(chart, roll, isHitter) {
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

function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

// ============================================================================
// GAME STATE
// ============================================================================

export function initializeGame(homeLineupData, awayLineupData, homeUserId, awayUserId) {
    return {
        inning: 1,
        halfInning: 'top',
        outs: 0,
        bases: { first: null, second: null, third: null },
        score: { home: 0, away: 0 },
        homeTeam: buildTeam(homeLineupData, homeUserId),
        awayTeam: buildTeam(awayLineupData, awayUserId),
        phase: 'pitch',
        lastPitchRoll: 0,
        lastPitchTotal: 0,
        lastSwingRoll: 0,
        lastOutcome: null,
        usedPitcherChart: false,
        gameLog: ['⚾ Play ball!'],
        isOver: false,
        winnerId: null,
    };
}

function buildTeam(data, userId) {
    const slots = data.slots || [];

    const batters = slots
        .filter(s => s.battingOrder != null && s.card.type === 'hitter')
        .sort((a, b) => a.battingOrder - b.battingOrder)
        .map(s => toPlayer(s));

    if (batters.length === 0) {
        slots.filter(s => s.card.type === 'hitter' && s.assignedPosition !== 'bench')
            .forEach(s => batters.push(toPlayer(s)));
    }

    const starterSlot = slots.find(s => s.card.type === 'pitcher' && s.assignedPosition?.startsWith('Starter'))
        || slots.find(s => s.card.type === 'pitcher');

    const pitcher = starterSlot ? toPlayer(starterSlot) : {
        cardId: 'default', name: 'Pitcher', onBase: 0, speed: 8,
        chart: { PU:'1', SO:'2-7', GB:'8-12', FB:'13-16', W:'17-18', S:'19-20' },
        icons: [], imagePath: '', type: 'pitcher', control: 4, ip: 7,
    };

    while (batters.length < 9) {
        batters.push(batters[batters.length - 1] || {
            cardId: 'empty', name: 'Empty', onBase: 8, speed: 10,
            chart: { SO:'1-10', GB:'11-15', FB:'16-18', W:'19', S:'20' },
            icons: [], imagePath: '', type: 'hitter',
        });
    }

    return { userId, lineup: batters.slice(0, 9), pitcher, currentBatterIndex: 0, runsPerInning: [0] };
}

function toPlayer(slot) {
    const c = slot.card;
    return {
        cardId: c.id || c.name, name: c.name, onBase: c.onBase || 0, speed: c.speed || 8,
        chart: c.chart || {}, icons: c.icons || [], imagePath: c.imagePath || '',
        type: c.type, control: c.control, ip: c.ip, role: c.role,
    };
}

// ============================================================================
// PROCESS ACTION
// ============================================================================

export function processAction(state, action) {
    if (state.isOver) return state;
    if (action.type === 'ROLL_PITCH') return handlePitch(state);
    if (action.type === 'ROLL_SWING') return handleSwing(state);
    return state;
}

/**
 * Determine whose turn it is.
 * Returns 'home' or 'away'.
 */
export function whoseTurn(state) {
    if (state.isOver) return null;
    if (state.phase === 'pitch') {
        // Defense rolls the pitch
        return state.halfInning === 'top' ? 'home' : 'away';
    }
    if (state.phase === 'swing') {
        // Offense rolls the swing
        return state.halfInning === 'top' ? 'away' : 'home';
    }
    return null;
}

function handlePitch(state) {
    if (state.phase !== 'pitch') return state;

    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const roll = rollD20();
    const control = pitcher.control || 0;
    const total = roll + control;
    const usePitcherChart = total > batter.onBase;
    const chartOwner = usePitcherChart ? pitcher.name : batter.name;

    return {
        ...state,
        phase: 'swing',
        lastPitchRoll: roll,
        lastPitchTotal: total,
        usedPitcherChart: usePitcherChart,
        lastOutcome: null,
        lastSwingRoll: 0,
        gameLog: [...state.gameLog, `${batter.name} vs ${pitcher.name}`, `Pitch: ${roll} + ${control} = ${total} vs OB ${batter.onBase} → ${chartOwner}'s chart`],
    };
}

function handleSwing(state) {
    if (state.phase !== 'swing') return state;

    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const roll = rollD20();
    const chart = state.usedPitcherChart ? pitcher.chart : batter.chart;
    const outcome = resolveChart(chart, roll, !state.usedPitcherChart);

    const names = { SO:'Strikeout', GB:'Ground Ball Out', FB:'Fly Ball Out', PU:'Popup Out',
        W:'Walk', S:'Single', SPlus:'Single+', DB:'Double', TR:'Triple', HR:'HOME RUN' };

    let newState = {
        ...state,
        lastSwingRoll: roll,
        lastOutcome: outcome,
        gameLog: [...state.gameLog, `Swing: ${roll} → ${names[outcome] || outcome}`],
    };

    return applyResult(newState, outcome, batter.cardId);
}

// ============================================================================
// BASERUNNING
// ============================================================================

function applyResult(state, outcome, batterId) {
    const bases = { ...state.bases };
    let outs = state.outs;
    let runs = 0;
    const logs = [];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    switch (outcome) {
        case 'SO': case 'PU': case 'GB': case 'FB':
            outs++;
            break;
        case 'W':
            if (bases.first) {
                if (bases.second) {
                    if (bases.third) { runs++; logs.push('Runner scores on walk'); }
                    bases.third = bases.second;
                }
                bases.second = bases.first;
            }
            bases.first = batterId;
            break;
        case 'S': case 'SPlus':
            if (bases.third) { runs++; logs.push('Runner scores from third'); }
            bases.third = bases.second || null;
            bases.second = bases.first || null;
            bases.first = batterId;
            break;
        case 'DB':
            if (bases.third) runs++;
            if (bases.second) runs++;
            bases.third = bases.first || null;
            bases.second = batterId;
            bases.first = null;
            break;
        case 'TR':
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            bases.third = batterId;
            bases.second = null;
            bases.first = null;
            break;
        case 'HR':
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            runs++;
            if (runs > 1) logs.push(`${runs}-run homer!`);
            else logs.push('Solo home run!');
            bases.first = null; bases.second = null; bases.third = null;
            break;
    }

    const newScore = { ...state.score };
    newScore[side] += runs;

    // Update team runs per inning
    const battingTeam = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    let newState = { ...state, bases, outs, score: newScore, gameLog: [...state.gameLog, ...logs] };
    if (state.halfInning === 'top') newState.awayTeam = battingTeam;
    else newState.homeTeam = battingTeam;

    if (outs >= 3) return endHalfInning(newState);

    // Walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return { ...newState, phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, '🎉 Walk-off! Home team wins!'] };
    }

    return advanceBatter(newState);
}

function advanceBatter(state) {
    const team = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    team.currentBatterIndex = (team.currentBatterIndex + 1) % 9;
    let s = { ...state, phase: 'pitch' };
    if (state.halfInning === 'top') s.awayTeam = team; else s.homeTeam = team;
    return s;
}

function endHalfInning(state) {
    // Advance batter index for next time this team bats
    const team = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    team.currentBatterIndex = (team.currentBatterIndex + 1) % 9;
    let s = { ...state };
    if (state.halfInning === 'top') s.awayTeam = team; else s.homeTeam = team;

    if (state.halfInning === 'top') {
        return { ...s, halfInning: 'bottom', outs: 0, bases: { first: null, second: null, third: null },
            phase: 'pitch', lastOutcome: null, gameLog: [...s.gameLog, `--- Bottom of ${state.inning} ---`] };
    }

    // End of full inning
    if (state.inning >= 9 && state.score.home !== state.score.away) {
        const winner = state.score.home > state.score.away ? state.homeTeam.userId : state.awayTeam.userId;
        return { ...s, phase: 'game_over', isOver: true, winnerId: winner,
            gameLog: [...s.gameLog, `Game Over! ${state.score.away}-${state.score.home}`] };
    }

    // Ensure runs arrays exist for next inning
    const away = { ...s.awayTeam, runsPerInning: [...s.awayTeam.runsPerInning] };
    const home = { ...s.homeTeam, runsPerInning: [...s.homeTeam.runsPerInning] };
    while (away.runsPerInning.length < state.inning + 1) away.runsPerInning.push(0);
    while (home.runsPerInning.length < state.inning + 1) home.runsPerInning.push(0);

    return { ...s, awayTeam: away, homeTeam: home, inning: state.inning + 1, halfInning: 'top',
        outs: 0, bases: { first: null, second: null, third: null }, phase: 'pitch', lastOutcome: null,
        gameLog: [...s.gameLog, `--- Top of ${state.inning + 1} ---`] };
}

// ============================================================================
// HELPERS
// ============================================================================

export function getCurrentBatter(state) {
    const team = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    return team.lineup[team.currentBatterIndex];
}

export function getCurrentPitcher(state) {
    const team = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    return team.pitcher;
}
