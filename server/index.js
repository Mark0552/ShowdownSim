/**
 * MLB Showdown Game Server
 *
 * Express + WebSocket server that:
 * - Manages game rooms (create, join, start)
 * - Runs the game engine server-side (dice rolls happen here)
 * - Validates whose turn it is
 * - Pushes state to both players via WebSocket
 * - Persists game state to Supabase
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { initializeGame, processAction, whoseTurn } from './engine/index.js';
import { computeRunnerMovements } from './engine/movements.js';
import {
    initializeDraft, applyDraftPick, isDraftComplete, whoseDraftTurn,
    buildLineupFromDraftedTeam, validateSubmittedLineup,
} from './engine/draft.js';
import { getAllCards } from './cards.js';

// Try to pre-load the card pool. If the data files aren't present (e.g. a
// deploy that didn't ship server/data/*.json), don't crash the server —
// lineup-mode games still work without it. Draft-mode games will surface
// the error per-action when getAllCards() is called.
try {
    const n = getAllCards().length;
    console.log(`Card pool loaded: ${n} cards`);
} catch (err) {
    console.warn('Card pool not available — draft mode will fail:', err.message);
}

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdvgjiklswargnqrqiet.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

/**
 * Fallback for seriesContext when series.reliever_history hasn't been synced
 * yet. Scans every finished game's bullpen + archivedPlayers for non-starter
 * pitchers with bf > 0 and attributes them to the creator or opponent bucket
 * based on each game's home_user_id. Mirrors the client's
 * syncSeriesRelieverHistoryFromGames. Takes an array of games and the
 * creator's user_id.
 */
function deriveRelieverHistoryFromGames(games, creatorUserId) {
    const history = { creator: {}, opponent: {} };
    const finished = games
        .filter(g => g.status === 'finished' && g.state)
        .sort((a, b) => a.game_number - b.game_number);
    for (const game of finished) {
        for (const side of ['home', 'away']) {
            const team = game.state && game.state[`${side}Team`];
            if (!team) continue;
            const sideUserId = side === 'home' ? game.home_user_id : game.away_user_id;
            const bucket = sideUserId === creatorUserId ? 'creator' : 'opponent';
            const pitcherStats = team.pitcherStats || {};
            const pool = [];
            if (team.pitcher) pool.push(team.pitcher);
            for (const p of team.bullpen || []) pool.push(p);
            if (team.archivedPlayers) {
                for (const id of Object.keys(team.archivedPlayers)) {
                    if (team.archivedPlayers[id].type === 'pitcher') pool.push(team.archivedPlayers[id]);
                }
            }
            for (const p of pool) {
                if (!p || !p.cardId) continue;
                if (p.role === 'Starter') continue;
                const stats = pitcherStats[p.cardId];
                if (!stats || (stats.bf || 0) === 0) continue;
                const list = history[bucket][p.cardId] = history[bucket][p.cardId] || [];
                if (!list.includes(game.game_number)) list.push(game.game_number);
            }
        }
    }
    return history;
}

/**
 * Fallback for seriesContext when series.starter_offset hasn't been synced
 * yet. Scans game 1's home team for the Starter-N assignment (active pitcher
 * + bullpen + archivedPlayers, so a mid-game pitching change doesn't hide
 * the original starter). Returns 1-4 or null. Mirror of the client's
 * findGame1StarterNumber in game/src/lib/games.ts.
 */
function deriveStarterOffsetFromGame1(state) {
    const home = state?.homeTeam;
    if (!home) return null;
    const stats = home.pitcherStats || {};
    const pool = [home.pitcher, ...(home.bullpen || [])];
    if (home.archivedPlayers) {
        for (const id of Object.keys(home.archivedPlayers)) {
            if (!pool.find(p => p && p.cardId === id)) pool.push(home.archivedPlayers[id]);
        }
    }
    let best = null;
    for (const p of pool) {
        if (!p) continue;
        const m = String(p.assignedPosition || '').match(/^Starter-(\d+)$/);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        if (!num || num < 1 || num > 4) continue;
        const bf = (stats[p.cardId] && stats[p.cardId].bf) || 0;
        if (!best || bf > best.bf) best = { num, bf };
    }
    return best ? best.num : null;
}

// ============================================================================
// EXPRESS
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'MLB Showdown Game Server', rooms: rooms.size });
});

app.get('/health', (req, res) => {
    res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
});

const server = createServer(app);

// ============================================================================
// GAME ROOMS
// ============================================================================

// Map<gameId, Room>
const rooms = new Map();

class Room {
    constructor(gameId) {
        this.gameId = gameId;
        this.players = new Map(); // userId -> { ws, role }
        this.state = null;       // play state OR draft state (state.type==='draft')
        this.homeUserId = null;
        this.awayUserId = null;
        this.mode = 'lineup';    // 'lineup' | 'draft' — set from games.mode on first join
        // For draft mode: each player must signal READY_FOR_DRAFT before the
        // draft state is initialized. Both must be present + ready to start.
        this.draftReady = { home: false, away: false };
    }

    addPlayer(userId, role, ws) {
        this.players.set(userId, { ws, role });
        if (role === 'home') this.homeUserId = userId;
        if (role === 'away') this.awayUserId = userId;
    }

    removePlayer(userId) {
        this.players.delete(userId);
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        for (const [, { ws }] of this.players) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }

    sendTo(userId, message) {
        const player = this.players.get(userId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    }

    getRole(userId) {
        return this.players.get(userId)?.role || null;
    }
}

// ============================================================================
// WEBSOCKET
// ============================================================================

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    let userId = null;
    let currentRoom = null;

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            return;
        }

        switch (msg.type) {
            case 'join_game':
                handleJoinGame(ws, msg, (uid, room) => {
                    userId = uid;
                    currentRoom = room;
                });
                break;

            case 'action':
                handleAction(ws, msg, userId, currentRoom);
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            default:
                ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
        }
    });

    ws.on('close', () => {
        if (currentRoom && userId) {
            currentRoom.removePlayer(userId);
            currentRoom.broadcast({ type: 'player_left', userId });
            // Clean up empty rooms after a delay
            setTimeout(() => {
                if (currentRoom.players.size === 0) {
                    rooms.delete(currentRoom.gameId);
                }
            }, 60000);
        }
    });
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

async function handleJoinGame(ws, msg, setContext) {
    const { gameId, userId, role, lineupData, seriesContext } = msg;

    if (!gameId || !userId || !role) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing gameId, userId, or role' }));
        return;
    }

    // Get or create room
    let room = rooms.get(gameId);
    if (!room) {
        room = new Room(gameId);
        rooms.set(gameId, room);
    }

    room.addPlayer(userId, role, ws);
    setContext(userId, room);

    // Store lineup data on the room
    if (lineupData) {
        if (role === 'home') room.homeLineup = lineupData;
        if (role === 'away') room.awayLineup = lineupData;
    }

    ws.send(JSON.stringify({ type: 'joined', gameId, role, players: room.players.size }));

    // Store series context if provided
    if (seriesContext) room.seriesContext = seriesContext;

    // Fork: draft-mode games take a totally separate path from lineup-mode.
    // We need games.mode + games.state from the DB to decide. Lineup-mode
    // games skip this and fall through to the existing flow below.
    if (supabase) {
        try {
            const { data: gameRow } = await supabase
                .from('games')
                .select('mode, status, state')
                .eq('id', gameId).single();
            if (gameRow?.mode === 'draft') {
                room.mode = 'draft';
                await handleDraftJoin(ws, userId, room, gameRow);
                return; // do NOT fall through to lineup-mode logic
            }
        } catch { /* fall through to lineup-mode logic */ }
    }

    // If both players are in and we have lineups, start or resume the game
    if (room.homeUserId && room.awayUserId && room.homeLineup && room.awayLineup && !room.state) {
        // Try to load existing state from Supabase first (reconnection after room expired).
        // Also fetch the game row's series_id + game_number so we can build an
        // authoritative seriesContext server-side — the client's seriesContext
        // has occasionally arrived undefined due to a race (series row not yet
        // synced when the game-2 lobby navigation fires), causing the server
        // to fall through to sp_roll and then persist that bad state.
        let loadedState = null;
        let dbSeriesId = null;
        let dbGameNumber = 1;
        if (supabase) {
            try {
                const { data } = await supabase
                    .from('games')
                    .select('state, status, series_id, game_number')
                    .eq('id', gameId).single();
                if (data) {
                    dbSeriesId = data.series_id || null;
                    dbGameNumber = data.game_number || 1;
                    // Load saved state regardless of status. handleAction already
                    // blocks actions on isOver games, so restoring a finished
                    // state is safe — the client just sees the game-over UI and
                    // the ready-up button. Skipping this load for finished
                    // games would fall through to initializeGame() and
                    // overwrite the row with a fresh sp_roll, which previously
                    // obliterated finished game 1 of a live series whenever
                    // someone opened the awaiting-next lobby entry.
                    if (data.state
                        && data.state.awayTeam?.lineup && data.state.homeTeam?.lineup) {
                        loadedState = data.state;
                    }
                }
                // Self-heal: series game 2+ should never be in sp_roll. If a
                // prior race persisted one, discard so we re-init fresh with
                // the authoritative seriesContext below.
                if (loadedState && dbGameNumber > 1 && loadedState.phase === 'sp_roll') {
                    console.warn(`Discarding corrupt sp_roll state for series game ${dbGameNumber} (${gameId})`);
                    loadedState = null;
                }
            } catch (e) { /* no saved state, start fresh */ }
        }

        // Build authoritative seriesContext from DB — only for games 2+.
        // Ignores client-sent seriesContext so races can't produce sp_roll.
        let authoritativeSeriesContext = null;
        if (!loadedState && dbSeriesId && dbGameNumber > 1 && supabase) {
            try {
                const { data: series } = await supabase
                    .from('series')
                    .select('home_user_id, starter_offset, reliever_history')
                    .eq('id', dbSeriesId).single();
                let offset = series?.starter_offset || 0;
                // Fallback: if series.starter_offset hasn't been synced yet
                // (race: game-1 game-over effect didn't commit before game-2
                // advance), derive it from game-1's saved state directly.
                if (!offset) {
                    try {
                        const { data: game1 } = await supabase
                            .from('games')
                            .select('state')
                            .eq('series_id', dbSeriesId)
                            .eq('game_number', 1)
                            .single();
                        if (game1?.state) {
                            offset = deriveStarterOffsetFromGame1(game1.state) || 0;
                        }
                    } catch { /* fall through */ }
                }
                if (!offset) offset = 1;

                // Same race for reliever_history — the client's sync is
                // fire-and-forget at game-over, and the advance countdown is
                // only 2s. Derive from finished games directly when the
                // stored history is empty / absent.
                let relieverHistory = series?.reliever_history;
                const emptyHistory = !relieverHistory
                    || (Object.keys(relieverHistory.creator || {}).length === 0
                        && Object.keys(relieverHistory.opponent || {}).length === 0
                        && Object.keys(relieverHistory.home || {}).length === 0
                        && Object.keys(relieverHistory.away || {}).length === 0);
                if (emptyHistory && series?.home_user_id) {
                    try {
                        const { data: siblingGames } = await supabase
                            .from('games')
                            .select('game_number, status, state, home_user_id, away_user_id')
                            .eq('series_id', dbSeriesId);
                        if (siblingGames && siblingGames.length > 0) {
                            relieverHistory = deriveRelieverHistoryFromGames(siblingGames, series.home_user_id);
                        }
                    } catch { /* fall through */ }
                }
                if (!relieverHistory) relieverHistory = { creator: {}, opponent: {} };

                authoritativeSeriesContext = {
                    gameNumber: dbGameNumber,
                    homeStarterOffset: offset,
                    awayStarterOffset: offset,
                    relieverHistory,
                    creatorUserId: series?.home_user_id || null,
                };
            } catch (e) {
                console.warn(`Series context fetch failed for game ${gameId}:`, e.message);
                // Fallback: still prevent sp_roll by supplying a minimal context.
                // offset=1 is arbitrary but the rotation formula will still
                // produce deterministic starters; better than re-rolling.
                authoritativeSeriesContext = {
                    gameNumber: dbGameNumber,
                    homeStarterOffset: 1,
                    awayStarterOffset: 1,
                    relieverHistory: { creator: {}, opponent: {} },
                    creatorUserId: null,
                };
            }
        }

        if (loadedState) {
            room.state = loadedState;
            console.log(`Restored game ${gameId} from Supabase`);
        } else {
            const ctx = authoritativeSeriesContext || room.seriesContext;
            room.state = initializeGame(room.homeLineup, room.awayLineup, room.homeUserId, room.awayUserId, ctx);
            saveState(gameId, room.state);
        }

        room.broadcast({
            type: 'game_state',
            state: room.state,
            turn: whoseTurn(room.state),
        });
    } else if (room.state) {
        // Game already in progress — send current state to reconnecting player
        ws.send(JSON.stringify({
            type: 'game_state',
            state: room.state,
            turn: whoseTurn(room.state),
        }));
        // Notify other player that opponent reconnected
        room.broadcast({ type: 'player_joined', userId });
    } else {
        ws.send(JSON.stringify({ type: 'waiting', message: 'Waiting for opponent...' }));
    }
}

// ============================================================================
// DRAFT MODE
// ============================================================================

/**
 * Draft-mode counterpart of the lineup-mode bottom of handleJoinGame.
 * Restores draft state from the DB on reconnect, or waits for both players
 * to send READY_FOR_DRAFT before initialising it.
 *
 * The play state machine is not involved here — room.state holds the draft
 * state (with state.type === 'draft') until the draft completes.
 */
async function handleDraftJoin(ws, userId, room, gameRow) {
    // Restore draft state from DB on reconnect (status='drafting' or
    // 'setting_lineup' — both have a JSONB state we can resume from).
    if (!room.state && gameRow.state) {
        if (gameRow.status === 'drafting' && gameRow.state.type === 'draft') {
            room.state = gameRow.state;
            room.draftReady = { home: true, away: true };
        } else if (gameRow.status === 'setting_lineup' && gameRow.state.type === 'setting_lineup') {
            room.state = gameRow.state;
            room.draftReady = { home: true, away: true };
        }
    }

    // Reconnect path: send the appropriate state message and notify opponent.
    if (room.state?.type === 'draft') {
        ws.send(JSON.stringify({
            type: 'draft_state',
            state: room.state,
            turn: whoseDraftTurn(room.state),
        }));
        room.broadcast({ type: 'player_joined', userId });
        return;
    }
    if (room.state?.type === 'setting_lineup') {
        ws.send(JSON.stringify({
            type: 'draft_complete',
            state: room.state,
        }));
        room.broadcast({ type: 'player_joined', userId });
        return;
    }

    // Pre-draft: waiting for both players to mark ready.
    ws.send(JSON.stringify({
        type: 'draft_waiting',
        ready: room.draftReady,
        players: room.players.size,
    }));
}

/**
 * Both players have signalled READY_FOR_DRAFT. Build the initial draft
 * state, persist, and broadcast.
 */
async function startDraftIfReady(room) {
    if (room.state) return; // already started
    if (!room.homeUserId || !room.awayUserId) return;
    if (!room.draftReady.home || !room.draftReady.away) return;

    room.state = initializeDraft();
    await saveDraftState(room.gameId, room.state);
    room.broadcast({
        type: 'draft_state',
        state: room.state,
        turn: whoseDraftTurn(room.state),
    });
}

function handleDraftAction(ws, msg, userId, room) {
    // Both players must be present to take any draft action. The user wants
    // the draft paused if either side leaves — same posture as in-game.
    if (room.players.size < 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Draft is paused — waiting for opponent' }));
        return;
    }
    const role = room.getRole(userId);
    if (!role) {
        ws.send(JSON.stringify({ type: 'error', message: 'You are not in this draft' }));
        return;
    }
    const actionType = msg.action?.type;

    if (actionType === 'READY_FOR_DRAFT') {
        if (room.state?.type === 'draft') return; // already started, ignore
        room.draftReady[role] = true;
        room.broadcast({ type: 'draft_ready_update', ready: room.draftReady });
        startDraftIfReady(room);
        return;
    }

    if (actionType === 'SUBMIT_LINEUP') {
        if (room.state?.type !== 'setting_lineup') {
            ws.send(JSON.stringify({ type: 'error', message: 'Not in setting-lineup phase' }));
            return;
        }
        const submitted = msg.action.lineup;
        const draftTeam = room.state.draft[role];
        try {
            validateSubmittedLineup(submitted, draftTeam, getAllCards());
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
            return;
        }
        // Update the player's lineup + mark submitted
        const lineupKey = `${role}Lineup`;
        const submittedKey = `${role}Submitted`;
        room.state = {
            ...room.state,
            [lineupKey]: submitted,
            [submittedKey]: true,
        };
        room.broadcast({ type: 'set_lineup_update', state: room.state });

        // Both submitted? Initialize the play state.
        if (room.state.homeSubmitted && room.state.awaySubmitted) {
            startPlayFromSubmittedLineups(room).catch(err => {
                console.error('Failed to start play from drafted lineups:', err);
            });
        } else {
            persistSettingLineup(room.gameId, room.state);
        }
        return;
    }

    if (actionType === 'DRAFT_PICK') {
        if (room.state?.type !== 'draft') {
            ws.send(JSON.stringify({ type: 'error', message: 'Draft has not started' }));
            return;
        }
        const expected = whoseDraftTurn(room.state);
        if (role !== expected) {
            ws.send(JSON.stringify({ type: 'error', message: `Not your pick — waiting for ${expected}` }));
            return;
        }
        try {
            const next = applyDraftPick(
                room.state,
                { type: 'DRAFT_PICK', actor: role, cardId: msg.action.cardId, bucket: msg.action.bucket },
                getAllCards(),
            );
            room.state = next;

            // Draft complete? Convert to lineup data + transition to setting_lineup.
            if (isDraftComplete(next)) {
                completeDraft(room);
                return;
            }

            // Otherwise broadcast updated draft state + persist.
            room.broadcast({
                type: 'draft_state',
                state: room.state,
                turn: whoseDraftTurn(room.state),
            });
            saveDraftState(room.gameId, room.state);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
        return;
    }

    ws.send(JSON.stringify({ type: 'error', message: `Unknown draft action: ${actionType}` }));
}

/**
 * Called when the 40th pick completes. Builds default Team-shaped lineup
 * objects from the drafted rosters and transitions the game to
 * status='setting_lineup'. The post-draft set-lineup screen (task #103)
 * will let each player edit their lineup before submitting.
 *
 * Until that screen ships, the room broadcasts the drafted teams so clients
 * can render the result; the SUBMIT_LINEUP action will land alongside the UI.
 */
async function completeDraft(room) {
    const cards = getAllCards();
    const homeLineup = buildLineupFromDraftedTeam(room.state.home, cards, 'Home');
    const awayLineup = buildLineupFromDraftedTeam(room.state.away, cards, 'Away');

    // Stash the default lineups on the room. They become the seed for the
    // post-draft set-lineup screen and the eventual initializeGame call.
    room.draftedHomeLineup = homeLineup;
    room.draftedAwayLineup = awayLineup;

    if (supabase) {
        try {
            await supabase.from('games').update({
                status: 'setting_lineup',
                state: {
                    type: 'setting_lineup',
                    draft: room.state,
                    homeLineup,
                    awayLineup,
                    homeSubmitted: false,
                    awaySubmitted: false,
                },
            }).eq('id', room.gameId);
        } catch (err) {
            console.error('Failed to persist setting_lineup state:', err.message);
        }
    }

    room.state = {
        type: 'setting_lineup',
        draft: room.state,
        homeLineup, awayLineup,
        homeSubmitted: false, awaySubmitted: false,
    };
    room.broadcast({
        type: 'draft_complete',
        state: room.state,
    });
}

async function saveDraftState(gameId, draftState) {
    if (!supabase) return;
    try {
        await supabase.from('games').update({
            status: 'drafting',
            state: draftState,
        }).eq('id', gameId);
    } catch (err) {
        console.error('Failed to save draft state:', err.message);
    }
}

async function persistSettingLineup(gameId, state) {
    if (!supabase) return;
    try {
        await supabase.from('games').update({
            status: 'setting_lineup',
            state,
        }).eq('id', gameId);
    } catch (err) {
        console.error('Failed to save setting_lineup state:', err.message);
    }
}

/**
 * Both players have submitted their final lineups. Convert to play state via
 * the same path lineup-mode games take, then transition the room + DB to
 * status='in_progress' and broadcast game_state.
 *
 * Series context: drafted games support series too. We follow the same
 * authoritative-context pattern lineup-mode uses — read from games + series
 * rows so the rotation formula has reliable inputs even on a server restart.
 */
async function startPlayFromSubmittedLineups(room) {
    const { homeLineup, awayLineup } = room.state;

    // Fetch series context for game 2+ (mirrors handleJoinGame's lineup path).
    let seriesContext = null;
    if (supabase) {
        try {
            const { data: gameRow } = await supabase
                .from('games')
                .select('series_id, game_number')
                .eq('id', room.gameId).single();
            if (gameRow?.series_id && (gameRow?.game_number || 1) > 1) {
                const { data: series } = await supabase
                    .from('series')
                    .select('home_user_id, starter_offset, reliever_history')
                    .eq('id', gameRow.series_id).single();
                seriesContext = {
                    gameNumber: gameRow.game_number,
                    homeStarterOffset: series?.starter_offset || 1,
                    awayStarterOffset: series?.starter_offset || 1,
                    relieverHistory: series?.reliever_history || { creator: {}, opponent: {} },
                    creatorUserId: series?.home_user_id || null,
                };
            }
        } catch (e) {
            console.warn('Series context fetch failed at draft completion:', e.message);
        }
    }

    const playState = initializeGame(
        homeLineup, awayLineup, room.homeUserId, room.awayUserId, seriesContext,
    );
    // Preserve the drafted lineups in the play state. Lineup-mode series
    // games carry the lineup forward through home/away_lineup_id (FK to the
    // lineups table); drafted teams aren't saved there, so we have to keep
    // the data in state.homeLineup / state.awayLineup for ensureNextSeriesGame
    // to pick up when creating game 2+. Engine handlers spread state on each
    // mutation so these extra fields propagate through play.
    playState.homeLineup = homeLineup;
    playState.awayLineup = awayLineup;

    room.state = playState;
    saveState(room.gameId, playState);

    // Broadcast game_state (the same shape lineup-mode sends).
    room.broadcast({
        type: 'game_state',
        state: playState,
        turn: whoseTurn(playState),
    });
}

// Valid actions per game phase
const VALID_ACTIONS = {
    'sp_roll':           ['ROLL_STARTERS'],
    'defense_setup':     ['DEFENSE_SETUP_COMMIT', 'POSITION_SWAP'],
    'pre_atbat':         ['PINCH_HIT', 'PINCH_RUN', 'DEFENSIVE_SUB', 'SKIP_SUB', 'USE_ICON', 'STEAL'],
    'defense_sub':       ['PITCHING_CHANGE', 'DEFENSIVE_SUB', 'DEFENSE_SETUP_COMMIT', 'POSITION_SWAP', 'SKIP_SUB', 'USE_ICON', 'INTENTIONAL_WALK', 'ROLL_PITCH'],
    'ibb_decision':      ['INTENTIONAL_WALK', 'SKIP_IBB', 'ROLL_PITCH', 'USE_ICON'],
    'bunt_decision':     ['SAC_BUNT', 'SKIP_BUNT'],
    'pitch':             ['ROLL_PITCH', 'USE_ICON'],
    'swing':             ['ROLL_SWING'],
    'result_icons':      ['USE_ICON', 'SKIP_ICONS'],
    'gb_decision':       ['GB_DECISION'],
    'steal_sb':                  ['STEAL_SB_DECISION'],
    'steal_trailing_decision':   ['STEAL_TRAILING_DECISION'],
    'steal_resolve':             ['STEAL_G_DECISION'],
    'extra_base_offer':  ['SEND_RUNNERS', 'HOLD_RUNNERS'],
    'extra_base':        ['EXTRA_BASE_THROW'],
};

function handleAction(ws, msg, userId, room) {
    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' }));
        return;
    }

    // Route draft / pre-draft actions through the draft handler. We allow
    // READY_FOR_DRAFT before room.state exists, so don't gate on state here.
    if (room.mode === 'draft' && (
        !room.state ||
        room.state.type === 'draft' ||
        room.state.type === 'setting_lineup'
    )) {
        handleDraftAction(ws, msg, userId, room);
        return;
    }

    if (!room.state) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' }));
        return;
    }

    if (room.state.isOver) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game is over' }));
        return;
    }

    // Block actions if opponent is disconnected
    if (room.players.size < 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Waiting for opponent to reconnect' }));
        return;
    }

    // Validate it's this player's turn
    const expectedTurn = whoseTurn(room.state);
    const playerRole = room.getRole(userId);

    if (playerRole !== expectedTurn) {
        ws.send(JSON.stringify({
            type: 'error',
            message: `Not your turn. Waiting for ${expectedTurn} team.`,
        }));
        return;
    }

    // Validate action is valid for current phase (silently ignore race conditions)
    const actionType = msg.action?.type;
    const allowed = VALID_ACTIONS[room.state.phase] || [];
    if (!allowed.includes(actionType)) {
        console.log(`Ignored invalid action '${actionType}' for phase '${room.state.phase}' (likely race condition)`);
        return;
    }

    // Process the action (server rolls the dice)
    const oldState = room.state;
    const newState = processAction(room.state, msg.action);
    room.state = newState;

    // Compute runner movements for client animation
    const runnerMovements = computeRunnerMovements(oldState, newState);

    // Broadcast new state to both players
    room.broadcast({
        type: 'game_state',
        state: newState,
        turn: whoseTurn(newState),
        runnerMovements,
    });

    // Persist on every action so a mid-at-bat reconnect doesn't restore a
    // stale state from the previous batter. saveState is fire-and-forget
    // (no await) so it doesn't block the response to clients.
    saveState(room.gameId, newState);
}

// ============================================================================
// SUPABASE PERSISTENCE
// ============================================================================

async function saveState(gameId, state) {
    if (!supabase) return;
    try {
        const update = { state, status: 'in_progress' };
        if (state.isOver) {
            update.status = 'finished';
            update.winner_user_id = state.winnerId;
        }
        await supabase.from('games').update(update).eq('id', gameId);
    } catch (err) {
        console.error('Failed to save state:', err.message);
    }
}

// ============================================================================
// START
// ============================================================================

server.listen(PORT, () => {
    console.log(`MLB Showdown Game Server running on port ${PORT}`);
    console.log(`Supabase: ${supabase ? 'connected' : 'not configured (no service key)'}`);
});
