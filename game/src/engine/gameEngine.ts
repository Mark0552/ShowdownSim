/**
 * MLB Showdown Game Engine — Types Only
 *
 * The server (server/engine.js) is the single source of truth for all game logic.
 * This file exports only types/interfaces and pure read-only helpers used by the UI.
 */

// ============================================================================
// OUTCOME & PHASE
// ============================================================================

export type Outcome = 'SO' | 'GB' | 'FB' | 'PU' | 'W' | 'S' | 'SPlus' | 'DB' | 'TR' | 'HR' | 'SAC' | 'IBB';

export type Phase =
    | 'sp_roll'          // home team rolls for starting pitchers
    | 'pre_atbat'        // offense can pinch hit, steal, use SB icon
    | 'defense_sub'      // defense can change pitcher, use 20/RP icons
    | 'ibb_decision'     // defense decides whether to intentional walk
    | 'bunt_decision'    // offense decides whether to sacrifice bunt
    | 'pitch'
    | 'swing'
    | 'result_icons'     // post-result icon decisions (K, HR, V, S)
    | 'gb_decision'      // defense chooses GB handling (DP, hold, force home)
    | 'steal_sb'         // offense decides whether to use SB icon on steal
    | 'steal_resolve'    // defense decides whether to use G on steal throw
    | 'extra_base_offer' // offense decides whether to send runners
    | 'extra_base'       // defense chooses which runner to throw at
    | 'game_over';

// ============================================================================
// ICONS
// ============================================================================

export type IconName = 'K' | 'G' | 'HR' | 'V' | 'SB' | '20' | 'CY' | 'RP' | 'S' | 'R' | 'RY';

export interface IconUsage {
    [cardId: string]: {
        [icon: string]: number; // times used this game
    };
}

export interface IconOption {
    cardId: string;
    icon: string;
    description: string;
}

export interface IconPrompt {
    team: 'home' | 'away';
    availableIcons: IconOption[];
}

// ============================================================================
// PLAYER & TEAM
// ============================================================================

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
    assignedPosition?: string;  // "SS", "CF", "LF-RF-1", "DH", etc.
    fielding?: number;          // fielding value at assigned position
    arm?: number;               // catcher Arm value (used for steal defense)
    isBackup?: boolean;         // bench player at 1/5 cost (timing restrictions)
}

export interface BatterStats {
    ab: number;     // at bats
    h: number;      // hits
    r: number;      // runs scored
    rbi: number;    // runs batted in
    bb: number;     // walks
    ibb: number;    // intentional walks
    so: number;     // strikeouts
    hr: number;     // home runs
    sb: number;     // stolen bases
    cs: number;     // caught stealing
}

export interface PitcherStats {
    ip: number;     // innings pitched (in thirds: 3 = 1 full inning)
    h: number;      // hits allowed
    r: number;      // runs allowed
    bb: number;     // walks allowed
    ibb: number;    // intentional walks
    so: number;     // strikeouts
    hr: number;     // home runs allowed
    bf: number;     // batters faced
}

export interface TeamState {
    userId: string;
    lineup: PlayerSlot[];       // 9 batters in order
    pitcher: PlayerSlot;        // active pitcher
    bullpen: PlayerSlot[];      // available relievers/closers
    bench: PlayerSlot[];        // bench hitters
    currentBatterIndex: number;
    runsPerInning: number[];
    hits: number;
    // Advanced rules tracking
    usedPlayers: string[];            // cardIds of substituted-out players (can't return)
    iconUsage: IconUsage;             // track icon uses per player per game
    inningsPitched: number;           // IP accumulated by current pitcher
    pitcherEntryInning: number;       // inning when current pitcher entered
    totalInfieldFielding: number;     // sum of 1B+2B+3B+SS fielding (catchers have 0 fielding)
    totalOutfieldFielding: number;    // sum of LF+CF+RF fielding
    catcherArm: number;              // catcher's Arm value for steal defense
    // Per-player stats
    batterStats: { [cardId: string]: BatterStats };
    pitcherStats: { [cardId: string]: PitcherStats };
}

// ============================================================================
// GB DECISION
// ============================================================================

export interface GPlayerOption {
    cardId: string;
    name: string;
    position: string;
}

export interface GbOptions {
    hasRunnerFirst: boolean;
    hasRunnerSecond: boolean;
    hasRunnerThird: boolean;
    canDP: boolean;
    canForceHome: boolean;
    canHoldThird: boolean;
    canHoldRunners: boolean;
    canAdvanceRunners: boolean;
    gPlayers: GPlayerOption[];  // all infielders with unused G icon
}

// ============================================================================
// STEAL
// ============================================================================

export interface StealAttempt {
    runnerId: string;
    runnerName: string;
    runnerSpeed: number;
    fromBase: string;
    toBase: string;
    catcherArm: number;
    stealThirdBonus: number;  // +5 if stealing 3rd
    catcherGPlayers: GPlayerOption[];  // catchers with unused G icon
}

export interface StealResult {
    runnerId: string;
    runnerName: string;
    roll: number;
    defenseTotal: number;
    runnerSpeed: number;
    safe: boolean;
    goldGloveUsed: boolean;
}

// ============================================================================
// DP & EXTRA BASE RESULTS
// ============================================================================

export interface DpResult {
    roll: number;
    defenseTotal: number;
    offenseSpeed: number;
    isDP: boolean;
    goldGloveUsed?: boolean;
    choice?: string;          // 'dp' | 'hold' | 'force_home'
}

export interface ExtraBaseCandidate {
    runnerId: string;
    runnerName: string;
    fromBase: string;
    toBase: string;
    runnerSpeed: number;
    targetWithBonuses: number; // speed + home bonus + 2-out bonus
}

export interface ExtraBaseResult {
    runnerId: string;
    runnerName: string;
    roll: number;
    defenseTotal: number;
    runnerSpeed: number;
    safe: boolean;
    goldGloveUsed?: boolean;
}

// ============================================================================
// GAME STATE
// ============================================================================

export interface BaseState {
    first: string | null;
    second: string | null;
    third: string | null;
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
    // Advanced rules state
    fatiguePenalty: number;
    controlModifier: number;            // from 20/RP icons
    pendingDpResult: DpResult | null;
    extraBaseEligible: ExtraBaseCandidate[] | null;
    pendingExtraBaseResult: ExtraBaseResult | null;
    iconPrompt: IconPrompt | null;
    subPhaseStep: 'offense_first' | 'defense' | 'offense_re' | null;
    halfInningClean: boolean;           // for CY icon: true if no runners reached base
    icon20UsedThisInning: boolean;      // 20 icon: once per inning
    rpActiveInning: number | null;      // RP icon: which inning it's active for
    // GB and steal state
    gbOptions: GbOptions | null;
    pendingSteal: StealAttempt | null;
    pendingStealResult: StealResult | null;
    outsBeforeSwing: number;            // track outs before swing for +5 bonus on extra base
    spRoll: number | null;              // starting pitcher d20 roll result (for animation)
    lastRoll: number | null;            // most recent d20 roll (for dice animation)
    lastRollType: string | null;        // 'sp' | 'pitch' | 'swing' | 'dp' | 'steal' | 'extra_base'
}

// ============================================================================
// ACTIONS
// ============================================================================

export type GameAction =
    | { type: 'ROLL_PITCH' }
    | { type: 'ROLL_SWING' }
    | { type: 'PINCH_HIT'; benchCardId: string; lineupIndex: number }
    | { type: 'PITCHING_CHANGE'; bullpenCardId: string }
    | { type: 'USE_ICON'; cardId: string; icon: string; targetId?: string }
    | { type: 'SEND_RUNNERS'; runnerIds: string[] }
    | { type: 'HOLD_RUNNERS' }
    | { type: 'EXTRA_BASE_THROW'; runnerId: string; goldGloveCardId?: string }
    | { type: 'GB_DECISION'; choice: 'dp' | 'hold' | 'force_home'; goldGloveCardId?: string }
    | { type: 'STEAL'; runnerId: string }
    | { type: 'STEAL_SB_DECISION'; useSB: boolean }
    | { type: 'STEAL_G_DECISION'; goldGloveCardId?: string }
    | { type: 'SKIP_SUB' }
    | { type: 'SKIP_ICONS' }
    | { type: 'SKIP_EXTRA_BASE' }
    | { type: 'ROLL_STARTERS' }
    | { type: 'INTENTIONAL_WALK' }
    | { type: 'SKIP_IBB' }
    | { type: 'SAC_BUNT' }
    | { type: 'SKIP_BUNT' };

// ============================================================================
// PURE READ-ONLY HELPERS (used by UI)
// ============================================================================

export function getCurrentBatter(state: GameState): PlayerSlot {
    const team = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    return team.lineup[team.currentBatterIndex];
}

export function getCurrentPitcher(state: GameState): PlayerSlot {
    const team = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    return team.pitcher;
}
