/**
 * Game state initialization.
 */

import { rollD20 } from './dice.js';
import { getFieldingFromSlot, computeFieldingTotals } from './fielding.js';

export function initializeGame(homeLineupData, awayLineupData, homeUserId, awayUserId) {
    const homeTeam = buildTeam(homeLineupData, homeUserId);
    const awayTeam = buildTeam(awayLineupData, awayUserId);

    // Roll for starting pitchers: 1-5=SP1, 6-10=SP2, 11-15=SP3, 16-20=SP4
    const homeSpRoll = rollD20();
    const awaySpRoll = rollD20();
    const homeSpNum = Math.min(4, Math.ceil(homeSpRoll / 5));
    const awaySpNum = Math.min(4, Math.ceil(awaySpRoll / 5));

    selectStarter(homeTeam, homeSpNum);
    selectStarter(awayTeam, awaySpNum);

    const logs = [
        `Starting pitcher roll: Home d20(${homeSpRoll}) = SP${homeSpNum} ${homeTeam.pitcher.name}`,
        `Starting pitcher roll: Away d20(${awaySpRoll}) = SP${awaySpNum} ${awayTeam.pitcher.name}`,
        'Play ball!',
    ];

    return {
        inning: 1,
        halfInning: 'top',
        outs: 0,
        bases: { first: null, second: null, third: null },
        score: { home: 0, away: 0 },
        homeTeam,
        awayTeam,
        phase: 'pre_atbat',
        subPhaseStep: 'offense_first',
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
    team.pitcherStats[selected.cardId] = team.pitcherStats[selected.cardId] || { ip: 0, h: 0, r: 0, bb: 0, so: 0, hr: 0, bf: 0 };
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
        batterStats[b.cardId] = { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, sb: 0, cs: 0 };
    }
    const pitcherStats = {};
    pitcherStats[pitcher.cardId] = { ip: 0, h: 0, r: 0, bb: 0, so: 0, hr: 0, bf: 0 };
    for (const p of bullpen) {
        pitcherStats[p.cardId] = { ip: 0, h: 0, r: 0, bb: 0, so: 0, hr: 0, bf: 0 };
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
