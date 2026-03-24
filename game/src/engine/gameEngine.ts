/**
 * MLB Showdown Game Engine — Pure State Machine
 *
 * (state, action) => newState
 *
 * The engine processes one action at a time and returns the new game state.
 * All dice rolls are provided as action parameters (rolled by the host client).
 */
import type { GameState, TeamState, BaseState, PendingResult, Outcome, PitcherState, LineupPlayer } from '../types/gameState';
import type { GameAction } from '../types/gameActions';
import type { HitterCard, PitcherCard } from '../types/cards';
import type { SavedLineup } from '../lib/lineups';
import { resolveHitterChart, resolvePitcherChart, resolvePitch } from './charts';
import { advanceRunners, resolveDoublePlay, resolveExtraBase } from './baserunning';
import { getFatiguePenalty } from './fatigue';
import { getPitchModifiers, getOffensiveIcons as getOffIcons, getDefensiveIcons as getDefIcons, getPrePitchOffenseIcons as getPrePitchOffenseIconsFn } from './icons';
import { applyPinchHit, applyPitchingChange, getTotalInfieldFielding, getTotalOutfieldFielding } from './substitutions';

// ============================================================================
// INITIALIZE GAME STATE
// ============================================================================

export function initializeGameState(
    homeLineup: any, // SavedLineup data
    awayLineup: any,
    homeUserId: string,
    awayUserId: string,
): GameState {
    return {
        inning: 1,
        halfInning: 'top',
        outs: 0,
        bases: { first: null, second: null, third: null },
        score: { home: 0, away: 0 },
        homeTeam: buildTeamState(homeLineup, homeUserId),
        awayTeam: buildTeamState(awayLineup, awayUserId),
        phase: 'pre_atbat',
        pendingResult: null,
        pendingExtraBases: [],
        currentAtBatEvents: [],
        gameLog: ['Game started!'],
        isOver: false,
        winnerId: null,
        goldGloveBonus: 0,
        runnersReachedThisInning: false,
    };
}

function buildTeamState(lineupData: any, userId: string): TeamState {
    const slots = lineupData.slots || [];

    // Build lineup from slots that have batting order
    const lineupSlots = slots
        .filter((s: any) => s.card.type === 'hitter' && s.assignedPosition !== 'bench')
        .sort((a: any, b: any) => (a.battingOrder || 99) - (b.battingOrder || 99));

    const lineup: LineupPlayer[] = lineupSlots.map((s: any) => ({
        cardId: s.card.id,
        card: s.card,
        assignedPosition: s.assignedPosition,
        isActive: true,
    }));

    // Build pitchers
    const pitcherSlots = slots.filter((s: any) => s.card.type === 'pitcher');
    const pitchers: PitcherState[] = pitcherSlots.map((s: any, i: number) => ({
        cardId: s.card.id,
        card: s.card,
        outsRecorded: 0,
        runsAllowed: 0,
        isActive: i === 0, // first pitcher is active (SP1)
        isAvailable: true,
        rpUsedThisGame: false,
        rpInningActive: false,
        cyBonusIP: 0,
        twentyUsedThisInning: false,
        inningStartedIn: 1,
    }));

    // Build bench
    const benchSlots = slots.filter((s: any) => s.assignedPosition === 'bench');
    const bench: LineupPlayer[] = benchSlots.map((s: any) => ({
        cardId: s.card.id,
        card: s.card,
        assignedPosition: 'bench',
        isActive: true,
    }));

    return {
        userId,
        lineup,
        pitchers,
        bench,
        currentPitcherIndex: 0,
        currentBatterIndex: 0,
        icons: {
            visionUses: {},
            speedUsed: {},
            hrUsed: {},
            sbUsed: {},
            goldGloveUsed: {},
            kUsedThisGame: false,
        },
        runsPerInning: [0],
    };
}

// ============================================================================
// MAIN DISPATCH
// ============================================================================

export function processAction(state: GameState, action: GameAction): GameState {
    if (state.isOver) return state;

    let newState = { ...state };

    switch (action.type) {
        case 'SKIP_PRE_ATBAT':
            newState.phase = 'defense_sub';
            break;

        case 'PINCH_HIT':
            newState = handlePinchHit(newState, action.benchIndex, action.replacingIndex);
            newState.phase = 'defense_sub';
            break;

        case 'SKIP_DEFENSE_SUB':
            newState.phase = shouldShowOffensePre(newState) ? 'offense_pre' : 'pitch';
            break;

        case 'PITCHING_CHANGE':
            newState = handlePitchingChange(newState, action.pitcherIndex);
            newState.phase = shouldShowOffensePre(newState) ? 'offense_pre' : 'pitch';
            break;

        case 'INTENTIONAL_WALK':
            newState = handleIntentionalWalk(newState);
            break;

        case 'SKIP_OFFENSE_PRE':
            newState.phase = 'pitch';
            break;

        case 'SACRIFICE_BUNT':
            // Sac bunt needs a roll on the pitcher's chart
            newState.phase = 'swing'; // reuse swing phase for the bunt roll
            newState.pendingResult = {
                outcome: 'GB', // placeholder
                pitchRoll: 0,
                pitchTotal: 0,
                swingRoll: 0,
                usedPitcherChart: true,
                modifiers: ['Sacrifice bunt'],
            };
            newState.currentAtBatEvents = [...newState.currentAtBatEvents, 'Sacrifice bunt attempt'];
            newState.gameLog = [...newState.gameLog, `${getCurrentBatter(newState).card.name} attempts sacrifice bunt`];
            break;

        case 'SAC_BUNT_ROLL':
            newState = handleSacBuntRoll(newState, action.roll);
            break;

        case 'STEAL_BASE':
            newState = handleSteal(newState, action.runnerId, action.icon);
            break;

        case 'ROLL_PITCH':
            newState = handlePitch(newState, action.roll);
            break;

        case 'ROLL_SWING':
            newState = handleSwing(newState, action.roll);
            break;

        case 'USE_ICON_V':
            newState = handleVisionReroll(newState, action.cardId);
            break;

        case 'USE_ICON_S':
            newState = handleSpeedUpgrade(newState, action.cardId);
            break;

        case 'USE_ICON_HR':
            newState = handleHRUpgrade(newState, action.cardId);
            break;

        case 'USE_ICON_K':
            newState = handleKBlock(newState);
            break;

        case 'USE_ICON_G':
            newState = handleGoldGlove(newState, action.cardId);
            break;

        case 'USE_ICON_20': {
            const ft20 = getFieldingTeam(newState);
            const np20 = [...ft20.pitchers];
            const p20 = np20[ft20.currentPitcherIndex];
            np20[ft20.currentPitcherIndex] = { ...p20, twentyUsedThisInning: true };
            newState = setFieldingTeam(newState, { ...ft20, pitchers: np20 });
            newState.currentAtBatEvents = [...newState.currentAtBatEvents, `${p20.card.name} uses 20 icon (+3 control)`];
            newState.gameLog = [...newState.gameLog, `${p20.card.name} uses 20 icon`];
            newState.phase = shouldShowOffensePre(newState) ? 'offense_pre' : 'pitch';
            break;
        }

        case 'USE_ICON_RP': {
            const ftRP = getFieldingTeam(newState);
            const npRP = [...ftRP.pitchers];
            const pRP = npRP[ftRP.currentPitcherIndex];
            npRP[ftRP.currentPitcherIndex] = { ...pRP, rpUsedThisGame: true, rpInningActive: true };
            newState = setFieldingTeam(newState, { ...ftRP, pitchers: npRP });
            newState.currentAtBatEvents = [...newState.currentAtBatEvents, `${pRP.card.name} uses RP icon (+3 control this inning)`];
            newState.gameLog = [...newState.gameLog, `${pRP.card.name} uses RP icon`];
            newState.phase = shouldShowOffensePre(newState) ? 'offense_pre' : 'pitch';
            break;
        }

        case 'DECLINE_ICON':
            newState = handleDeclineIcon(newState);
            break;

        case 'EXTRA_BASE_YES':
            // Handled after fielding roll
            break;

        case 'EXTRA_BASE_NO':
            newState = handleDeclineExtraBase(newState, action.runnerId);
            break;

        case 'FIELDING_ROLL':
            newState = handleFieldingRoll(newState, action.roll);
            break;

        case 'ADVANCE_ATBAT':
            newState = advanceToNextBatter(newState);
            break;

        case 'FORFEIT':
            newState.isOver = true;
            const forfeitTeam = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
            const winnerTeam = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
            newState.winnerId = winnerTeam.userId;
            newState.gameLog = [...state.gameLog, 'Game forfeited'];
            break;
    }

    return newState;
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Check if offense_pre phase has any actions to offer.
 * Returns true if there are runners who could bunt or use SB icon.
 */
function shouldShowOffensePre(state: GameState): boolean {
    const hasRunners = !!(state.bases.first || state.bases.second);
    const canBunt = hasRunners && !state.bases.third;
    const hasSB = getPrePitchOffenseIconsFn(state).length > 0;
    return canBunt || hasSB;
}

function getBattingTeam(state: GameState): TeamState {
    return state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
}

function getFieldingTeam(state: GameState): TeamState {
    return state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
}

function setBattingTeam(state: GameState, team: TeamState): GameState {
    if (state.halfInning === 'top') return { ...state, awayTeam: team };
    return { ...state, homeTeam: team };
}

function setFieldingTeam(state: GameState, team: TeamState): GameState {
    if (state.halfInning === 'top') return { ...state, homeTeam: team };
    return { ...state, awayTeam: team };
}

function getCurrentBatter(state: GameState): LineupPlayer {
    const team = getBattingTeam(state);
    return team.lineup[team.currentBatterIndex];
}

function getCurrentPitcher(state: GameState): PitcherState {
    const team = getFieldingTeam(state);
    return team.pitchers[team.currentPitcherIndex];
}

function handlePinchHit(state: GameState, benchIndex: number, replacingIndex: number): GameState {
    const team = getBattingTeam(state);
    const newTeam = applyPinchHit(team, benchIndex, replacingIndex);
    const batter = newTeam.lineup[replacingIndex];
    return {
        ...setBattingTeam(state, newTeam),
        currentAtBatEvents: [...state.currentAtBatEvents, `Pinch hitter: ${batter.card.name}`],
        gameLog: [...state.gameLog, `Pinch hitter: ${batter.card.name}`],
    };
}

function handlePitchingChange(state: GameState, pitcherIndex: number): GameState {
    const team = getFieldingTeam(state);
    const outsInInning = state.outs; // current outs this half-inning
    const newTeam = applyPitchingChange(team, pitcherIndex, state.inning, outsInInning);
    const pitcher = newTeam.pitchers[pitcherIndex];
    return {
        ...setFieldingTeam(state, newTeam),
        currentAtBatEvents: [...state.currentAtBatEvents, `Pitching change: ${pitcher.card.name}`],
        gameLog: [...state.gameLog, `Pitching change: ${pitcher.card.name}`],
    };
}

function handleIntentionalWalk(state: GameState): GameState {
    const batter = getCurrentBatter(state);
    const result = advanceRunners(state.bases, 'W', batter.cardId, state.outs);

    let newState = {
        ...state,
        bases: result.newBases,
        runnersReachedThisInning: true,
        currentAtBatEvents: [...state.currentAtBatEvents, 'Intentional walk'],
        gameLog: [...state.gameLog, `${batter.card.name} intentionally walked`],
    };

    // Score runs
    if (result.runsScored > 0) {
        newState = scoreRuns(newState, result.runsScored, result.scoringRunners);
    }

    return advanceToNextBatter(newState);
}

/**
 * Sacrifice bunt: roll on pitcher's chart.
 * PU = batter out, runners stay.
 * Any other result = batter out, all runners advance 1 base.
 */
function handleSacBuntRoll(state: GameState, roll: number): GameState {
    const batter = getCurrentBatter(state);
    const pitcher = getCurrentPitcher(state);

    // Resolve on pitcher's chart
    const chartResult = resolvePitcherChart(pitcher.card, roll);

    let newState = { ...state };

    if (chartResult === 'PU') {
        // PU on sac bunt: batter out, runners stay
        newState.outs += 1;
        newState = recordPitcherOut(newState);
        newState.currentAtBatEvents = [...newState.currentAtBatEvents,
            `Bunt roll: ${roll} → Popup! Batter out, runners hold`];
        newState.gameLog = [...newState.gameLog,
            `${batter.card.name} pops up the bunt`];

        if (newState.outs >= 3) return endHalfInning(newState);
        return advanceToNextBatter(newState);
    }

    // Any other result: batter out, all runners advance 1 base
    newState.outs += 1;
    newState = recordPitcherOut(newState);

    // Advance runners 1 base
    let runsScored = 0;
    const scorers: string[] = [];
    const newBases = { ...state.bases };

    if (newBases.third) {
        runsScored++;
        scorers.push(newBases.third);
        newBases.third = null;
    }
    if (newBases.second) {
        newBases.third = newBases.second;
        newBases.second = null;
    }
    if (newBases.first) {
        newBases.second = newBases.first;
        newBases.first = null;
    }

    newState.bases = newBases;
    newState.currentAtBatEvents = [...newState.currentAtBatEvents,
        `Bunt roll: ${roll} → Sacrifice successful! Batter out, runners advance`];
    newState.gameLog = [...newState.gameLog,
        `${batter.card.name} sacrifices, runners advance`];

    if (runsScored > 0) {
        newState.runnersReachedThisInning = true;
        newState = scoreRuns(newState, runsScored, scorers);
    }

    if (newState.outs >= 3) return endHalfInning(newState);

    // Check walk-off
    if (newState.inning >= 9 && newState.halfInning === 'bottom' && newState.score.home > newState.score.away) {
        return { ...newState, isOver: true, winnerId: newState.homeTeam.userId, phase: 'game_over',
            gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'] };
    }

    return advanceToNextBatter(newState);
}

function handleSteal(state: GameState, runnerId: string, useSBIcon?: boolean): GameState {
    const battingTeam = getBattingTeam(state);

    if (useSBIcon) {
        // SB icon: steal without a throw
        const newIcons = { ...battingTeam.icons, sbUsed: { ...battingTeam.icons.sbUsed, [runnerId]: true } };
        const newTeam = { ...battingTeam, icons: newIcons };

        // Move runner
        let newBases = { ...state.bases };
        if (state.bases.first === runnerId && !state.bases.second) {
            newBases.first = null;
            newBases.second = runnerId;
        } else if (state.bases.second === runnerId && !state.bases.third) {
            newBases.second = null;
            newBases.third = runnerId;
        }

        const runner = battingTeam.lineup.find(p => p.cardId === runnerId);
        return {
            ...setBattingTeam(state, newTeam),
            bases: newBases,
            phase: 'pitch',
            currentAtBatEvents: [...state.currentAtBatEvents, `${runner?.card.name || 'Runner'} steals (SB icon)`],
            gameLog: [...state.gameLog, `${runner?.card.name || 'Runner'} steals using SB icon`],
        };
    }

    // Regular steal — not implemented for advanced rules (requires strategy cards in expert)
    // In advanced rules, only SB icon allows steals
    return { ...state, phase: 'pitch' };
}

function handlePitch(state: GameState, pitchRoll: number): GameState {
    const pitcher = getCurrentPitcher(state);
    const batter = getCurrentBatter(state);
    const fatiguePenalty = getFatiguePenalty(pitcher);
    const { modifier: iconModifier, descriptions } = getPitchModifiers(state);

    const totalModifier = fatiguePenalty + iconModifier;
    const { total, usePitcherChart } = resolvePitch(
        pitcher.card.control, batter.card.onBase, pitchRoll, totalModifier
    );

    const modDescriptions = [];
    if (fatiguePenalty !== 0) modDescriptions.push(`Fatigue ${fatiguePenalty}`);
    modDescriptions.push(...descriptions);

    const chartSide = usePitcherChart ? `${pitcher.card.name}'s chart` : `${batter.card.name}'s chart`;
    const log = `Pitch: ${pitchRoll} + ${pitcher.card.control}${totalModifier !== 0 ? ` (${totalModifier > 0 ? '+' : ''}${totalModifier})` : ''} = ${total} vs OB ${batter.card.onBase} → ${chartSide}`;

    return {
        ...state,
        phase: 'swing',
        pendingResult: {
            outcome: 'FB', // placeholder until swing
            pitchRoll,
            pitchTotal: total,
            swingRoll: 0,
            usedPitcherChart: usePitcherChart,
            modifiers: modDescriptions,
        },
        currentAtBatEvents: [...state.currentAtBatEvents, log],
    };
}

function handleSwing(state: GameState, swingRoll: number): GameState {
    if (!state.pendingResult) return state;

    const pitcher = getCurrentPitcher(state);
    const batter = getCurrentBatter(state);

    let outcome: Outcome;
    if (state.pendingResult.usedPitcherChart) {
        outcome = resolvePitcherChart(pitcher.card, swingRoll);
    } else {
        outcome = resolveHitterChart(batter.card, swingRoll);
    }

    const outcomeNames: Record<Outcome, string> = {
        SO: 'Strikeout', GB: 'Ground Ball', FB: 'Fly Ball', PU: 'Popup',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double',
        TR: 'Triple', HR: 'Home Run',
    };

    const log = `Swing: ${swingRoll} → ${outcomeNames[outcome]}`;

    let newState: GameState = {
        ...state,
        phase: 'result_pending',
        pendingResult: { ...state.pendingResult, outcome, swingRoll },
        currentAtBatEvents: [...state.currentAtBatEvents, log],
    };

    // Check if any icons are available — if not, auto-apply result
    const offIcons = getOffIcons(newState);
    const defIcons = getDefIcons(newState);
    if (offIcons.length === 0 && defIcons.length === 0) {
        return applyResult(newState);
    }

    return newState;
}

function handleVisionReroll(state: GameState, cardId: string): GameState {
    const team = getBattingTeam(state);
    const uses = team.icons.visionUses[cardId] || 0;
    const newIcons = { ...team.icons, visionUses: { ...team.icons.visionUses, [cardId]: uses + 1 } };
    const newTeam = { ...team, icons: newIcons };

    // Go back to swing phase for a reroll
    return {
        ...setBattingTeam(state, newTeam),
        phase: 'swing',
        currentAtBatEvents: [...state.currentAtBatEvents, 'Vision icon: rerolling'],
        gameLog: [...state.gameLog, `${getCurrentBatter(state).card.name} uses Vision icon`],
    };
}

function handleSpeedUpgrade(state: GameState, cardId: string): GameState {
    if (!state.pendingResult) return state;
    const team = getBattingTeam(state);
    const newIcons = { ...team.icons, speedUsed: { ...team.icons.speedUsed, [cardId]: true } };
    const newTeam = { ...team, icons: newIcons };

    let newState = {
        ...setBattingTeam(state, newTeam),
        pendingResult: { ...state.pendingResult, outcome: 'DB' as const },
        currentAtBatEvents: [...state.currentAtBatEvents, 'Silver Slugger: upgraded to double'],
        gameLog: [...state.gameLog, `${getCurrentBatter(state).card.name} uses Silver Slugger icon`],
    };

    // Re-check if more icons available (HR could upgrade the DB), or auto-apply
    const offIcons = getOffIcons(newState);
    const defIcons = getDefIcons(newState);
    if (offIcons.length === 0 && defIcons.length === 0) {
        return applyResult(newState);
    }
    return newState;
}

function handleHRUpgrade(state: GameState, cardId: string): GameState {
    if (!state.pendingResult) return state;
    const team = getBattingTeam(state);
    const newIcons = { ...team.icons, hrUsed: { ...team.icons.hrUsed, [cardId]: true } };
    const newTeam = { ...team, icons: newIcons };

    let newState = {
        ...setBattingTeam(state, newTeam),
        pendingResult: { ...state.pendingResult, outcome: 'HR' as const },
        currentAtBatEvents: [...state.currentAtBatEvents, 'Power icon: upgraded to HOME RUN!'],
        gameLog: [...state.gameLog, `${getCurrentBatter(state).card.name} uses HR icon`],
    };

    // Check for remaining icons (K could block), or auto-apply
    const defIcons = getDefIcons(newState);
    if (defIcons.length === 0) return applyResult(newState);
    return newState;
}

function handleKBlock(state: GameState): GameState {
    if (!state.pendingResult) return state;
    const team = getFieldingTeam(state);
    const newIcons = { ...team.icons, kUsedThisGame: true };
    const newTeam = { ...team, icons: newIcons };

    // K changes to SO — no more icons possible, auto-apply
    let newState = {
        ...setFieldingTeam(state, newTeam),
        pendingResult: { ...state.pendingResult, outcome: 'SO' as const },
        currentAtBatEvents: [...state.currentAtBatEvents, 'K icon: result changed to strikeout!'],
        gameLog: [...state.gameLog, `${getCurrentPitcher(state).card.name} uses K icon`],
    };

    return applyResult(newState);
}

function handleGoldGlove(state: GameState, cardId: string): GameState {
    const team = getFieldingTeam(state);
    const player = team.lineup.find(p => p.cardId === cardId);
    const newIcons = { ...team.icons, goldGloveUsed: { ...team.icons.goldGloveUsed, [cardId]: true } };
    const newTeam = { ...team, icons: newIcons };
    return {
        ...setFieldingTeam(state, newTeam),
        goldGloveBonus: 10,
        currentAtBatEvents: [...state.currentAtBatEvents, `Gold Glove: ${player?.card.name || 'Fielder'} +10 fielding`],
        gameLog: [...state.gameLog, `${player?.card.name || 'Fielder'} uses Gold Glove icon`],
    };
}

function handleDeclineIcon(state: GameState): GameState {
    // Apply the result — this handles all phases where icons could be used
    return applyResult(state);
}

function handleDeclineExtraBase(state: GameState, runnerId: string): GameState {
    const remaining = state.pendingExtraBases.filter(e => e.runnerId !== runnerId);
    if (remaining.length === 0) {
        return checkEndOfAtBat({ ...state, pendingExtraBases: [] });
    }
    return { ...state, pendingExtraBases: remaining };
}

function handleFieldingRoll(state: GameState, roll: number): GameState {
    // Could be DP attempt or extra base throw
    if (state.pendingResult?.outcome === 'GB' && state.phase === 'fielding_check') {
        return resolveDoublePlayRoll(state, roll);
    }
    if (state.pendingExtraBases.length > 0) {
        return resolveExtraBaseRoll(state, roll);
    }
    return state;
}

// ============================================================================
// RESULT APPLICATION
// ============================================================================

function applyResult(state: GameState): GameState {
    if (!state.pendingResult) return state;

    const outcome = state.pendingResult.outcome;
    const batter = getCurrentBatter(state);
    const isOut = ['SO', 'GB', 'FB', 'PU'].includes(outcome);

    // Apply baserunning
    const brResult = advanceRunners(state.bases, outcome, batter.cardId, state.outs);

    let newState = {
        ...state,
        bases: brResult.newBases,
        currentAtBatEvents: [...state.currentAtBatEvents, ...brResult.log],
    };

    // Track if runners reached base
    if (!isOut) {
        newState.runnersReachedThisInning = true;
    }

    // Score runs
    if (brResult.runsScored > 0) {
        newState = scoreRuns(newState, brResult.runsScored, brResult.scoringRunners);
    }

    // Handle outs
    if (isOut) {
        if (outcome === 'GB' && brResult.isDoublePlayAttempt) {
            // One out already (runner on 1st), DP attempt pending
            newState.outs += 1;
            newState = recordPitcherOut(newState);
            if (newState.outs >= 3) {
                return endHalfInning(newState);
            }
            newState.phase = 'fielding_check';
            newState.pendingExtraBases = brResult.pendingExtraBases;
            return newState;
        }

        newState.outs += 1;
        newState = recordPitcherOut(newState);
        if (newState.outs >= 3) {
            return endHalfInning(newState);
        }
    }

    // Check for extra base opportunities
    if (brResult.pendingExtraBases.length > 0 && newState.outs < 3) {
        newState.pendingExtraBases = brResult.pendingExtraBases;
        newState.phase = 'extra_base_decision';
        return newState;
    }

    return checkEndOfAtBat(newState);
}

function resolveDoublePlayRoll(state: GameState, roll: number): GameState {
    const fieldingTeam = getFieldingTeam(state);
    const batter = getCurrentBatter(state);
    const totalFielding = getTotalInfieldFielding(fieldingTeam);

    const { batterOut, log } = resolveDoublePlay(roll, totalFielding + state.goldGloveBonus, batter.card.speed);

    let newState = {
        ...state,
        currentAtBatEvents: [...state.currentAtBatEvents, log],
        gameLog: [...state.gameLog, log],
    };

    if (batterOut) {
        newState.outs += 1;
        newState = recordPitcherOut(newState);
        if (newState.outs >= 3) {
            // Third out on DP — runs don't score
            return endHalfInning(newState);
        }
    } else {
        // Batter safe at first
        newState.bases = { ...newState.bases, first: batter.cardId };
    }

    return checkEndOfAtBat(newState);
}

function resolveExtraBaseRoll(state: GameState, roll: number): GameState {
    if (state.pendingExtraBases.length === 0) return state;

    const attempt = state.pendingExtraBases[0];
    const fieldingTeam = getFieldingTeam(state);
    const battingTeam = getBattingTeam(state);
    const totalFielding = getTotalOutfieldFielding(fieldingTeam);

    const runner = battingTeam.lineup.find(p => p.cardId === attempt.runnerId);
    const runnerSpeed = runner?.card.speed || 10;

    const { runnerSafe, log } = resolveExtraBase(
        roll, totalFielding, runnerSpeed,
        attempt.toBase === 'home',
        state.outs === 2,
        state.goldGloveBonus,
    );

    let newState = {
        ...state,
        currentAtBatEvents: [...state.currentAtBatEvents, log],
        gameLog: [...state.gameLog, log],
        pendingExtraBases: state.pendingExtraBases.slice(1),
    };

    if (runnerSafe) {
        // Advance runner
        if (attempt.toBase === 'home') {
            newState = scoreRuns(newState, 1, [attempt.runnerId]);
            newState.bases = { ...newState.bases, [attempt.fromBase]: null };
        } else {
            newState.bases = {
                ...newState.bases,
                [attempt.fromBase]: null,
                [attempt.toBase]: attempt.runnerId,
            };
        }
    } else {
        // Runner out
        newState.bases = { ...newState.bases, [attempt.fromBase]: null };
        newState.outs += 1;
        newState = recordPitcherOut(newState);
        if (newState.outs >= 3) {
            return endHalfInning(newState);
        }
    }

    if (newState.pendingExtraBases.length > 0) {
        newState.phase = 'extra_base_decision';
        return newState;
    }

    return checkEndOfAtBat(newState);
}

// ============================================================================
// GAME FLOW
// ============================================================================

function scoreRuns(state: GameState, runs: number, scoringRunners: string[]): GameState {
    const side = state.halfInning === 'top' ? 'away' : 'home';
    const newScore = { ...state.score, [side]: state.score[side] + runs };

    // Track runs per inning
    const team = getBattingTeam(state);
    const inningIdx = state.inning - 1;
    const runsPerInning = [...team.runsPerInning];
    while (runsPerInning.length <= inningIdx) runsPerInning.push(0);
    runsPerInning[inningIdx] += runs;

    // Charge runs to pitcher
    const fieldingTeam = getFieldingTeam(state);
    const newPitchers = [...fieldingTeam.pitchers];
    const pitcher = newPitchers[fieldingTeam.currentPitcherIndex];
    newPitchers[fieldingTeam.currentPitcherIndex] = { ...pitcher, runsAllowed: pitcher.runsAllowed + runs };

    let result = { ...state, score: newScore };
    result = setBattingTeam(result, { ...team, runsPerInning });
    result = setFieldingTeam(result, { ...fieldingTeam, pitchers: newPitchers });
    result.gameLog = [...state.gameLog, `${runs} run(s) scored!`];
    return result;
}

function recordPitcherOut(state: GameState): GameState {
    const fieldingTeam = getFieldingTeam(state);
    const newPitchers = [...fieldingTeam.pitchers];
    const pitcher = newPitchers[fieldingTeam.currentPitcherIndex];
    newPitchers[fieldingTeam.currentPitcherIndex] = { ...pitcher, outsRecorded: pitcher.outsRecorded + 1 };
    return setFieldingTeam(state, { ...fieldingTeam, pitchers: newPitchers });
}

function checkEndOfAtBat(state: GameState): GameState {
    // Check for walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && state.score.home > state.score.away) {
        return {
            ...state,
            isOver: true,
            winnerId: state.homeTeam.userId,
            phase: 'game_over',
            gameLog: [...state.gameLog, 'Walk-off! Home team wins!'],
        };
    }

    return advanceToNextBatter(state);
}

function advanceToNextBatter(state: GameState): GameState {
    const team = getBattingTeam(state);
    const nextBatterIndex = (team.currentBatterIndex + 1) % 9;
    const newTeam = { ...team, currentBatterIndex: nextBatterIndex };
    const batter = newTeam.lineup[nextBatterIndex];

    return {
        ...setBattingTeam(state, newTeam),
        phase: 'pre_atbat',
        pendingResult: null,
        pendingExtraBases: [],
        goldGloveBonus: 0, // reset per at-bat
        currentAtBatEvents: [`Now batting: ${batter.card.name}`],
    };
}

function endHalfInning(state: GameState): GameState {
    // Check CY Young icon: +1 IP if 1-2-3 inning
    let newState = state;
    if (!state.runnersReachedThisInning) {
        const fieldingTeam = getFieldingTeam(state);
        const pitcher = fieldingTeam.pitchers[fieldingTeam.currentPitcherIndex];
        if (pitcher.card.icons.includes('CY')) {
            const newPitchers = [...fieldingTeam.pitchers];
            newPitchers[fieldingTeam.currentPitcherIndex] = { ...pitcher, cyBonusIP: pitcher.cyBonusIP + 1 };
            newState = setFieldingTeam(newState, { ...fieldingTeam, pitchers: newPitchers });
            newState.gameLog = [...newState.gameLog, `${pitcher.card.name}: CY icon grants +1 IP (1-2-3 inning)`];
        }
    }

    // Reset 20 icon for new inning
    const ft = getFieldingTeam(newState);
    const newPitchers = [...ft.pitchers];
    const p = newPitchers[ft.currentPitcherIndex];
    newPitchers[ft.currentPitcherIndex] = { ...p, twentyUsedThisInning: false };
    newState = setFieldingTeam(newState, { ...ft, pitchers: newPitchers });

    if (state.halfInning === 'top') {
        // Switch to bottom of inning
        return {
            ...newState,
            halfInning: 'bottom',
            outs: 0,
            bases: { first: null, second: null, third: null },
            phase: 'pre_atbat',
            pendingResult: null,
            pendingExtraBases: [],
            runnersReachedThisInning: false,
            goldGloveBonus: 0,
            currentAtBatEvents: [],
            gameLog: [...newState.gameLog, `--- Bottom of inning ${state.inning} ---`],
        };
    } else {
        // End of full inning — check if game is over
        if (state.inning >= 9) {
            if (state.score.home !== state.score.away) {
                // Game over
                const winner = state.score.home > state.score.away ? state.homeTeam.userId : state.awayTeam.userId;
                return {
                    ...newState,
                    isOver: true,
                    winnerId: winner,
                    phase: 'game_over',
                    gameLog: [...newState.gameLog, `Game Over! Final: ${state.score.away}-${state.score.home}`],
                };
            }
            // Tied — extra innings
        }

        // Move to next inning
        return {
            ...newState,
            inning: state.inning + 1,
            halfInning: 'top',
            outs: 0,
            bases: { first: null, second: null, third: null },
            phase: 'pre_atbat',
            pendingResult: null,
            pendingExtraBases: [],
            runnersReachedThisInning: false,
            goldGloveBonus: 0,
            currentAtBatEvents: [],
            gameLog: [...newState.gameLog, `--- Top of inning ${state.inning + 1} ---`],
        };
    }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Determine whose turn it is to act.
 */
export function whoseTurn(state: GameState): 'home' | 'away' {
    const batting = state.halfInning === 'top' ? 'away' : 'home';
    const fielding = state.halfInning === 'top' ? 'home' : 'away';

    switch (state.phase) {
        case 'pre_atbat': return batting;
        case 'defense_sub': return fielding;
        case 'offense_pre': return batting;
        case 'pitch': return fielding;
        case 'swing': return batting;
        case 'result_pending': {
            // Check who has icons to decide whose turn it is
            const offIc = getOffIcons(state);
            const defIc = getDefIcons(state);
            if (offIc.length > 0) return batting;
            if (defIc.length > 0) return fielding;
            return batting; // no icons, batting team applies result
        }
        case 'fielding_check': return fielding;
        case 'extra_base_decision': return batting;
        default: return 'home';
    }
}

export function getPhaseDescription(state: GameState): string {
    const batter = getCurrentBatter(state);
    const pitcher = getCurrentPitcher(state);

    switch (state.phase) {
        case 'pre_atbat': return `${batter.card.name} at bat. Pinch hit?`;
        case 'defense_sub': return `Pitching change or intentional walk?`;
        case 'offense_pre': return `Sacrifice bunt or steal?`;
        case 'pitch': return `${pitcher.card.name} pitching to ${batter.card.name}`;
        case 'swing': return state.pendingResult?.modifiers.includes('Sacrifice bunt') ? 'Roll for bunt' : `${batter.card.name} swings!`;
        case 'result_pending': return `Result: ${state.pendingResult?.outcome}. Use icons?`;
        case 'fielding_check': return `Fielding check`;
        case 'extra_base_decision': return `Try for extra base?`;
        case 'game_over': return `Game Over`;
        default: return '';
    }
}
