import type { HitterCard, PitcherCard } from './cards';

// Outcomes from chart resolution
export type Outcome = 'SO' | 'GB' | 'FB' | 'PU' | 'W' | 'S' | 'SPlus' | 'DB' | 'TR' | 'HR';

export const OUT_OUTCOMES: Outcome[] = ['SO', 'GB', 'FB', 'PU'];
export const HIT_OUTCOMES: Outcome[] = ['S', 'SPlus', 'DB', 'TR', 'HR'];

export type AtBatPhase =
    | 'pre_atbat'           // offense may pinch hit
    | 'defense_sub'         // defense may change pitcher or IBB
    | 'offense_pre'         // offense may sac bunt or steal
    | 'pitch'               // waiting for pitch roll
    | 'swing'               // waiting for swing roll (or sac bunt roll)
    | 'result_pending'      // result determined, check for icon opportunities
    | 'fielding_check'      // DP attempt or extra base throw
    | 'extra_base_decision' // offense decides whether runner tries extra base
    | 'game_over';

export interface BaseState {
    first: string | null;   // card ID of runner
    second: string | null;
    third: string | null;
}

export interface LineupPlayer {
    cardId: string;
    card: HitterCard;
    assignedPosition: string;
    isActive: boolean;      // false if subbed out
}

export interface PitcherState {
    cardId: string;
    card: PitcherCard;
    outsRecorded: number;   // total outs this pitcher has recorded
    runsAllowed: number;
    isActive: boolean;
    isAvailable: boolean;   // false once removed from game
    rpUsedThisGame: boolean;
    rpInningActive: boolean;// currently in RP bonus inning
    cyBonusIP: number;      // extra IP from CY icon
    twentyUsedThisInning: boolean;
    inningStartedIn: number;// inning number when pitcher entered
}

export interface IconUsage {
    // Hitter icons — tracked per cardId
    visionUses: Record<string, number>;   // cardId -> uses this game (max 2)
    speedUsed: Record<string, boolean>;   // cardId -> used this game
    hrUsed: Record<string, boolean>;      // cardId -> used this game
    sbUsed: Record<string, boolean>;      // cardId -> used this game
    goldGloveUsed: Record<string, boolean>; // cardId -> used this game
    // Pitcher icons
    kUsedThisGame: boolean;
}

export interface TeamState {
    userId: string;
    lineup: LineupPlayer[];         // 9 batting order slots
    pitchers: PitcherState[];       // all pitchers (starters + bullpen)
    bench: LineupPlayer[];          // available bench players
    currentPitcherIndex: number;    // index into pitchers array
    currentBatterIndex: number;     // index into lineup (0-8)
    icons: IconUsage;
    runsPerInning: number[];        // index 0 = inning 1
}

export interface PendingResult {
    outcome: Outcome;
    pitchRoll: number;
    pitchTotal: number;
    swingRoll: number;
    usedPitcherChart: boolean;
    modifiers: string[];            // description of what modified rolls
}

export interface ExtraBaseAttempt {
    runnerId: string;
    fromBase: 'second' | 'third';
    toBase: 'third' | 'home';
}

export interface GameState {
    inning: number;
    halfInning: 'top' | 'bottom';
    outs: number;
    bases: BaseState;
    score: { home: number; away: number };

    homeTeam: TeamState;
    awayTeam: TeamState;

    phase: AtBatPhase;
    pendingResult: PendingResult | null;
    pendingExtraBases: ExtraBaseAttempt[];

    // Current at-bat context
    currentAtBatEvents: string[];

    // Full game log
    gameLog: string[];

    isOver: boolean;
    winnerId: string | null;

    // Gold Glove bonus active for current fielding check
    goldGloveBonus: number;

    // Track 1-2-3 innings for CY icon
    runnersReachedThisInning: boolean;
}
