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

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdvgjiklswargnqrqiet.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

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
        this.state = null;
        this.homeUserId = null;
        this.awayUserId = null;
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
                    if (data.state && data.status !== 'finished'
                        && data.state.awayTeam?.lineup && data.state.homeTeam?.lineup) {
                        loadedState = data.state;
                    }
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
                authoritativeSeriesContext = {
                    gameNumber: dbGameNumber,
                    homeStarterOffset: offset,
                    awayStarterOffset: offset,
                    relieverHistory: series?.reliever_history || { creator: {}, opponent: {} },
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

// Valid actions per game phase
const VALID_ACTIONS = {
    'sp_roll':           ['ROLL_STARTERS'],
    'defense_setup':     ['DEFENSE_SETUP_COMMIT', 'POSITION_SWAP'],
    'pre_atbat':         ['PINCH_HIT', 'PINCH_RUN', 'DEFENSIVE_SUB', 'SKIP_SUB', 'USE_ICON', 'STEAL'],
    'defense_sub':       ['PITCHING_CHANGE', 'DEFENSIVE_SUB', 'POSITION_SWAP', 'SKIP_SUB', 'USE_ICON', 'INTENTIONAL_WALK', 'ROLL_PITCH'],
    'ibb_decision':      ['INTENTIONAL_WALK', 'SKIP_IBB', 'ROLL_PITCH', 'USE_ICON'],
    'bunt_decision':     ['SAC_BUNT', 'SKIP_BUNT'],
    'pitch':             ['ROLL_PITCH', 'USE_ICON'],
    'swing':             ['ROLL_SWING'],
    'result_icons':      ['USE_ICON', 'SKIP_ICONS'],
    'gb_decision':       ['GB_DECISION'],
    'steal_sb':          ['STEAL_SB_DECISION'],
    'steal_resolve':     ['STEAL_G_DECISION'],
    'extra_base_offer':  ['SEND_RUNNERS', 'HOLD_RUNNERS'],
    'extra_base':        ['EXTRA_BASE_THROW'],
};

function handleAction(ws, msg, userId, room) {
    if (!room || !room.state) {
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
