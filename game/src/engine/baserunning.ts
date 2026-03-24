/**
 * Baserunning logic — all runner advancement rules from 2004 Advanced rulebook.
 */
import type { BaseState, Outcome, ExtraBaseAttempt, GameState } from '../types/gameState';

export interface BaserunningResult {
    newBases: BaseState;
    runsScored: number;
    scoringRunners: string[];   // card IDs of runners who scored
    batterReachedBase: string | null;  // which base batter reached ('first', 'second', 'third', 'home')
    pendingExtraBases: ExtraBaseAttempt[];
    isDoublePlayAttempt: boolean;
    log: string[];
}

/**
 * Apply the result of an at-bat to the bases.
 */
export function advanceRunners(
    bases: BaseState,
    outcome: Outcome,
    batterId: string,
    outs: number,
): BaserunningResult {
    const result: BaserunningResult = {
        newBases: { ...bases },
        runsScored: 0,
        scoringRunners: [],
        batterReachedBase: null,
        pendingExtraBases: [],
        isDoublePlayAttempt: false,
        log: [],
    };

    switch (outcome) {
        case 'W': // Walk — force advancement only
            applyWalk(result, bases, batterId);
            break;

        case 'S': // Single — runners advance 1
            applySingle(result, bases, batterId, outs);
            break;

        case 'SPlus': // Single+ — same as single, plus auto-steal 2nd
            applySinglePlus(result, bases, batterId, outs);
            break;

        case 'DB': // Double — runners advance 2
            applyDouble(result, bases, batterId, outs);
            break;

        case 'TR': // Triple — all runners score
            applyTriple(result, bases, batterId);
            break;

        case 'HR': // Home run — everyone scores
            applyHomeRun(result, bases, batterId);
            break;

        case 'SO': // Strikeout — batter out, runners stay
        case 'PU': // Popup — same
            result.newBases = { ...bases };
            break;

        case 'GB': // Ground ball — DP possible if runner on 1st
            applyGroundBall(result, bases, batterId);
            break;

        case 'FB': // Fly ball — runners on 2nd/3rd may tag up
            applyFlyBall(result, bases, batterId, outs);
            break;
    }

    return result;
}

function applyWalk(r: BaserunningResult, bases: BaseState, batterId: string) {
    // Force advancement: only move runners who are forced
    r.newBases = { ...bases };
    if (bases.first) {
        if (bases.second) {
            if (bases.third) {
                // Bases loaded — runner on 3rd scores
                r.runsScored++;
                r.scoringRunners.push(bases.third);
                r.log.push('Runner scores on walk (bases loaded)');
            }
            r.newBases.third = bases.second;
        }
        r.newBases.second = bases.first;
    }
    r.newBases.first = batterId;
    r.batterReachedBase = 'first';
    r.log.push('Walk');
}

function applySingle(r: BaserunningResult, bases: BaseState, batterId: string, outs: number) {
    r.newBases = { first: batterId, second: null, third: null };
    r.batterReachedBase = 'first';

    // Runner on 3rd scores
    if (bases.third) {
        r.runsScored++;
        r.scoringRunners.push(bases.third);
        r.log.push('Runner scores from third on single');
    }

    // Runner on 2nd advances to 3rd (can try for home as extra base)
    if (bases.second) {
        r.newBases.third = bases.second;
        // Eligible for extra base attempt (2nd to home)
        r.pendingExtraBases.push({
            runnerId: bases.second,
            fromBase: 'third',
            toBase: 'home',
        });
    }

    // Runner on 1st advances to 2nd (can try for 3rd as extra base)
    if (bases.first) {
        r.newBases.second = bases.first;
        if (!bases.second) {
            // Only try for 3rd if 2nd was empty (otherwise blocked)
            r.pendingExtraBases.push({
                runnerId: bases.first,
                fromBase: 'second',
                toBase: 'third',
            });
        }
    }

    r.log.push('Single');
}

function applySinglePlus(r: BaserunningResult, bases: BaseState, batterId: string, outs: number) {
    // Same as single first
    applySingle(r, bases, batterId, outs);

    // Then: batter automatically steals 2nd if open
    if (!r.newBases.second) {
        r.newBases.second = batterId;
        r.newBases.first = null;
        r.batterReachedBase = 'second';
        r.log.push('Single+ — batter takes second');
    } else {
        r.log[r.log.length - 1] = 'Single+ (second occupied, stays at first)';
    }
}

function applyDouble(r: BaserunningResult, bases: BaseState, batterId: string, outs: number) {
    r.newBases = { first: null, second: batterId, third: null };
    r.batterReachedBase = 'second';

    // All runners advance 2 bases
    if (bases.third) {
        r.runsScored++;
        r.scoringRunners.push(bases.third);
    }
    if (bases.second) {
        r.runsScored++;
        r.scoringRunners.push(bases.second);
    }
    if (bases.first) {
        r.newBases.third = bases.first;
        // Runner from 1st to 3rd can try for home
        r.pendingExtraBases.push({
            runnerId: bases.first,
            fromBase: 'third',
            toBase: 'home',
        });
    }

    r.log.push('Double');
    if (r.runsScored > 0) r.log.push(`${r.runsScored} run(s) score`);
}

function applyTriple(r: BaserunningResult, bases: BaseState, batterId: string) {
    // All runners score
    for (const base of [bases.third, bases.second, bases.first]) {
        if (base) {
            r.runsScored++;
            r.scoringRunners.push(base);
        }
    }
    r.newBases = { first: null, second: null, third: batterId };
    r.batterReachedBase = 'third';
    r.log.push('Triple');
    if (r.runsScored > 0) r.log.push(`${r.runsScored} run(s) score`);
}

function applyHomeRun(r: BaserunningResult, bases: BaseState, batterId: string) {
    for (const base of [bases.third, bases.second, bases.first]) {
        if (base) {
            r.runsScored++;
            r.scoringRunners.push(base);
        }
    }
    r.runsScored++; // batter scores too
    r.scoringRunners.push(batterId);
    r.newBases = { first: null, second: null, third: null };
    r.batterReachedBase = 'home';
    r.log.push('HOME RUN!');
    r.log.push(`${r.runsScored} run(s) score`);
}

function applyGroundBall(r: BaserunningResult, bases: BaseState, batterId: string) {
    r.newBases = { ...bases };

    if (bases.first) {
        // Double play attempt: runner on 1st is always out
        r.isDoublePlayAttempt = true;
        r.newBases.first = null;
        r.log.push('Ground ball — double play attempt');

        // Runners on 2nd/3rd advance
        if (bases.third) {
            r.runsScored++;
            r.scoringRunners.push(bases.third);
            r.newBases.third = null;
            r.log.push('Runner scores from third on ground ball');
        }
        if (bases.second) {
            r.newBases.third = bases.second;
            r.newBases.second = null;
            r.log.push('Runner advances from second to third');
        }
    } else {
        // No runner on first — just an out
        r.log.push('Ground ball out');
    }
}

function applyFlyBall(r: BaserunningResult, bases: BaseState, batterId: string, outs: number) {
    r.newBases = { ...bases };
    r.log.push('Fly ball out');

    // Runners on 2nd/3rd can try to tag up (not if this is the 3rd out)
    // The actual tag-up decision happens via extra base attempts
    if (outs < 2) { // not the 3rd out
        if (bases.third) {
            r.pendingExtraBases.push({
                runnerId: bases.third,
                fromBase: 'third',
                toBase: 'home',
            });
        }
        if (bases.second && !bases.third) {
            // Can try 2nd to 3rd only if 3rd is open
            r.pendingExtraBases.push({
                runnerId: bases.second,
                fromBase: 'second',
                toBase: 'third',
            });
        }
    }
}

/**
 * Resolve a double play attempt.
 * Defense rolls d20 + total infield fielding vs batter speed.
 */
export function resolveDoublePlay(
    fieldingRoll: number,
    totalInfieldFielding: number,
    batterSpeed: number,
): { batterOut: boolean; log: string } {
    const total = fieldingRoll + totalInfieldFielding;
    if (total > batterSpeed) {
        return { batterOut: true, log: `DP! Roll ${fieldingRoll} + fielding ${totalInfieldFielding} = ${total} > speed ${batterSpeed}` };
    }
    return { batterOut: false, log: `Safe at first! Roll ${fieldingRoll} + fielding ${totalInfieldFielding} = ${total} ≤ speed ${batterSpeed}` };
}

/**
 * Resolve an extra base attempt (tag up or advancing on hit).
 * Defense rolls d20 + outfield fielding vs runner speed (+5 if going home, +5 if 2 outs).
 */
export function resolveExtraBase(
    fieldingRoll: number,
    totalOutfieldFielding: number,
    runnerSpeed: number,
    goingHome: boolean,
    twoOuts: boolean,
    goldGloveBonus: number = 0,
): { runnerSafe: boolean; log: string } {
    let target = runnerSpeed;
    if (goingHome) target += 5;
    if (twoOuts) target += 5;

    const total = fieldingRoll + totalOutfieldFielding + goldGloveBonus;
    if (total > target) {
        return { runnerSafe: false, log: `Thrown out! Roll ${fieldingRoll} + fielding ${totalOutfieldFielding}${goldGloveBonus ? ` + G ${goldGloveBonus}` : ''} = ${total} > target ${target}` };
    }
    return { runnerSafe: true, log: `Safe! Roll ${fieldingRoll} + fielding ${totalOutfieldFielding} = ${total} ≤ target ${target}` };
}
