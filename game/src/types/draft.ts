/**
 * Draft state types. Consumed by client UI and (after porting to JS) by the
 * authoritative server.
 *
 * Roster shape during draft (matches existing teamRules.ts):
 *   - 9 starter hitters  (specific positions assigned post-draft)
 *   - 4 starter pitchers (rotation order assigned post-draft)
 *   - 7 flex             (any combination of relief pitchers + bench hitters;
 *                        bench is hitters only — pitchers can't bench)
 *
 * Total 20 picks per side, 40 total. Snake order: home picks 1st overall.
 *
 * Draft state lives at games.state while games.status === 'drafting'. On
 * completion it's converted to two Team objects (state.homeTeam / awayTeam)
 * and the game transitions to 'active'.
 */

export type DraftBucket =
    | 'starterHitter'
    | 'benchHitter'
    | 'starterPitcher'
    | 'reliefPitcher';

export interface DraftPick {
    pickNumber: number;          // 1..40
    actor: 'home' | 'away';
    cardId: string;
    bucket: DraftBucket;
}

export interface DraftTeamState {
    pointsRemaining: number;     // starts at MAX_POINTS (5000)
    starterHitters: string[];    // card ids, max 9
    benchHitters: string[];      // card ids; counted toward flex (cap 7)
    starterPitchers: string[];   // card ids, max 4
    reliefPitchers: string[];    // card ids; counted toward flex (cap 7)
}

export interface DraftState {
    type: 'draft';
    pickOrder: ('home' | 'away')[];   // length 40, precomputed snake
    pickIndex: number;                 // 0..39
    home: DraftTeamState;
    away: DraftTeamState;
    picks: DraftPick[];                // append-only history
}

export const STARTER_HITTER_CAP = 9;
export const STARTER_PITCHER_CAP = 4;
export const FLEX_CAP = 7;
export const TOTAL_PICKS_PER_TEAM = STARTER_HITTER_CAP + STARTER_PITCHER_CAP + FLEX_CAP; // 20

/**
 * Snake order with home picking first overall.
 * Pattern: 1, 2, 2, 1, 1, 2, 2, 1, 1, ... (after the first solo pick,
 * pairs of consecutive picks alternate teams).
 */
export function buildSnakeOrder(totalPicks = TOTAL_PICKS_PER_TEAM * 2): ('home' | 'away')[] {
    const order: ('home' | 'away')[] = [];
    for (let i = 0; i < totalPicks; i++) {
        // pick 1: home; picks 2-3: away; picks 4-5: home; picks 6-7: away; ...
        // Index pattern: (i + 1) / 2 floored, then parity decides.
        const pairIndex = Math.floor((i + 1) / 2);
        order.push(pairIndex % 2 === 0 ? 'home' : 'away');
    }
    return order;
}

export function emptyDraftTeam(pointCap: number): DraftTeamState {
    return {
        pointsRemaining: pointCap,
        starterHitters: [],
        benchHitters: [],
        starterPitchers: [],
        reliefPitchers: [],
    };
}
