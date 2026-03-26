/**
 * MLB Showdown Game Engine — Types Only
 *
 * The server (server/engine.js) is the single source of truth for all game logic.
 * This file exports only types/interfaces and pure read-only helpers used by the UI.
 */

// ============================================================================
// OUTCOME & PHASE
// ============================================================================

export type Outcome = 'SO' | 'GB' | 'FB' | 'PU' | 'W' | 'S' | 'SPlus' | 'DB' | 'TR' | 'HR';

export type Phase =
    | 'pre_atbat'       // offense can pinch hit, use SB icon
    | 'defense_sub'     // defense can change pitcher, use 20/RP icons
    | 'pitch'
    | 'swing'
    | 'result_icons'    // post-result icon decisions (K, HR, V, S, G)
    | 'extra_base'      // defense chooses which runner to throw at
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
    arm?: number;               // catcher arm value
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
    totalInfieldFielding: number;     // sum of C+1B+2B+3B+SS fielding
    totalOutfieldFielding: number;    // sum of LF+CF+RF fielding
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
}

export interface ExtraBaseCandidate {
    runnerId: string;
    runnerName: string;
    fromBase: string;
    toBase: string;
    runnerSpeed: number;
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
    | { type: 'EXTRA_BASE_THROW'; runnerId: string }
    | { type: 'SKIP_SUB' }
    | { type: 'SKIP_ICONS' }
    | { type: 'SKIP_EXTRA_BASE' }
    | { type: 'SAC_BUNT' };

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
