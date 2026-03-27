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

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdvgjiklswargnqrqiet.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

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

    // If both players are in and we have lineups, start the game
    if (room.homeUserId && room.awayUserId && room.homeLineup && room.awayLineup && !room.state) {
        room.state = initializeGame(room.homeLineup, room.awayLineup, room.homeUserId, room.awayUserId, room.seriesContext);
        room.broadcast({
            type: 'game_state',
            state: room.state,
            turn: whoseTurn(room.state),
        });

        // Save initial state to Supabase
        saveState(gameId, room.state);
    } else if (room.state) {
        // Game already in progress — send current state to reconnecting player
        ws.send(JSON.stringify({
            type: 'game_state',
            state: room.state,
            turn: whoseTurn(room.state),
        }));
    } else {
        ws.send(JSON.stringify({ type: 'waiting', message: 'Waiting for opponent...' }));
    }
}

// Valid actions per game phase
const VALID_ACTIONS = {
    'pre_atbat':         ['PINCH_HIT', 'SKIP_SUB', 'USE_ICON', 'STEAL'],
    'defense_sub':       ['PITCHING_CHANGE', 'SKIP_SUB', 'USE_ICON'],
    'ibb_decision':      ['INTENTIONAL_WALK', 'SKIP_IBB'],
    'bunt_decision':     ['SAC_BUNT', 'SKIP_BUNT'],
    'pitch':             ['ROLL_PITCH'],
    'swing':             ['ROLL_SWING'],
    'result_icons':      ['USE_ICON', 'SKIP_ICONS'],
    'gb_decision':       ['GB_DECISION'],
    'steal_resolve':     ['STEAL_G_DECISION'],
    'extra_base_offer':  ['SEND_RUNNERS', 'HOLD_RUNNERS'],
    'extra_base':        ['EXTRA_BASE_THROW', 'SKIP_EXTRA_BASE'],
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

    // Validate action is valid for current phase
    const actionType = msg.action?.type;
    const allowed = VALID_ACTIONS[room.state.phase] || [];
    if (!allowed.includes(actionType)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: `Invalid action '${actionType}' for phase '${room.state.phase}'`,
        }));
        return;
    }

    // Process the action (server rolls the dice)
    const newState = processAction(room.state, msg.action);
    room.state = newState;

    // Broadcast new state to both players
    room.broadcast({
        type: 'game_state',
        state: newState,
        turn: whoseTurn(newState),
    });

    // Save to Supabase periodically (every new at-bat or on game over)
    if (newState.phase === 'pre_atbat' || newState.phase === 'pitch' || newState.isOver) {
        saveState(room.gameId, newState);
    }
}

// ============================================================================
// SUPABASE PERSISTENCE
// ============================================================================

async function saveState(gameId, state) {
    if (!supabase) return;
    try {
        const update = { state };
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
