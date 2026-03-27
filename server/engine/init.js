/**
 * Game state initialization.
 */

import { rollD20 } from './dice.js';
import { getFieldingFromSlot, computeFieldingTotals } from './fielding.js';

/**
 * @param seriesContext Optional: { gameNumber, homeStarterOffset, awayStarterOffset, relieverHistory }
 *   - gameNumber: which game in the series (1-indexed)
 *   - homeStarterOffset / awayStarterOffset: SP number from game 1 roll (1-4)
 *   - relieverHistory: { home: { cardId: [gameNums...] }, away: { ... } }
 */
export function initializeGame(homeLineupData, awayLineupData, homeUserId, awayUserId, seriesContext) {
    const homeTeam = buildTeam(homeLineupData, homeUserId);
    const awayTeam = buildTeam(awayLineupData, awayUserId);

    const logs = [];
    let startPhase = 'sp_roll'; // default: wait for SP roll button
    let spRollResult = null;

    if (seriesContext && seriesContext.gameNumber > 1) {
        // Series game 2+: auto-select starters based on rotation
        const homeSpNum = ((seriesContext.homeStarterOffset + seriesContext.gameNumber - 2) % 4) + 1;
        const awaySpNum = ((seriesContext.awayStarterOffset + seriesContext.gameNumber - 2) % 4) + 1;
        selectStarter(homeTeam, homeSpNum);
        selectStarter(awayTeam, awaySpNum);
        logs.push(`Series Game ${seriesContext.gameNumber}`);
        logs.push(`Home: ${homeTeam.pitcher.name} (SP${homeSpNum})`);
        logs.push(`Away: ${awayTeam.pitcher.name} (SP${awaySpNum})`);
        logs.push('Play ball!');
        startPhase = 'pre_atbat';

        // Apply reliever fatigue
        if (seriesContext.relieverHistory) {
            applyRelieverFatigue(homeTeam, seriesContext.relieverHistory.home, seriesContext.gameNumber);
            applyRelieverFatigue(awayTeam, seriesContext.relieverHistory.away, seriesContext.gameNumber);
        }
    } else {
        // Game 1 or single game: wait for ROLL_STARTERS button
        logs.push('Roll for starting pitchers!');
    }

    return {
        inning: 1,
        halfInning: 'top',
        outs: 0,
        bases: { first: null, second: null, third: null },
        score: { home: 0, away: 0 },
        homeTeam,
        awayTeam,
        phase: startPhase,
        subPhaseStep: startPhase === 'pre_atbat' ? 'offense_first' : null,
        lastPitchRoll: 0,
        lastPitchTotal: 0,
        lastSwingRoll: 0,
        lastOutcome: null,
        usedPitcherChart: false,
        gameLog: logs,
        isOver: false,
        winnerId: null,
        fatiguePenalty: 0,
        controlModifier: 0,
        pendingDpResult: null,
        extraBaseEligible: null,
        pendingExtraBaseResult: null,
        iconPrompt: null,
        halfInningClean: true,
        icon20UsedThisInning: false,
        rpActiveInning: null,
        gbOptions: null,
        pendingSteal: null,
        pendingStealResult: null,
        outsBeforeSwing: 0,
        spRoll: spRollResult,
        lastRoll: null,
        lastRollType: null,
    };
}

/**
 * Handle ROLL_STARTERS action: roll d20 for starting pitchers.
 */
export function handleRollStarters(state) {
    if (state.phase !== 'sp_roll') return state;

    const spRoll = rollD20();
    const spNum = Math.min(4, Math.ceil(spRoll / 5));

    const homeTeam = { ...state.homeTeam };
    const awayTeam = { ...state.awayTeam };
    selectStarter(homeTeam, spNum);
    selectStarter(awayTeam, spNum);

    const logs = [
        ...state.gameLog,
        `Starting pitcher roll: d20(${spRoll}) = SP${spNum}`,
        `Home: ${homeTeam.pitcher.name}`,
        `Away: ${awayTeam.pitcher.name}`,
        'Play ball!',
    ];

    return {
        ...state,
        homeTeam,
        awayTeam,
        phase: 'pre_atbat',
        subPhaseStep: 'offense_first',
        gameLog: logs,
        spRoll: spRoll,
        lastRoll: spRoll,
        lastRollType: 'sp',
    };
}

/**
 * Select the Nth starter (1-4) as the active pitcher.
 * Remaining starters stay in bullpen (but can't be used as relievers).
 */
function selectStarter(team, spNum) {
    // Find all starters sorted by their slot number
    const starters = [];
    const nonStarters = [];
    for (const p of [team.pitcher, ...team.bullpen]) {
        if (p.assignedPosition?.startsWith('Starter')) {
            starters.push(p);
        } else {
            nonStarters.push(p);
        }
    }

    // Sort starters by their number (Starter-1, Starter-2, etc.)
    starters.sort((a, b) => {
        const numA = parseInt(a.assignedPosition?.split('-')[1] || '1');
        const numB = parseInt(b.assignedPosition?.split('-')[1] || '1');
        return numA - numB;
    });

    // Pick the selected starter (1-indexed, clamped to available)
    const idx = Math.min(spNum - 1, starters.length - 1);
    const selected = starters[idx] || team.pitcher;

    // Set as active pitcher
    team.pitcher = selected;

    // All other pitchers (starters + relievers/closers) go to bullpen
    team.bullpen = [...starters.filter(s => s !== selected), ...nonStarters];

    // Re-init pitcher stats
    team.pitcherStats[selected.cardId] = team.pitcherStats[selected.cardId] || { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
}

/**
 * Apply reliever fatigue for series games.
 * If a reliever/closer pitched in the last 2 consecutive games, their IP starts at 0.
 */
function applyRelieverFatigue(team, history, currentGameNum) {
    if (!history) return;
    for (const p of team.bullpen) {
        if (p.role === 'Starter') continue; // starters don't get fatigued this way
        const gamesPlayed = history[p.cardId] || [];
        // Check if pitched in both of the last 2 games
        const pitchedLastGame = gamesPlayed.includes(currentGameNum - 1);
        const pitchedTwoGamesAgo = gamesPlayed.includes(currentGameNum - 2);
        if (pitchedLastGame && pitchedTwoGamesAgo) {
            // IP starts at 0 — set inningsPitched to equal their IP rating so fatigue kicks in immediately
            // We mark this on the player so the engine knows
            p.fatigued = true;
        }
    }
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

    // Initially pick Starter-1 (will be overridden by selectStarter)
    const starterSlot = slots.find(s => s.card.type === 'pitcher' && s.assignedPosition === 'Starter-1')
        || slots.find(s => s.card.type === 'pitcher' && s.assignedPosition?.startsWith('Starter'))
        || slots.find(s => s.card.type === 'pitcher');

    const pitcher = starterSlot ? toPlayer(starterSlot) : {
        cardId: 'default', name: 'Pitcher', onBase: 0, speed: 8,
        chart: { PU: '1', SO: '2-7', GB: '8-12', FB: '13-16', W: '17-18', S: '19-20' },
        icons: [], imagePath: '', type: 'pitcher', control: 4, ip: 7,
        assignedPosition: 'Starter-1', fielding: 0, arm: 0, isBackup: false,
    };

    const bullpen = slots
        .filter(s => s.card.type === 'pitcher' && s !== starterSlot)
        .map(s => toPlayer(s));

    const bench = slots
        .filter(s => s.assignedPosition === 'bench' && s.card.type === 'hitter')
        .map(s => toPlayer(s));

    while (batters.length < 9) {
        batters.push(batters[batters.length - 1] || {
            cardId: 'empty', name: 'Empty', onBase: 8, speed: 10,
            chart: { SO: '1-10', GB: '11-15', FB: '16-18', W: '19', S: '20' },
            icons: [], imagePath: '', type: 'hitter',
            assignedPosition: 'DH', fielding: 0, arm: 0, isBackup: false,
        });
    }

    const lineup = batters.slice(0, 9);
    const { totalInfieldFielding, totalOutfieldFielding, catcherArm } = computeFieldingTotals(lineup);

    // Initialize per-player stats
    const batterStats = {};
    for (const b of lineup) {
        batterStats[b.cardId] = { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hr: 0, sb: 0, cs: 0 };
    }
    const pitcherStats = {};
    pitcherStats[pitcher.cardId] = { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
    for (const p of bullpen) {
        pitcherStats[p.cardId] = { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
    }

    return {
        userId, lineup, pitcher, bullpen, bench,
        currentBatterIndex: 0, runsPerInning: [0], hits: 0,
        usedPlayers: [], iconUsage: {},
        inningsPitched: 0, pitcherEntryInning: 1,
        totalInfieldFielding, totalOutfieldFielding, catcherArm,
        batterStats, pitcherStats,
    };
}

function toPlayer(slot) {
    const c = slot.card;
    const assignedPos = slot.assignedPosition || '';
    const rawFielding = getFieldingFromSlot(c.positions || [], assignedPos);
    const normalizedPos = assignedPos.replace(/-\d+$/, '');
    const isCatcher = normalizedPos === 'C';
    return {
        cardId: c.id || c.name, name: c.name, onBase: c.onBase || 0, speed: c.speed || 8,
        chart: c.chart || {}, icons: c.icons || [], imagePath: c.imagePath || '',
        type: c.type, control: c.control, ip: c.ip, role: c.role,
        assignedPosition: assignedPos,
        fielding: isCatcher ? 0 : rawFielding,
        arm: isCatcher ? rawFielding : 0,
        isBackup: !!slot.isBackup,
    };
}
