/**
 * MLB Showdown Game Engine — Minimal Working Version
 *
 * Flow: pitch → swing → result → next batter
 * Basic baserunning, no icons, no substitutions, no DP, no extra bases.
 */
import type { HitterCard, PitcherCard } from '../types/cards';

// ============================================================================
// TYPES
// ============================================================================

export type Outcome = 'SO' | 'GB' | 'FB' | 'PU' | 'W' | 'S' | 'SPlus' | 'DB' | 'TR' | 'HR';

export type Phase = 'pitch' | 'swing' | 'game_over';

export interface BaseState {
    first: string | null;
    second: string | null;
    third: string | null;
}

export interface PlayerSlot {
    cardId: string;
    name: string;
    onBase: number;
    speed: number;
    chart: any;
    icons: string[];
    imagePath: string;
    type: 'hitter' | 'pitcher';
    control?: number;
    ip?: number;
    role?: string;
}

export interface TeamState {
    userId: string;
    lineup: PlayerSlot[];       // 9 batters in order
    pitcher: PlayerSlot;        // active pitcher
    bullpen: PlayerSlot[];      // available relievers/closers
    bench: PlayerSlot[];        // bench players
    currentBatterIndex: number;
    runsPerInning: number[];
    hits: number;
}

export interface GameState {
    inning: number;
    halfInning: 'top' | 'bottom';
    outs: number;
    bases: BaseState;
    score: { home: number; away: number };
    homeTeam: TeamState;
    awayTeam: TeamState;
    phase: Phase;
    lastPitchRoll: number;
    lastPitchTotal: number;
    lastSwingRoll: number;
    lastOutcome: Outcome | null;
    usedPitcherChart: boolean;
    gameLog: string[];
    isOver: boolean;
    winnerId: string | null;
}

export type GameAction =
    | { type: 'ROLL_PITCH'; roll: number }
    | { type: 'ROLL_SWING'; roll: number };

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeGameState(
    homeLineupData: any,
    awayLineupData: any,
    homeUserId: string,
    awayUserId: string,
): GameState {
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

function buildTeam(data: any, userId: string): TeamState {
    const slots = data.slots || [];

    // Extract batters (those with battingOrder) sorted by order
    const batters = slots
        .filter((s: any) => s.battingOrder != null && s.card.type === 'hitter')
        .sort((a: any, b: any) => a.battingOrder - b.battingOrder)
        .map((s: any) => slotToPlayer(s));

    // If no batting order set, use all hitters in slot order
    if (batters.length === 0) {
        const allHitters = slots
            .filter((s: any) => s.card.type === 'hitter' && s.assignedPosition !== 'bench')
            .map((s: any) => slotToPlayer(s));
        batters.push(...allHitters);
    }

    // Get first starter (SP1)
    const starterSlot = slots.find((s: any) =>
        s.card.type === 'pitcher' && s.assignedPosition === 'Starter-1'
    ) || slots.find((s: any) =>
        s.card.type === 'pitcher' && s.assignedPosition?.startsWith('Starter')
    ) || slots.find((s: any) => s.card.type === 'pitcher');

    const pitcher = starterSlot ? slotToPlayer(starterSlot) : {
        cardId: 'default-pitcher', name: 'Pitcher', onBase: 0, speed: 8,
        chart: { PU: '1', SO: '2-7', GB: '8-12', FB: '13-16', W: '17-18', S: '19-20' },
        icons: [], imagePath: '', type: 'pitcher' as const, control: 4, ip: 7,
    };

    // Bullpen: relievers + closers + other starters (not the active one)
    const bullpen = slots
        .filter((s: any) => s.card.type === 'pitcher' && s !== starterSlot)
        .map((s: any) => slotToPlayer(s));

    // Bench: hitters assigned to bench
    const bench = slots
        .filter((s: any) => s.assignedPosition === 'bench' && s.card.type === 'hitter')
        .map((s: any) => slotToPlayer(s));

    return {
        userId,
        lineup: batters.length >= 9 ? batters.slice(0, 9) : padLineup(batters),
        pitcher,
        bullpen,
        bench,
        currentBatterIndex: 0,
        runsPerInning: [0],
        hits: 0,
    };
}

function slotToPlayer(slot: any): PlayerSlot {
    const card = slot.card;
    return {
        cardId: card.id || card.name,
        name: card.name,
        onBase: card.onBase || 0,
        speed: card.speed || 8,
        chart: card.chart || {},
        icons: card.icons || [],
        imagePath: card.imagePath || '',
        type: card.type,
        control: card.control,
        ip: card.ip,
        role: card.role,
    };
}

function padLineup(batters: PlayerSlot[]): PlayerSlot[] {
    // Pad to 9 if needed by repeating
    while (batters.length < 9) {
        batters.push(batters[batters.length - 1] || {
            cardId: 'empty', name: 'Empty', onBase: 8, speed: 10,
            chart: { SO: '1-10', GB: '11-15', FB: '16-18', W: '19', S: '20' },
            icons: [], imagePath: '', type: 'hitter',
        });
    }
    return batters;
}

// ============================================================================
// CHART RESOLUTION
// ============================================================================

function parseRange(range: string | null): { low: number; high: number } | null {
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

function resolveChart(chart: any, roll: number, isHitter: boolean): Outcome {
    const fields = isHitter
        ? [['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['SPlus','SPlus'],['DB','DB'],['TR','TR']]
        : [['PU','PU'],['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['DB','DB']];

    for (const [field, outcome] of fields) {
        const range = parseRange(chart[field]);
        if (range && roll >= range.low && roll <= range.high) {
            return outcome as Outcome;
        }
    }

    // HR check
    const hrRange = parseRange(chart.HR);
    if (hrRange && roll >= hrRange.low) return 'HR';

    return 'FB'; // fallback
}

// ============================================================================
// PROCESS ACTION
// ============================================================================

export function processAction(state: GameState, action: GameAction): GameState {
    if (state.isOver) return state;

    switch (action.type) {
        case 'ROLL_PITCH':
            return handlePitch(state, action.roll);
        case 'ROLL_SWING':
            return handleSwing(state, action.roll);
        default:
            return state;
    }
}

function handlePitch(state: GameState, roll: number): GameState {
    if (state.phase !== 'pitch') return state;

    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const control = pitcher.control || 0;
    const total = roll + control;
    const usePitcherChart = total > batter.onBase;

    const chartOwner = usePitcherChart ? pitcher.name : batter.name;
    const log = `Pitch: ${roll} + ${control} = ${total} vs OB ${batter.onBase} → ${chartOwner}'s chart`;

    return {
        ...state,
        phase: 'swing',
        lastPitchRoll: roll,
        lastPitchTotal: total,
        usedPitcherChart: usePitcherChart,
        lastOutcome: null,
        lastSwingRoll: 0,
        gameLog: [...state.gameLog, `${batter.name} vs ${pitcher.name}`, log],
    };
}

function handleSwing(state: GameState, roll: number): GameState {
    if (state.phase !== 'swing') return state;

    const fieldingTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    const battingTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const chart = state.usedPitcherChart ? pitcher.chart : batter.chart;
    const outcome = resolveChart(chart, roll, !state.usedPitcherChart);

    const outcomeNames: Record<Outcome, string> = {
        SO: 'Strikeout', GB: 'Ground Ball Out', FB: 'Fly Ball Out', PU: 'Popup Out',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double', TR: 'Triple', HR: 'HOME RUN',
    };

    const log = `Swing: ${roll} → ${outcomeNames[outcome]}`;

    // Apply result
    let newState: GameState = {
        ...state,
        lastSwingRoll: roll,
        lastOutcome: outcome as Outcome | null,
        gameLog: [...state.gameLog, log],
    };

    newState = applyResult(newState, outcome, batter.cardId);

    return newState;
}

// ============================================================================
// BASERUNNING (Simple)
// ============================================================================

function applyResult(state: GameState, outcome: Outcome, batterId: string): GameState {
    const bases = { ...state.bases };
    let outs = state.outs;
    let runs = 0;
    const logs: string[] = [];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    switch (outcome) {
        case 'SO':
        case 'PU':
            outs++;
            break;

        case 'GB':
        case 'FB':
            outs++;
            break;

        case 'W': {
            // Walk: force advancement
            if (bases.first) {
                if (bases.second) {
                    if (bases.third) {
                        runs++;
                        logs.push('Runner scores on walk');
                    }
                    bases.third = bases.second;
                }
                bases.second = bases.first;
            }
            bases.first = batterId;
            break;
        }

        case 'S':
        case 'SPlus': {
            // Single: runners advance 1
            if (bases.third) { runs++; logs.push('Runner scores from third'); }
            if (bases.second) { bases.third = bases.second; }
            else { bases.third = null; }
            if (bases.first) { bases.second = bases.first; }
            else { bases.second = null; }
            bases.first = batterId;
            break;
        }

        case 'DB': {
            // Double: runners advance 2
            if (bases.third) { runs++; }
            if (bases.second) { runs++; }
            if (bases.first) { bases.third = bases.first; }
            else { bases.third = null; }
            bases.second = batterId;
            bases.first = null;
            break;
        }

        case 'TR': {
            // Triple: all runners score
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            bases.third = batterId;
            bases.second = null;
            bases.first = null;
            break;
        }

        case 'HR': {
            // Home run: everyone scores
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            runs++; // batter
            bases.first = null;
            bases.second = null;
            bases.third = null;
            if (runs > 1) logs.push(`${runs}-run homer!`);
            else logs.push('Solo home run!');
            break;
        }
    }

    // Track hits
    const isHit = ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(outcome);

    // Update score
    const newScore = { ...state.score };
    newScore[side] += runs;

    // Update team runs per inning + hits
    const battingTeam = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;
    if (isHit) battingTeam.hits = (battingTeam.hits || 0) + 1;

    let newState: GameState = {
        ...state,
        bases,
        outs,
        score: newScore,
        gameLog: [...state.gameLog, ...logs],
    };

    // Put updated team back
    if (state.halfInning === 'top') {
        newState.awayTeam = battingTeam;
    } else {
        newState.homeTeam = battingTeam;
    }

    // Check 3 outs
    if (outs >= 3) {
        return endHalfInning(newState);
    }

    // Check walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState,
            phase: 'game_over',
            isOver: true,
            winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, '🎉 Walk-off! Home team wins!'],
        };
    }

    // Advance to next batter
    return advanceToNextBatter(newState);
}

function advanceToNextBatter(state: GameState): GameState {
    const battingTeam = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % 9;

    let newState = { ...state, phase: 'pitch' as Phase };
    if (state.halfInning === 'top') {
        newState.awayTeam = battingTeam;
    } else {
        newState.homeTeam = battingTeam;
    }
    return newState;
}

function endHalfInning(state: GameState): GameState {
    // Advance batting team's batter index
    const battingTeam = state.halfInning === 'top' ? { ...state.awayTeam } : { ...state.homeTeam };
    battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % 9;

    let newState = { ...state };
    if (state.halfInning === 'top') {
        newState.awayTeam = battingTeam;
    } else {
        newState.homeTeam = battingTeam;
    }

    if (state.halfInning === 'top') {
        // Bottom of inning
        return {
            ...newState,
            halfInning: 'bottom',
            outs: 0,
            bases: { first: null, second: null, third: null },
            phase: 'pitch',
            lastOutcome: null,
            gameLog: [...newState.gameLog, `--- Bottom of ${state.inning} ---`],
        };
    } else {
        // End of full inning
        if (state.inning >= 9 && state.score.home !== state.score.away) {
            const winner = state.score.home > state.score.away ? state.homeTeam.userId : state.awayTeam.userId;
            return {
                ...newState,
                phase: 'game_over',
                isOver: true,
                winnerId: winner,
                gameLog: [...newState.gameLog, `Game Over! ${state.score.away}-${state.score.home}`],
            };
        }

        // Ensure away team has runs array for next inning
        const away = { ...newState.awayTeam, runsPerInning: [...newState.awayTeam.runsPerInning] };
        while (away.runsPerInning.length < state.inning + 1) away.runsPerInning.push(0);
        const home = { ...newState.homeTeam, runsPerInning: [...newState.homeTeam.runsPerInning] };
        while (home.runsPerInning.length < state.inning + 1) home.runsPerInning.push(0);

        return {
            ...newState,
            awayTeam: away,
            homeTeam: home,
            inning: state.inning + 1,
            halfInning: 'top',
            outs: 0,
            bases: { first: null, second: null, third: null },
            phase: 'pitch',
            lastOutcome: null,
            gameLog: [...newState.gameLog, `--- Top of ${state.inning + 1} ---`],
        };
    }
}

// ============================================================================
// HELPERS
// ============================================================================

export function whoseTurn(state: GameState): 'home' | 'away' {
    // Home team always acts as host and rolls for both
    return 'home';
}

export function getCurrentBatter(state: GameState): PlayerSlot {
    const team = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    return team.lineup[team.currentBatterIndex];
}

export function getCurrentPitcher(state: GameState): PlayerSlot {
    const team = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    return team.pitcher;
}
