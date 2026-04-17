/**
 * MLB Showdown simulator — core engine (browser-compatible ES module port of simulation/sim.js).
 *
 * Runs every hitter against every pitcher for N at-bats each, tracking outcomes
 * and stats. The parent (Web Worker) is responsible for orchestrating calls and
 * reporting progress.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RawHitter {
    '#': number;
    Name: string;
    Ed: string;
    Team: string;
    Points: number;
    'Yr.': string;
    onBase: number;
    Speed: number;
    Position: string;
    H: string;
    Icons: string | null;
    SO: string | null; GB: string | null; FB: string | null; W: string | null;
    S: string | null; SPlus: string | null; DB: string | null; TR: string | null; HR: string | null;
    expansion?: string;
    imagePath?: string;
}

export interface RawPitcher {
    '#': number;
    Name: string;
    Ed: string;
    Team: string;
    Points: number;
    'Yr.': string;
    Control: number;
    IP?: number;
    Position: string;
    H: string;
    Icons: string | null;
    PU: string | null; SO: string | null; GB: string | null; FB: string | null;
    W: string | null; S: string | null; DB: string | null; HR: string | null;
    expansion?: string;
    imagePath?: string;
}

export interface Range { low: number; high: number }

export interface SimConfig {
    AT_BATS_PER_MATCHUP: number;
    SEED: string | null;
    WEIGHTS: {
        walk: number; single: number; singlePlus: number;
        double: number; triple: number; hr: number;
    };
}

export const DEFAULT_CONFIG: SimConfig = {
    AT_BATS_PER_MATCHUP: 100,
    SEED: null,
    WEIGHTS: {
        walk: 0.69,
        single: 0.88,
        singlePlus: 1.08,
        double: 1.24,
        triple: 1.56,
        hr: 1.95,
    },
};

// ============================================================================
// OUTCOME CONSTANTS
// ============================================================================

export const OUTCOME = {
    STRIKEOUT: 'strikeout',
    GROUNDBALL: 'groundball',
    FLYBALL: 'flyball',
    POPUP: 'popup',
    WALK: 'walk',
    SINGLE: 'single',
    SINGLEPLUS: 'singleplus',
    DOUBLE: 'double',
    TRIPLE: 'triple',
    HOMERUN: 'homeRun',
} as const;

export type OutcomeName = typeof OUTCOME[keyof typeof OUTCOME];

const HITTER_CHART_FIELDS: { field: string; outcome: OutcomeName }[] = [
    { field: 'SO', outcome: OUTCOME.STRIKEOUT },
    { field: 'GB', outcome: OUTCOME.GROUNDBALL },
    { field: 'FB', outcome: OUTCOME.FLYBALL },
    { field: 'W', outcome: OUTCOME.WALK },
    { field: 'S', outcome: OUTCOME.SINGLE },
    { field: 'SPlus', outcome: OUTCOME.SINGLEPLUS },
    { field: 'DB', outcome: OUTCOME.DOUBLE },
    { field: 'TR', outcome: OUTCOME.TRIPLE },
];

const PITCHER_CHART_FIELDS: { field: string; outcome: OutcomeName }[] = [
    { field: 'PU', outcome: OUTCOME.POPUP },
    { field: 'SO', outcome: OUTCOME.STRIKEOUT },
    { field: 'GB', outcome: OUTCOME.GROUNDBALL },
    { field: 'FB', outcome: OUTCOME.FLYBALL },
    { field: 'W', outcome: OUTCOME.WALK },
    { field: 'S', outcome: OUTCOME.SINGLE },
    { field: 'DB', outcome: OUTCOME.DOUBLE },
];

const OUT_OUTCOMES: OutcomeName[] = [OUTCOME.STRIKEOUT, OUTCOME.GROUNDBALL, OUTCOME.FLYBALL, OUTCOME.POPUP];

// ============================================================================
// UTILITIES
// ============================================================================

export function parseRange(range: string | null | undefined): Range | null {
    if (!range) return null;
    if (range.includes('-')) {
        const [low, high] = range.split('-').map(Number);
        if (high < low) return { low, high: low };
        return { low, high };
    }
    if (range.includes('+')) {
        return { low: parseInt(range.split('+')[0]), high: 20 };
    }
    const num = Number(range);
    if (isNaN(num)) return null;
    return { low: num, high: num };
}

export function rollInRange(roll: number, range: Range | null): boolean {
    return !!range && roll >= range.low && roll <= range.high;
}

// ============================================================================
// DATA PREPROCESSING
// ============================================================================

export interface PreparedHitter extends RawHitter {
    ranges: Record<string, Range | null>;
}
export interface PreparedPitcher extends RawPitcher {
    ranges: Record<string, Range | null>;
}

export function precomputeRanges<T extends { ranges?: Record<string, Range | null> } & Record<string, any>>(
    players: T[], fields: string[]
) {
    players.forEach(player => {
        player.ranges = {};
        fields.forEach(f => {
            player.ranges![f] = parseRange(player[f]);
        });
        if (player.HR) player.ranges!.HR = parseRange(player.HR);
    });
}

// ============================================================================
// PITCHER / HITTER STATE (mutable during sim)
// ============================================================================

export interface PitcherState {
    // Raw card metadata (carried over)
    Name: string; 'Yr.': string; Ed: string; '#': number; Team: string;
    Control: number; Position: string; IP?: number; H: string; Icons: string | null;
    Points: number;
    ranges: Record<string, Range | null>;
    // Display fields
    name: string; points: number; hand: string; team: string; edition: string;
    year: string | null; expansion: string | null;
    chart: Record<string, string>;
    imagePath?: string;
    // Counters
    battersFaced: number; outs: number;
    strikeouts: number; popups: number; groundballs: number; flyballs: number;
    walks: number; singles: number; singlepluses: number; doubles: number; triples: number; homeruns: number;
    kused: number; twentyUsed: number; RPused: number;
    iconCounts: { '20': number; K: number; RP: number; RY: number };
    hasRP: boolean; has20: boolean; hasK: boolean;
    hasR: boolean; hasRY: boolean;
    // Enhanced-mode tracking
    rAdjustmentAbs: number;   // sum of |adjustment| across all rolls (magnitude of R variance)
    rAdjustmentNet: number;   // signed sum of adjustments (positive = R helped, negative = hurt)
    ryUsed: number;            // count of RY activations
    iconImpact: {
        K: { hrsBlocked: number; tbSaved: number };
        twenty: { advantageSwings: number };
        RP: { advantageSwings: number };
    };
    whip?: number;
    mWHIP?: number;
}

export interface HitterState {
    name: string; points: number; icons: string | null;
    onBase: number; Speed: number; Position: string; hand: string; team: string;
    edition: string; year: string | null; expansion: string | null;
    imagePath?: string;
    chart: Record<string, string>;
    hits: number; singleplus: number; doubles: number; triples: number; homeRuns: number;
    walks: number; strikeouts: number; popups: number; flyballs: number; groundballs: number;
    atBats: number; gameAbCount: number; gameVuses: number; gameSused: boolean; gameHRused: boolean; gameRYused: boolean;
    Vused: number; Sused: number; HRused: number;
    // Enhanced-mode tracking
    rAdjustmentAbs: number;
    rAdjustmentNet: number;
    ryUsed: number;
    iconImpact: {
        V: { outsAvoided: number; hitsGained: number; extrasGained: number };
        S: { doublesFromSingles: number; tbGained: number };
        HR: { hrsFromDoubles: number; hrsFromTriples: number; tbGained: number };
    };
    iconList: string[];
    hasV: boolean; hasS: boolean; hasHR: boolean;
    hasR: boolean; hasRY: boolean;
}

export function initializePitcher(pitcher: PreparedPitcher): PitcherState {
    return {
        Name: pitcher.Name, 'Yr.': pitcher['Yr.'], Ed: pitcher.Ed, '#': pitcher['#'], Team: pitcher.Team,
        Control: pitcher.Control, Position: pitcher.Position, IP: pitcher.IP,
        H: pitcher.H, Icons: pitcher.Icons, Points: pitcher.Points,
        ranges: pitcher.ranges,
        name: `${pitcher.Name} ${pitcher['Yr.']} ${pitcher.Ed} ${pitcher['#']} ${pitcher.Team}`,
        points: pitcher.Points,
        hand: pitcher.H,
        team: pitcher.Team,
        edition: pitcher.Ed,
        year: pitcher['Yr.'] || null,
        expansion: pitcher.expansion || null,
        chart: {
            PU: pitcher.PU || '-', SO: pitcher.SO || '-', GB: pitcher.GB || '-', FB: pitcher.FB || '-',
            W: pitcher.W || '-', S: pitcher.S || '-', DB: pitcher.DB || '-', HR: pitcher.HR || '-',
        },
        imagePath: pitcher.imagePath,
        battersFaced: 0, outs: 0,
        strikeouts: 0, popups: 0, groundballs: 0, flyballs: 0,
        walks: 0, singles: 0, singlepluses: 0, doubles: 0, triples: 0, homeruns: 0,
        kused: 0, twentyUsed: 0, RPused: 0,
        iconCounts: { '20': 0, K: 0, RP: 0, RY: 0 },
        hasRP: pitcher.Icons?.includes('RP') || false,
        has20: pitcher.Icons?.includes('20') || false,
        hasK: pitcher.Icons?.includes('K') || false,
        hasR: iconListIncludes(pitcher.Icons, 'R'),
        hasRY: iconListIncludes(pitcher.Icons, 'RY'),
        rAdjustmentAbs: 0,
        rAdjustmentNet: 0,
        ryUsed: 0,
        iconImpact: {
            K: { hrsBlocked: 0, tbSaved: 0 },
            twenty: { advantageSwings: 0 },
            RP: { advantageSwings: 0 },
        },
    };
}

/** Check for exact-token match so "RY" in "HR RY" doesn't trigger on "HR" etc. */
function iconListIncludes(icons: string | null | undefined, name: string): boolean {
    if (!icons) return false;
    return icons.split(/\s+/).includes(name);
}

export function createHitterStats(hitter: PreparedHitter): HitterState {
    const icons = hitter.Icons ? hitter.Icons.split(' ') : [];
    return {
        name: `${hitter.Name} ${hitter['Yr.']} ${hitter.Ed} ${hitter['#']} ${hitter.Team}`,
        points: hitter.Points,
        icons: hitter.Icons,
        onBase: hitter.onBase,
        Speed: hitter.Speed,
        Position: hitter.Position,
        hand: hitter.H,
        team: hitter.Team,
        edition: hitter.Ed,
        year: hitter['Yr.'] || null,
        expansion: hitter.expansion || null,
        imagePath: hitter.imagePath,
        chart: {
            SO: hitter.SO || '-', GB: hitter.GB || '-', FB: hitter.FB || '-', W: hitter.W || '-',
            S: hitter.S || '-', SPlus: hitter.SPlus || '-', DB: hitter.DB || '-',
            TR: hitter.TR || '-', HR: hitter.HR || '-',
        },
        hits: 0, singleplus: 0, doubles: 0, triples: 0, homeRuns: 0,
        walks: 0, strikeouts: 0, popups: 0, flyballs: 0, groundballs: 0,
        atBats: 0, gameAbCount: 0, gameVuses: 0, gameSused: false, gameHRused: false, gameRYused: false,
        Vused: 0, Sused: 0, HRused: 0,
        rAdjustmentAbs: 0,
        rAdjustmentNet: 0,
        ryUsed: 0,
        iconImpact: {
            V: { outsAvoided: 0, hitsGained: 0, extrasGained: 0 },
            S: { doublesFromSingles: 0, tbGained: 0 },
            HR: { hrsFromDoubles: 0, hrsFromTriples: 0, tbGained: 0 },
        },
        iconList: icons,
        hasV: icons.includes('V'),
        hasS: icons.includes('S'),
        hasHR: icons.includes('HR'),
        hasR: icons.includes('R'),
        hasRY: icons.includes('RY'),
    };
}

// ============================================================================
// SIMULATION CORE
// ============================================================================

function determineOutcome(player: { ranges: Record<string, Range | null> }, roll: number, isHitter: boolean): OutcomeName {
    const fields = isHitter ? HITTER_CHART_FIELDS : PITCHER_CHART_FIELDS;
    for (const { field, outcome } of fields) {
        if (rollInRange(roll, player.ranges[field])) return outcome;
    }
    if (player.ranges.HR && roll >= player.ranges.HR.low) return OUTCOME.HOMERUN;
    return OUTCOME.FLYBALL;
}

export type IconsMode = 'on' | 'off' | 'enhanced';

function applyHitterIcons(outcome: OutcomeName, stats: HitterState, usingHitterChart: boolean, mode: IconsMode): OutcomeName | null {
    if (mode === 'off') return outcome;
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

export function simulateAtBat(
    hitter: PreparedHitter, pitcher: PitcherState, stats: HitterState,
    rollDie: () => number, rng: () => number, mode: IconsMode
): OutcomeName {
    const iconsEnabled = mode !== 'off';
    const enhanced = mode === 'enhanced';

    // R adjustment helper: random integer [-3, +3] inclusive (7 values, includes 0)
    const rAdjust = () => Math.floor(rng() * 7) - 3;

    stats.gameAbCount++;
    if (stats.gameAbCount > 5) {
        stats.gameAbCount = 1;
        stats.gameVuses = 0;
        stats.gameSused = false;
        stats.gameHRused = false;
        stats.gameRYused = false;
    }

    // Sign convention for rAdjustmentNet: positive = roll went UP, which helps this player.
    // Pitcher: higher pitch roll → more likely to flip to pitcher chart (pitcher's advantage).
    // Hitter:  higher swing roll → moves up the chart toward hits/walks (hitter's advantage).
    let basePitchDie = rollDie();
    if (enhanced && pitcher.hasR) {
        const adj = rAdjust();
        basePitchDie += adj;
        pitcher.rAdjustmentAbs += Math.abs(adj);
        pitcher.rAdjustmentNet += adj;
    }
    const baseRoll = basePitchDie + pitcher.Control;
    let pitcherRoll = baseRoll;
    let hitterRoll = rollDie();
    if (enhanced && stats.hasR) {
        const adj = rAdjust();
        hitterRoll += adj;
        stats.rAdjustmentAbs += Math.abs(adj);
        stats.rAdjustmentNet += adj;
    }

    const wouldUsePitcherChartWithoutIcons = baseRoll > hitter.onBase;

    if (iconsEnabled) {
        const outsInCurrentGame = pitcher.outs % 27;
        if (pitcher.hasRP && outsInCurrentGame < 3) {
            pitcherRoll += 3;
            if (pitcher.iconCounts.RP === 0) {
                pitcher.RPused++;
                pitcher.iconCounts.RP = 1;
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
    }

    // RY icon on pitcher: once per 27 outs (one per full game), +3 to pitch roll
    if (enhanced && pitcher.hasRY && pitcher.iconCounts.RY === 0) {
        pitcherRoll += 3;
        pitcher.iconCounts.RY = 1;
        pitcher.ryUsed++;
    }

    const usePitcherChart = pitcherRoll > hitter.onBase;
    const usingHitterChart = !usePitcherChart;

    // RY icon on hitter: once per 5 ABs, +3 to swing roll — ONLY on hitter chart
    if (enhanced && stats.hasRY && !stats.gameRYused && usingHitterChart) {
        hitterRoll += 3;
        stats.gameRYused = true;
        stats.ryUsed++;
    }

    // Clamp swing roll to 1..20 for chart lookup so extreme R/RY adjustments don't
    // silently bucket into the FB default.
    const clampedHitterRoll = Math.max(1, Math.min(20, hitterRoll));

    let outcome: OutcomeName | null;
    do {
        const raw = usePitcherChart
            ? determineOutcome(pitcher, clampedHitterRoll, false)
            : determineOutcome(hitter, clampedHitterRoll, true);
        outcome = applyHitterIcons(raw, stats, usingHitterChart, mode);
    } while (outcome === null);

    if (iconsEnabled && outcome === OUTCOME.HOMERUN && pitcher.hasK && pitcher.iconCounts.K < 1) {
        outcome = OUTCOME.STRIKEOUT;
        pitcher.kused++;
        pitcher.iconCounts.K++;
        pitcher.iconImpact.K.hrsBlocked++;
        pitcher.iconImpact.K.tbSaved += 4;
    }

    if (pitcher.outs > 0 && pitcher.outs % 27 === 0) {
        pitcher.iconCounts.K = 0;
        pitcher.iconCounts.RP = 0;
        pitcher.iconCounts.RY = 0;
    }
    if (pitcher.outs > 0 && pitcher.outs % 3 === 0) {
        pitcher.iconCounts['20'] = 0;
    }

    return outcome;
}

// ============================================================================
// STAT UPDATES
// ============================================================================

const STAT_UPDATES: Record<string, (s: HitterState) => void> = {
    [OUTCOME.SINGLE]: s => { s.hits++; },
    [OUTCOME.SINGLEPLUS]: s => { s.hits++; s.singleplus++; },
    [OUTCOME.DOUBLE]: s => { s.hits++; s.doubles++; },
    [OUTCOME.TRIPLE]: s => { s.hits++; s.triples++; },
    [OUTCOME.HOMERUN]: s => { s.hits++; s.homeRuns++; },
    [OUTCOME.WALK]: s => { s.walks++; },
    [OUTCOME.STRIKEOUT]: s => { s.strikeouts++; },
    [OUTCOME.POPUP]: s => { s.popups++; },
    [OUTCOME.FLYBALL]: s => { s.flyballs++; },
    [OUTCOME.GROUNDBALL]: s => { s.groundballs++; },
};

const PITCHER_STAT_UPDATES: Record<string, (p: PitcherState) => void> = {
    [OUTCOME.STRIKEOUT]: p => { p.strikeouts++; p.outs++; },
    [OUTCOME.POPUP]: p => { p.popups++; p.outs++; },
    [OUTCOME.FLYBALL]: p => { p.flyballs++; p.outs++; },
    [OUTCOME.GROUNDBALL]: p => { p.groundballs++; p.outs++; },
    [OUTCOME.WALK]: p => { p.walks++; },
    [OUTCOME.SINGLE]: p => { p.singles++; },
    [OUTCOME.SINGLEPLUS]: p => { p.singlepluses++; },
    [OUTCOME.DOUBLE]: p => { p.doubles++; },
    [OUTCOME.TRIPLE]: p => { p.triples++; },
    [OUTCOME.HOMERUN]: p => { p.homeruns++; },
};

export function updateHitterStats(stats: HitterState, outcome: OutcomeName) {
    stats.atBats++;
    STAT_UPDATES[outcome]?.(stats);
}

export function updatePitcherStats(pitcher: PitcherState, outcome: OutcomeName, weights: SimConfig['WEIGHTS']) {
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
