/**
 * MLB Showdown Game Engine — Server (Single Source of Truth)
 * Implements full Advanced rules: DP, extra bases, S+, fatigue, substitutions, icons.
 * Pure functions: (state, action) => newState
 */

// ============================================================================
// DICE & CHART RESOLUTION
// ============================================================================

function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

function parseRange(range) {
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

function resolveChart(chart, roll, isHitter) {
    const fields = isHitter
        ? [['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['SPlus','SPlus'],['DB','DB'],['TR','TR']]
        : [['PU','PU'],['SO','SO'],['GB','GB'],['FB','FB'],['W','W'],['S','S'],['DB','DB']];

    for (const [field, outcome] of fields) {
        const range = parseRange(chart[field]);
        if (range && roll >= range.low && roll <= range.high) return outcome;
    }
    const hrRange = parseRange(chart.HR);
    if (hrRange && roll >= hrRange.low) return 'HR';
    return 'FB';
}

// ============================================================================
// FIELDING HELPERS
// ============================================================================

function getFieldingFromSlot(positions, assignedPos) {
    if (!positions || !assignedPos || assignedPos === 'bench' || assignedPos === 'DH') return 0;
    const normalized = assignedPos.replace(/-\d+$/, ''); // "LF-RF-1" -> "LF-RF"

    // Handle composite positions like LF-RF
    if (normalized === 'LF-RF') {
        const match = positions.find(p => p.position === 'LF' || p.position === 'RF');
        return match ? match.fielding : 0;
    }
    const match = positions.find(p => p.position === normalized);
    return match ? match.fielding : 0;
}

const INFIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS'];
const OUTFIELD_POSITIONS = ['LF', 'CF', 'RF', 'LF-RF'];

function computeFieldingTotals(lineup) {
    let inf = 0, outf = 0;
    for (const p of lineup) {
        const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
        if (INFIELD_POSITIONS.includes(pos)) inf += (p.fielding || 0);
        if (OUTFIELD_POSITIONS.includes(pos)) outf += (p.fielding || 0);
    }
    return { totalInfieldFielding: inf, totalOutfieldFielding: outf };
}

// ============================================================================
// ICON HELPERS
// ============================================================================

const ICON_MAX_USES = { K: 1, G: 1, HR: 1, SB: 1, '20': 1, CY: 1, RP: 1, S: 1, V: 2 };

function canUseIcon(team, cardId, icon) {
    const usage = team.iconUsage?.[cardId]?.[icon] || 0;
    return usage < (ICON_MAX_USES[icon] || 1);
}

function recordIconUse(team, cardId, icon) {
    const newUsage = { ...team.iconUsage };
    if (!newUsage[cardId]) newUsage[cardId] = {};
    newUsage[cardId] = { ...newUsage[cardId] };
    newUsage[cardId][icon] = (newUsage[cardId][icon] || 0) + 1;
    return { ...team, iconUsage: newUsage };
}

function playerHasIcon(player, iconName) {
    return player.icons && player.icons.includes(iconName);
}

// ============================================================================
// GAME STATE INITIALIZATION
// ============================================================================

export function initializeGame(homeLineupData, awayLineupData, homeUserId, awayUserId) {
    return {
        inning: 1,
        halfInning: 'top',
        outs: 0,
        bases: { first: null, second: null, third: null },
        score: { home: 0, away: 0 },
        homeTeam: buildTeam(homeLineupData, homeUserId),
        awayTeam: buildTeam(awayLineupData, awayUserId),
        phase: 'pre_atbat',
        subPhaseStep: 'offense_first',
        lastPitchRoll: 0,
        lastPitchTotal: 0,
        lastSwingRoll: 0,
        lastOutcome: null,
        usedPitcherChart: false,
        gameLog: ['Play ball!'],
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
    };
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

    const starterSlot = slots.find(s => s.card.type === 'pitcher' && s.assignedPosition === 'Starter-1')
        || slots.find(s => s.card.type === 'pitcher' && s.assignedPosition?.startsWith('Starter'))
        || slots.find(s => s.card.type === 'pitcher');

    const pitcher = starterSlot ? toPlayer(starterSlot) : {
        cardId: 'default', name: 'Pitcher', onBase: 0, speed: 8,
        chart: { PU: '1', SO: '2-7', GB: '8-12', FB: '13-16', W: '17-18', S: '19-20' },
        icons: [], imagePath: '', type: 'pitcher', control: 4, ip: 7,
        assignedPosition: 'Starter-1', fielding: 0,
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
            assignedPosition: 'DH', fielding: 0,
        });
    }

    const lineup = batters.slice(0, 9);
    const { totalInfieldFielding, totalOutfieldFielding } = computeFieldingTotals(lineup);

    return {
        userId,
        lineup,
        pitcher,
        bullpen,
        bench,
        currentBatterIndex: 0,
        runsPerInning: [0],
        hits: 0,
        usedPlayers: [],
        iconUsage: {},
        inningsPitched: 0,
        pitcherEntryInning: 1,
        totalInfieldFielding,
        totalOutfieldFielding,
    };
}

function toPlayer(slot) {
    const c = slot.card;
    const assignedPos = slot.assignedPosition || '';
    const fielding = getFieldingFromSlot(c.positions || [], assignedPos);
    return {
        cardId: c.id || c.name, name: c.name, onBase: c.onBase || 0, speed: c.speed || 8,
        chart: c.chart || {}, icons: c.icons || [], imagePath: c.imagePath || '',
        type: c.type, control: c.control, ip: c.ip, role: c.role,
        assignedPosition: assignedPos,
        fielding,
    };
}

// ============================================================================
// WHOSE TURN
// ============================================================================

export function whoseTurn(state) {
    if (state.isOver) return null;
    const offense = state.halfInning === 'top' ? 'away' : 'home';
    const defense = state.halfInning === 'top' ? 'home' : 'away';
    switch (state.phase) {
        case 'pre_atbat':    return offense;
        case 'defense_sub':  return defense;
        case 'pitch':        return defense;
        case 'swing':        return offense;
        case 'result_icons': return state.iconPrompt?.team || offense;
        case 'extra_base':   return defense;
        default: return null;
    }
}

// ============================================================================
// PROCESS ACTION (main router)
// ============================================================================

export function processAction(state, action) {
    if (state.isOver) return state;
    switch (action.type) {
        case 'ROLL_PITCH':         return handlePitch(state);
        case 'ROLL_SWING':         return handleSwing(state);
        case 'PINCH_HIT':          return handlePinchHit(state, action);
        case 'PITCHING_CHANGE':    return handlePitchingChange(state, action);
        case 'USE_ICON':           return handleUseIcon(state, action);
        case 'EXTRA_BASE_THROW':   return handleExtraBaseThrow(state, action);
        case 'SKIP_SUB':           return handleSkipSub(state);
        case 'SKIP_ICONS':         return handleSkipIcons(state);
        case 'SKIP_EXTRA_BASE':    return handleSkipExtraBase(state);
        case 'SAC_BUNT':           return handleSacBunt(state);
        default: return state;
    }
}

// ============================================================================
// SUBSTITUTIONS
// ============================================================================

function handlePinchHit(state, action) {
    if (state.phase !== 'pre_atbat') return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = { ...state[battingSide] };
    const lineup = [...team.lineup];
    const bench = [...team.bench];

    const benchIdx = bench.findIndex(p => p.cardId === action.benchCardId);
    if (benchIdx === -1) return state;

    const idx = action.lineupIndex ?? team.currentBatterIndex;
    const oldPlayer = lineup[idx];
    const newPlayer = { ...bench[benchIdx] };

    // Pinch hitter inherits the field position and fielding of the replaced player
    newPlayer.assignedPosition = oldPlayer.assignedPosition;
    newPlayer.fielding = oldPlayer.fielding;

    lineup[idx] = newPlayer;
    bench.splice(benchIdx, 1);

    team.lineup = lineup;
    team.bench = bench;
    team.usedPlayers = [...team.usedPlayers, oldPlayer.cardId];

    // Recompute fielding totals
    const { totalInfieldFielding, totalOutfieldFielding } = computeFieldingTotals(lineup);
    team.totalInfieldFielding = totalInfieldFielding;
    team.totalOutfieldFielding = totalOutfieldFielding;

    const newState = { ...state, [battingSide]: team };
    newState.gameLog = [...state.gameLog, `${newPlayer.name} pinch-hits for ${oldPlayer.name}`];

    // Move to defense_sub phase
    return { ...newState, phase: 'defense_sub', subPhaseStep: 'defense' };
}

function handlePitchingChange(state, action) {
    if (state.phase !== 'defense_sub') return state;
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const team = { ...state[fieldingSide] };
    const bullpen = [...team.bullpen];

    const bpIdx = bullpen.findIndex(p => p.cardId === action.bullpenCardId);
    if (bpIdx === -1) return state;

    // Enforce 5-inning starter rule: starter can't leave before inning 5 unless 10+ runs scored
    const battingSide = state.halfInning === 'top' ? 'away' : 'home';
    if (team.pitcherEntryInning === 1 && state.inning < 5) {
        const runsAllowed = state.score[battingSide];
        if (runsAllowed < 10) {
            return {
                ...state,
                gameLog: [...state.gameLog, `Starter can't be removed before inning 5 (unless 10+ runs scored)`],
            };
        }
    }

    const oldPitcher = team.pitcher;
    const newPitcher = { ...bullpen[bpIdx] };
    bullpen.splice(bpIdx, 1);

    team.pitcher = newPitcher;
    team.bullpen = bullpen;
    team.usedPlayers = [...team.usedPlayers, oldPitcher.cardId];
    team.inningsPitched = 0; // reset for new pitcher
    team.pitcherEntryInning = state.inning; // mid-inning entry counts as full inning

    let newState = { ...state, [fieldingSide]: team };
    newState.gameLog = [...state.gameLog, `${newPitcher.name} replaces ${oldPitcher.name} on the mound`];

    // After defense changes pitcher, offense gets one more chance to re-pinch-hit
    if (state.subPhaseStep === 'defense') {
        const offSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
        if (newState[offSide].bench.length > 0) {
            return { ...newState, phase: 'pre_atbat', subPhaseStep: 'offense_re' };
        }
    }

    return { ...newState, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
}

function handleSkipSub(state) {
    if (state.phase === 'pre_atbat') {
        if (state.subPhaseStep === 'offense_first') {
            // Offense declined pinch hit, move to defense sub
            const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
            if (state[fieldingSide].bullpen.length > 0) {
                return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
            }
            // No bullpen, skip straight to pitch
            return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
        }
        if (state.subPhaseStep === 'offense_re') {
            // Offense declined re-pinch-hit, proceed to pitch
            return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
        }
    }
    if (state.phase === 'defense_sub') {
        // Defense declined pitcher change, proceed to pitch
        return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
    }
    return state;
}

// ============================================================================
// PRE-PITCH: check if subs are available, else auto-skip to pitch
// ============================================================================

function enterPreAtBat(state) {
    const offSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const defSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const hasBench = state[offSide].bench.length > 0;
    const hasBullpen = state[defSide].bullpen.length > 0;

    // Check for pre-pitch icon availability (SB for offense)
    const battingTeam = state[offSide];
    const bases = state.bases;
    const hasSBOption = (bases.first || bases.second || bases.third) &&
        battingTeam.lineup.some(p => playerHasIcon(p, 'SB') && canUseIcon(battingTeam, p.cardId, 'SB'));

    if (hasBench || hasSBOption) {
        return { ...state, phase: 'pre_atbat', subPhaseStep: 'offense_first' };
    }
    if (hasBullpen) {
        // Check for 20/RP icon availability for defense
        const fieldingTeam = state[defSide];
        const has20 = !state.icon20UsedThisInning &&
            playerHasIcon(fieldingTeam.pitcher, '20') &&
            canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, '20');
        const hasRP = state.inning > 6 && !state.rpActiveInning &&
            playerHasIcon(fieldingTeam.pitcher, 'RP') &&
            canUseIcon(fieldingTeam, fieldingTeam.pitcher.cardId, 'RP');
        if (hasBullpen || has20 || hasRP) {
            return { ...state, phase: 'defense_sub', subPhaseStep: 'defense' };
        }
    }

    // No subs or icons available, go straight to pitch
    return { ...state, phase: 'pitch', subPhaseStep: null, controlModifier: 0 };
}

// ============================================================================
// PITCH
// ============================================================================

function handlePitch(state) {
    if (state.phase !== 'pitch') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const battingTeam = state[battingSide];
    const pitcher = fieldingTeam.pitcher;
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];

    const roll = rollD20();
    const baseControl = pitcher.control || 0;
    const ipRating = pitcher.ip || 0;
    const fatiguePenalty = Math.max(0, fieldingTeam.inningsPitched - ipRating);

    // Control modifier from 20/RP icons
    let controlMod = state.controlModifier || 0;

    const effectiveControl = Math.max(0, baseControl - fatiguePenalty + controlMod);
    const total = roll + effectiveControl;
    const usePitcherChart = total > batter.onBase;
    const chartOwner = usePitcherChart ? pitcher.name : batter.name;

    const logs = [`${batter.name} vs ${pitcher.name}`];
    let controlStr = `${roll} + ${baseControl}`;
    if (fatiguePenalty > 0) controlStr += ` - ${fatiguePenalty}(fatigue)`;
    if (controlMod > 0) controlStr += ` + ${controlMod}(icon)`;
    logs.push(`Pitch: ${controlStr} = ${total} vs OB ${batter.onBase} -> ${chartOwner}'s chart`);

    // Reset 20 icon after one pitch (it only lasts one pitch)
    let newControlModifier = controlMod;
    if (state.icon20UsedThisInning && controlMod > 0 && !state.rpActiveInning) {
        newControlModifier = 0;
    }

    return {
        ...state,
        phase: 'swing',
        lastPitchRoll: roll,
        lastPitchTotal: total,
        usedPitcherChart: usePitcherChart,
        lastOutcome: null,
        lastSwingRoll: 0,
        fatiguePenalty,
        controlModifier: newControlModifier,
        pendingDpResult: null,
        extraBaseEligible: null,
        pendingExtraBaseResult: null,
        gameLog: [...state.gameLog, ...logs],
    };
}

// ============================================================================
// SWING
// ============================================================================

function handleSwing(state) {
    if (state.phase !== 'swing') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const pitcher = state[fieldingSide].pitcher;
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    const roll = rollD20();
    const chart = state.usedPitcherChart ? pitcher.chart : batter.chart;
    const outcome = resolveChart(chart, roll, !state.usedPitcherChart);

    const names = {
        SO: 'Strikeout', GB: 'Ground Ball', FB: 'Fly Ball', PU: 'Popup',
        W: 'Walk', S: 'Single', SPlus: 'Single+', DB: 'Double', TR: 'Triple', HR: 'HOME RUN',
    };

    let newState = {
        ...state,
        lastSwingRoll: roll,
        lastOutcome: outcome,
        gameLog: [...state.gameLog, `Swing: ${roll} -> ${names[outcome] || outcome}`],
    };

    // Check for post-result icons before applying result
    const postIcons = getPostResultIcons(newState, outcome);
    if (postIcons.length > 0) {
        return {
            ...newState,
            phase: 'result_icons',
            iconPrompt: { team: postIcons[0].team, availableIcons: postIcons.map(i => ({ cardId: i.cardId, icon: i.icon, description: i.description })) },
        };
    }

    // No icons, apply result directly
    return applyResult(newState, outcome, batter.cardId);
}

// ============================================================================
// POST-RESULT ICONS
// ============================================================================

function getPostResultIcons(state, outcome) {
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const battingTeam = state[battingSide];
    const defense = state.halfInning === 'top' ? 'home' : 'away';
    const offense = state.halfInning === 'top' ? 'away' : 'home';
    const batter = battingTeam.lineup[battingTeam.currentBatterIndex];
    const pitcher = fieldingTeam.pitcher;
    const icons = [];

    const isOut = ['SO', 'GB', 'FB', 'PU'].includes(outcome);
    const isHit = ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(outcome);

    // K icon (defense): any result becomes SO — only on hits/walks
    if ((isHit || outcome === 'W') && playerHasIcon(pitcher, 'K') && canUseIcon(fieldingTeam, pitcher.cardId, 'K')) {
        icons.push({ cardId: pitcher.cardId, icon: 'K', description: `K: Override to Strikeout`, team: defense });
    }

    // HR icon (offense): convert 2B or 3B to HR
    if ((outcome === 'DB' || outcome === 'TR') && playerHasIcon(batter, 'HR') && canUseIcon(battingTeam, batter.cardId, 'HR')) {
        icons.push({ cardId: batter.cardId, icon: 'HR', description: `HR: Convert ${outcome === 'DB' ? 'Double' : 'Triple'} to Home Run`, team: offense });
    }

    // V icon (offense): reroll an out result (2x per game)
    if (isOut && playerHasIcon(batter, 'V') && canUseIcon(battingTeam, batter.cardId, 'V')) {
        icons.push({ cardId: batter.cardId, icon: 'V', description: `V: Reroll this out (Veteran)`, team: offense });
    }

    // S icon (offense): convert 1B/SPlus to 2B
    if ((outcome === 'S' || outcome === 'SPlus') && playerHasIcon(batter, 'S') && canUseIcon(battingTeam, batter.cardId, 'S')) {
        icons.push({ cardId: batter.cardId, icon: 'S', description: `S: Convert Single to Double`, team: offense });
    }

    // G icon (defense): +10 to fielding — only relevant if DP or extra base will happen
    // We defer G to the actual DP/extra-base roll, so don't prompt here
    // (It gets checked during DP and extra base resolution)

    return icons;
}

function handleUseIcon(state, action) {
    const { cardId, icon } = action;

    // === PRE-PITCH ICONS ===
    if (state.phase === 'pre_atbat' || state.phase === 'defense_sub') {
        return handlePrePitchIcon(state, action);
    }

    // === POST-RESULT ICONS ===
    if (state.phase !== 'result_icons') return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];
    let outcome = state.lastOutcome;

    switch (icon) {
        case 'K': {
            // Defense uses K: override to SO
            let team = recordIconUse(state[fieldingSide], cardId, 'K');
            let newState = { ...state, [fieldingSide]: team, lastOutcome: 'SO', iconPrompt: null };
            newState.gameLog = [...state.gameLog, `K icon used! Result changed to Strikeout`];
            // Check if offense has V to counter
            const battingTeam = newState[battingSide];
            if (playerHasIcon(batter, 'V') && canUseIcon(battingTeam, batter.cardId, 'V')) {
                const offense = state.halfInning === 'top' ? 'away' : 'home';
                return {
                    ...newState,
                    phase: 'result_icons',
                    iconPrompt: {
                        team: offense,
                        availableIcons: [{ cardId: batter.cardId, icon: 'V', description: 'V: Reroll this Strikeout (Veteran)' }],
                    },
                };
            }
            return applyResult(newState, 'SO', batter.cardId);
        }

        case 'HR': {
            // Offense uses HR icon: convert DB/TR to HR
            let team = recordIconUse(state[battingSide], cardId, 'HR');
            let newState = { ...state, [battingSide]: team, lastOutcome: 'HR', iconPrompt: null };
            newState.gameLog = [...state.gameLog, `HR icon used! Result upgraded to Home Run!`];
            return applyResult(newState, 'HR', batter.cardId);
        }

        case 'V': {
            // Offense uses V icon: reroll (re-enter swing)
            let team = recordIconUse(state[battingSide], cardId, 'V');
            let newState = { ...state, [battingSide]: team, iconPrompt: null };
            newState.gameLog = [...state.gameLog, `V (Veteran) icon used! Rerolling...`];
            // Re-enter swing phase — the pitch result (which chart) stays the same
            return { ...newState, phase: 'swing', lastOutcome: null, lastSwingRoll: 0 };
        }

        case 'S': {
            // Offense uses S icon: convert single to double
            let team = recordIconUse(state[battingSide], cardId, 'S');
            let newState = { ...state, [battingSide]: team, lastOutcome: 'DB', iconPrompt: null };
            newState.gameLog = [...state.gameLog, `S (Speed) icon used! Single upgraded to Double`];
            return applyResult(newState, 'DB', batter.cardId);
        }

        default:
            return state;
    }
}

function handleSkipIcons(state) {
    if (state.phase !== 'result_icons') return state;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];
    return applyResult({ ...state, iconPrompt: null }, state.lastOutcome, batter.cardId);
}

// ============================================================================
// PRE-PITCH ICONS (SB, 20, RP)
// ============================================================================

function handlePrePitchIcon(state, action) {
    const { cardId, icon } = action;

    if (icon === 'SB') {
        // Steal: runner advances one base without a throw
        const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
        let team = recordIconUse(state[battingSide], cardId, 'SB');
        const bases = { ...state.bases };
        const logs = [];

        // Find the runner with SB icon and advance them
        // Advance the lead runner first
        if (bases.third && bases.third === cardId) {
            // Can't steal home with SB icon in standard rules — skip
        } else if (bases.second === cardId) {
            if (!bases.third) {
                bases.third = bases.second;
                bases.second = null;
                logs.push(`${findPlayerName(team, cardId)} steals third! (SB icon)`);
            }
        } else if (bases.first === cardId) {
            if (!bases.second) {
                bases.second = bases.first;
                bases.first = null;
                logs.push(`${findPlayerName(team, cardId)} steals second! (SB icon)`);
            }
        }

        // If targeted runner isn't a base runner, find one that has SB
        if (logs.length === 0) {
            // Try to find any runner with SB
            for (const base of ['first', 'second']) {
                const runnerId = bases[base];
                if (!runnerId) continue;
                const runner = team.lineup.find(p => p.cardId === runnerId);
                if (runner && playerHasIcon(runner, 'SB') && canUseIcon(team, runner.cardId, 'SB')) {
                    const nextBase = base === 'first' ? 'second' : 'third';
                    if (!bases[nextBase]) {
                        team = recordIconUse(team, runner.cardId, 'SB');
                        bases[nextBase] = runnerId;
                        bases[base] = null;
                        logs.push(`${runner.name} steals ${nextBase}! (SB icon)`);
                        break;
                    }
                }
            }
        }

        let newState = { ...state, [battingSide]: team, bases };
        newState.gameLog = [...state.gameLog, ...logs];
        // Continue to defense_sub
        return handleSkipSub(newState);
    }

    if (icon === '20') {
        // +3 control for one pitch this inning
        const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
        let team = recordIconUse(state[fieldingSide], cardId, '20');
        let newState = {
            ...state,
            [fieldingSide]: team,
            controlModifier: (state.controlModifier || 0) + 3,
            icon20UsedThisInning: true,
        };
        newState.gameLog = [...state.gameLog, `20 icon: +3 control for this pitch`];
        return { ...newState, phase: 'pitch', subPhaseStep: null };
    }

    if (icon === 'RP') {
        // +3 control for full inning after 6th
        if (state.inning <= 6) return state;
        const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
        let team = recordIconUse(state[fieldingSide], cardId, 'RP');
        let newState = {
            ...state,
            [fieldingSide]: team,
            controlModifier: (state.controlModifier || 0) + 3,
            rpActiveInning: state.inning,
        };
        newState.gameLog = [...state.gameLog, `RP icon: +3 control for this inning`];
        return { ...newState, phase: 'pitch', subPhaseStep: null };
    }

    return state;
}

function findPlayerName(team, cardId) {
    const p = team.lineup.find(p => p.cardId === cardId);
    return p ? p.name : 'Runner';
}

// ============================================================================
// APPLY RESULT (baserunning + DP + extra base checks)
// ============================================================================

function applyResult(state, outcome, batterId) {
    const bases = { ...state.bases };
    let outs = state.outs;
    let runs = 0;
    const logs = [];
    const side = state.halfInning === 'top' ? 'away' : 'home';
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const fieldingTeam = state[fieldingSide];
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];
    let pendingDpResult = null;
    let halfInningClean = state.halfInningClean;

    switch (outcome) {
        case 'SO':
        case 'PU':
            outs++;
            break;

        case 'GB': {
            outs++;
            // DP check: runner on 1st and less than 3 outs (after this one)
            if (bases.first && outs < 3) {
                const dpRoll = rollD20();
                let ifFielding = fieldingTeam.totalInfieldFielding;

                // Check G (Gold Glove) icon availability for defense
                const gPlayer = fieldingTeam.lineup.find(p =>
                    playerHasIcon(p, 'G') && canUseIcon(fieldingTeam, p.cardId, 'G')
                );
                let goldGloveUsed = false;
                if (gPlayer) {
                    ifFielding += 10;
                    goldGloveUsed = true;
                    // Record G usage
                    const updatedTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
                    // We'll apply this team update below
                    state = { ...state, [fieldingSide]: updatedTeam };
                    logs.push(`G (Gold Glove) icon: +10 to fielding!`);
                }

                const defenseTotal = dpRoll + ifFielding;
                const batterSpeed = batter.speed;

                if (defenseTotal > batterSpeed) {
                    // DP successful
                    outs++;
                    const runnerOnFirst = bases.first;
                    bases.first = null;
                    if (bases.third) { runs++; logs.push('Runner scores from 3rd on DP'); }
                    bases.third = bases.second || null;
                    bases.second = null;
                    logs.push(`Double Play! d20(${dpRoll}) + IF(${ifFielding}) = ${defenseTotal} > Speed ${batterSpeed}`);
                    pendingDpResult = { roll: dpRoll, defenseTotal, offenseSpeed: batterSpeed, isDP: true, goldGloveUsed };
                } else {
                    // DP failed: batter out, runners advance 1
                    if (bases.third) { runs++; logs.push('Runner scores from 3rd'); }
                    bases.third = bases.second || null;
                    bases.second = bases.first;
                    bases.first = null;
                    logs.push(`DP avoided. d20(${dpRoll}) + IF(${ifFielding}) = ${defenseTotal} <= Speed ${batterSpeed}`);
                    pendingDpResult = { roll: dpRoll, defenseTotal, offenseSpeed: batterSpeed, isDP: false, goldGloveUsed };
                }
            } else if (!bases.first) {
                // Regular GB out — runners on 2nd/3rd advance 1
                if (bases.third && outs < 3) { runs++; logs.push('Runner scores from 3rd on groundout'); }
                if (bases.second && outs < 3) {
                    bases.third = bases.second;
                    bases.second = null;
                }
            }
            break;
        }

        case 'FB':
            outs++;
            // Tag-up: runner on 3rd can score on fly out with <3 outs
            // This will be handled by extra base check below
            break;

        case 'W':
            if (bases.first) {
                if (bases.second) {
                    if (bases.third) { runs++; logs.push('Runner scores on walk'); }
                    bases.third = bases.second;
                }
                bases.second = bases.first;
            }
            bases.first = batterId;
            halfInningClean = false;
            break;

        case 'S': {
            if (bases.third) { runs++; logs.push('Runner scores from third'); }
            bases.third = bases.second || null;
            bases.second = bases.first || null;
            bases.first = batterId;
            halfInningClean = false;
            break;
        }

        case 'SPlus': {
            // S+: runners advance one extra base vs regular single
            if (bases.third) { runs++; }
            if (bases.second) { runs++; logs.push('Runner scores from 2nd on S+'); }
            if (bases.first) { bases.third = bases.first; }
            else { bases.third = null; }
            bases.second = null;
            bases.first = batterId;
            halfInningClean = false;
            break;
        }

        case 'DB': {
            if (bases.third) { runs++; }
            if (bases.second) { runs++; }
            if (bases.first) { bases.third = bases.first; }
            else { bases.third = null; }
            bases.second = batterId;
            bases.first = null;
            halfInningClean = false;
            break;
        }

        case 'TR': {
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            bases.third = batterId;
            bases.second = null;
            bases.first = null;
            halfInningClean = false;
            break;
        }

        case 'HR': {
            if (bases.third) runs++;
            if (bases.second) runs++;
            if (bases.first) runs++;
            runs++;
            if (runs > 1) logs.push(`${runs}-run homer!`);
            else logs.push('Solo home run!');
            bases.first = null; bases.second = null; bases.third = null;
            halfInningClean = false;
            break;
        }
    }

    // Track hits
    const isHit = ['S', 'SPlus', 'DB', 'TR', 'HR'].includes(outcome);
    if (isHit) halfInningClean = false;

    // Update score
    const newScore = { ...state.score };
    newScore[side] += runs;

    // Update batting team stats
    const battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;
    if (isHit) battingTeam.hits = (battingTeam.hits || 0) + 1;

    let newState = {
        ...state,
        bases, outs, score: newScore, pendingDpResult, halfInningClean,
        gameLog: [...state.gameLog, ...logs],
        [battingSide]: battingTeam,
    };

    // Check 3 outs
    if (outs >= 3) {
        return endHalfInning(newState);
    }

    // Check walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState,
            phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'],
        };
    }

    // Check extra base eligibility
    const extraBaseEligible = checkExtraBaseEligible(newState, outcome);
    if (extraBaseEligible && extraBaseEligible.length > 0) {
        return {
            ...newState,
            phase: 'extra_base',
            extraBaseEligible,
        };
    }

    // Advance to next batter
    return advanceBatter(newState);
}

// ============================================================================
// EXTRA BASE ATTEMPTS
// ============================================================================

function checkExtraBaseEligible(state, outcome) {
    const bases = state.bases;
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = state[battingSide];
    const eligible = [];

    // Extra bases apply on: S, SPlus, DB, FB (tag-up)
    if (outcome === 'S' || outcome === 'SPlus') {
        // Runner on 3rd already scored. Runner now on 3rd (was on 2nd) can try to score.
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                eligible.push({
                    runnerId: runner.cardId, runnerName: runner.name,
                    fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed,
                });
            }
        }
        // Runner now on 2nd (was on 1st) can try for 3rd
        if (bases.second) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.second);
            if (runner) {
                eligible.push({
                    runnerId: runner.cardId, runnerName: runner.name,
                    fromBase: 'second', toBase: 'third', runnerSpeed: runner.speed,
                });
            }
        }
    }

    if (outcome === 'DB') {
        // Runner on 3rd (was on 1st) can try to score
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                eligible.push({
                    runnerId: runner.cardId, runnerName: runner.name,
                    fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed,
                });
            }
        }
    }

    if (outcome === 'FB' && state.outs < 3) {
        // Tag-up: runner on 3rd can try to score on fly out
        if (bases.third) {
            const runner = battingTeam.lineup.find(p => p.cardId === bases.third);
            if (runner) {
                eligible.push({
                    runnerId: runner.cardId, runnerName: runner.name,
                    fromBase: 'third', toBase: 'home', runnerSpeed: runner.speed,
                });
            }
        }
    }

    return eligible.length > 0 ? eligible : null;
}

function handleExtraBaseThrow(state, action) {
    if (state.phase !== 'extra_base') return state;
    const eligible = state.extraBaseEligible;
    if (!eligible || eligible.length === 0) return advanceBatter({ ...state, extraBaseEligible: null });

    const target = eligible.find(e => e.runnerId === action.runnerId);
    if (!target) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const fieldingTeam = state[fieldingSide];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    const roll = rollD20();
    let ofFielding = fieldingTeam.totalOutfieldFielding;

    // Check G icon for defense
    const gPlayer = fieldingTeam.lineup.find(p =>
        playerHasIcon(p, 'G') && canUseIcon(fieldingTeam, p.cardId, 'G')
    );
    let goldGloveUsed = false;
    let updatedFieldingTeam = fieldingTeam;
    if (gPlayer) {
        ofFielding += 10;
        goldGloveUsed = true;
        updatedFieldingTeam = recordIconUse(fieldingTeam, gPlayer.cardId, 'G');
    }

    let defenseTotal = roll + ofFielding;
    if (target.toBase === 'home') defenseTotal += 5;   // +5 going home
    if (state.outs === 2) defenseTotal += 5;            // +5 with 2 outs

    const safe = target.runnerSpeed > defenseTotal;
    const bases = { ...state.bases };
    const newScore = { ...state.score };
    const logs = [];
    let outs = state.outs;

    if (safe) {
        // Runner advances
        if (target.toBase === 'home') {
            newScore[side]++;
            bases[target.fromBase] = null;
            logs.push(`${target.runnerName} scores! Speed ${target.runnerSpeed} > d20(${roll}) + OF(${ofFielding})${target.toBase === 'home' ? '+5' : ''} = ${defenseTotal}`);
        } else {
            bases[target.toBase] = bases[target.fromBase];
            bases[target.fromBase] = null;
            logs.push(`${target.runnerName} advances to ${target.toBase}! Speed ${target.runnerSpeed} > ${defenseTotal}`);
        }
    } else {
        // Runner is out
        outs++;
        bases[target.fromBase] = null;
        logs.push(`${target.runnerName} thrown out! Speed ${target.runnerSpeed} <= d20(${roll}) + OF(${ofFielding})${target.toBase === 'home' ? '+5' : ''} = ${defenseTotal}`);
    }

    const pendingExtraBaseResult = {
        runnerId: target.runnerId, runnerName: target.runnerName,
        roll, defenseTotal, runnerSpeed: target.runnerSpeed, safe, goldGloveUsed,
    };

    // Update batting team runs per inning
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = { ...state[battingSide] };
    if (safe && target.toBase === 'home') {
        const rpi = [...battingTeam.runsPerInning];
        while (rpi.length < state.inning) rpi.push(0);
        rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + 1;
        battingTeam.runsPerInning = rpi;
    }

    let newState = {
        ...state,
        bases, outs, score: newScore, pendingExtraBaseResult,
        [fieldingSide]: updatedFieldingTeam,
        [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
    };

    // Remove thrown-at runner from eligible list
    const remaining = eligible.filter(e => e.runnerId !== target.runnerId);

    if (outs >= 3) return endHalfInning(newState);

    // Check walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState,
            phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'],
        };
    }

    // If more eligible runners and defense might want to throw again
    if (remaining.length > 0) {
        return { ...newState, extraBaseEligible: remaining, phase: 'extra_base' };
    }

    return advanceBatter({ ...newState, extraBaseEligible: null });
}

function handleSkipExtraBase(state) {
    if (state.phase !== 'extra_base') return state;
    // All eligible runners advance freely
    const eligible = state.extraBaseEligible || [];
    const bases = { ...state.bases };
    const newScore = { ...state.score };
    const side = state.halfInning === 'top' ? 'away' : 'home';
    const logs = [];

    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = { ...state[battingSide] };
    let extraRuns = 0;

    for (const runner of eligible) {
        if (runner.toBase === 'home') {
            newScore[side]++;
            extraRuns++;
            bases[runner.fromBase] = null;
            logs.push(`${runner.runnerName} scores (no throw)`);
        } else {
            bases[runner.toBase] = bases[runner.fromBase];
            bases[runner.fromBase] = null;
            logs.push(`${runner.runnerName} advances to ${runner.toBase} (no throw)`);
        }
    }

    if (extraRuns > 0) {
        const rpi = [...battingTeam.runsPerInning];
        while (rpi.length < state.inning) rpi.push(0);
        rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + extraRuns;
        battingTeam.runsPerInning = rpi;
    }

    let newState = {
        ...state,
        bases, score: newScore, extraBaseEligible: null,
        [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
    };

    // Check walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState,
            phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'],
        };
    }

    return advanceBatter(newState);
}

// ============================================================================
// SAC BUNT
// ============================================================================

function handleSacBunt(state) {
    if (state.phase !== 'pre_atbat') return state;
    if (!state.bases.first && !state.bases.second && !state.bases.third) return state;

    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const pitcher = state[fieldingSide].pitcher;
    const batter = state[battingSide].lineup[state[battingSide].currentBatterIndex];

    // Sac bunt rolls on pitcher chart
    const roll = rollD20();
    const chartResult = resolveChart(pitcher.chart, roll, false);

    const bases = { ...state.bases };
    let outs = state.outs + 1; // batter is always out on sac bunt
    let runs = 0;
    const logs = [`${batter.name} lays down a sacrifice bunt (roll: ${roll})`];
    const side = state.halfInning === 'top' ? 'away' : 'home';

    if (chartResult === 'PU') {
        // PU on bunt = out, runners do NOT advance
        logs.push('Popup! Runners hold.');
    } else {
        // All other results: out + runners advance 1 base
        if (bases.third) { runs++; logs.push('Runner scores from 3rd on sac bunt'); }
        bases.third = bases.second || null;
        bases.second = bases.first || null;
        bases.first = null;
    }

    const newScore = { ...state.score };
    newScore[side] += runs;

    const battingTeam = { ...state[battingSide] };
    const rpi = [...battingTeam.runsPerInning];
    while (rpi.length < state.inning) rpi.push(0);
    rpi[state.inning - 1] = (rpi[state.inning - 1] || 0) + runs;
    battingTeam.runsPerInning = rpi;

    let newState = {
        ...state,
        bases, outs, score: newScore,
        lastOutcome: 'PU', // bunt out
        [battingSide]: battingTeam,
        gameLog: [...state.gameLog, ...logs],
    };

    if (outs >= 3) return endHalfInning(newState);

    // Check walk-off
    if (state.inning >= 9 && state.halfInning === 'bottom' && newScore.home > newScore.away) {
        return {
            ...newState,
            phase: 'game_over', isOver: true, winnerId: state.homeTeam.userId,
            gameLog: [...newState.gameLog, 'Walk-off! Home team wins!'],
        };
    }

    return advanceBatter(newState);
}

// ============================================================================
// ADVANCE BATTER / END HALF INNING
// ============================================================================

function advanceBatter(state) {
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const team = { ...state[battingSide] };
    team.currentBatterIndex = (team.currentBatterIndex + 1) % 9;
    let s = { ...state, [battingSide]: team };
    return enterPreAtBat(s);
}

function endHalfInning(state) {
    // Advance batting team's batter index for next time
    const battingSide = state.halfInning === 'top' ? 'awayTeam' : 'homeTeam';
    const battingTeam = { ...state[battingSide] };
    battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % 9;

    // Increment IP for fielding team
    const fieldingSide = state.halfInning === 'top' ? 'homeTeam' : 'awayTeam';
    let fieldingTeam = { ...state[fieldingSide] };
    fieldingTeam.inningsPitched = (fieldingTeam.inningsPitched || 0) + 1;

    // CY (Cy Young) icon: if clean half-inning, +1 effective IP
    if (state.halfInningClean && playerHasIcon(fieldingTeam.pitcher, 'CY')) {
        const pitcher = fieldingTeam.pitcher;
        if (canUseIcon(fieldingTeam, pitcher.cardId, 'CY')) {
            fieldingTeam = recordIconUse(fieldingTeam, pitcher.cardId, 'CY');
            // We don't actually change IP — we reduce inningsPitched to simulate +1 IP
            fieldingTeam.inningsPitched = Math.max(0, fieldingTeam.inningsPitched - 1);
            state = { ...state, gameLog: [...state.gameLog, `CY icon: ${pitcher.name} threw a 1-2-3 inning! +1 effective IP`] };
        }
    }

    let s = { ...state, [battingSide]: battingTeam, [fieldingSide]: fieldingTeam };

    if (state.halfInning === 'top') {
        // Check: skip bottom of 9th+ if home is already winning
        if (state.inning >= 9 && state.score.home > state.score.away) {
            const winner = state.homeTeam.userId;
            return {
                ...s, phase: 'game_over', isOver: true, winnerId: winner,
                gameLog: [...s.gameLog, `Game Over! Home team wins ${state.score.home}-${state.score.away}`],
            };
        }

        return {
            ...s,
            halfInning: 'bottom', outs: 0,
            bases: { first: null, second: null, third: null },
            phase: 'pre_atbat', subPhaseStep: 'offense_first',
            lastOutcome: null, pendingDpResult: null, extraBaseEligible: null, pendingExtraBaseResult: null,
            iconPrompt: null, halfInningClean: true, icon20UsedThisInning: false,
            controlModifier: s.rpActiveInning === state.inning ? s.controlModifier : 0,
            gameLog: [...s.gameLog, `--- Bottom of ${state.inning} ---`],
        };
    }

    // End of full inning
    if (state.inning >= 9 && state.score.home !== state.score.away) {
        const winner = state.score.home > state.score.away ? state.homeTeam.userId : state.awayTeam.userId;
        return {
            ...s, phase: 'game_over', isOver: true, winnerId: winner,
            gameLog: [...s.gameLog, `Game Over! ${state.score.away}-${state.score.home}`],
        };
    }

    // Ensure runs arrays for next inning
    const away = { ...s.awayTeam, runsPerInning: [...s.awayTeam.runsPerInning] };
    const home = { ...s.homeTeam, runsPerInning: [...s.homeTeam.runsPerInning] };
    while (away.runsPerInning.length < state.inning + 1) away.runsPerInning.push(0);
    while (home.runsPerInning.length < state.inning + 1) home.runsPerInning.push(0);

    // Reset RP control modifier if inning is over
    const newControlMod = (s.rpActiveInning === state.inning + 1) ? s.controlModifier : 0;

    return {
        ...s,
        awayTeam: away, homeTeam: home,
        inning: state.inning + 1, halfInning: 'top',
        outs: 0, bases: { first: null, second: null, third: null },
        phase: 'pre_atbat', subPhaseStep: 'offense_first',
        lastOutcome: null, pendingDpResult: null, extraBaseEligible: null, pendingExtraBaseResult: null,
        iconPrompt: null, halfInningClean: true, icon20UsedThisInning: false,
        controlModifier: newControlMod,
        gameLog: [...s.gameLog, `--- Top of ${state.inning + 1} ---`],
    };
}

// ============================================================================
// HELPERS
// ============================================================================

export function getCurrentBatter(state) {
    const team = state.halfInning === 'top' ? state.awayTeam : state.homeTeam;
    return team.lineup[team.currentBatterIndex];
}

export function getCurrentPitcher(state) {
    const team = state.halfInning === 'top' ? state.homeTeam : state.awayTeam;
    return team.pitcher;
}
