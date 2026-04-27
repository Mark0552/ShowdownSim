import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Card, HitterCard, FieldPosition } from '../types/cards';
import type { DraftState, DraftBucket } from '../types/draft';
import type { GameRow, PlayerRole } from '../types/game';
import type { Team, RosterSlot } from '../types/team';
import { getGame, getMyRole } from '../lib/games';
import { getUser } from '../lib/auth';
import { loadCards } from '../data/cardData';
import { canPlayPosition } from '../data/parsePosition';
import { checkEligibility, buildAvailablePool, effectiveCost, flexUsed } from '../logic/draftConstraints';
import { STARTER_HITTER_CAP, STARTER_PITCHER_CAP, FLEX_CAP } from '../types/draft';
import './DraftPage.css';

const WS_URL = 'wss://showdownsim-production.up.railway.app';
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;

interface Props {
    gameId: string;
    onBack: () => void;
    onPlayStart: (gameId: string) => void; // called when status flips to in_progress
}

type FilterCat = 'all' | 'hitter' | 'pitcher';

export default function DraftPage({ gameId, onBack, onPlayStart }: Props) {
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [cardsLoaded, setCardsLoaded] = useState(false);

    const [gameRow, setGameRow] = useState<GameRow | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [draftState, setDraftState] = useState<DraftState | null>(null);
    const [turn, setTurn] = useState<PlayerRole | null>(null);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('Connecting...');
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    /** Setting-lineup phase state. Non-null once the draft completes. */
    const [settingLineup, setSettingLineup] = useState<{
        homeLineup: Team;
        awayLineup: Team;
        homeSubmitted: boolean;
        awaySubmitted: boolean;
    } | null>(null);

    // UI state
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterCat>('all');
    const [pendingCard, setPendingCard] = useState<{ card: Card; buckets: DraftBucket[] } | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const mountedRef = useRef(true);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connDataRef = useRef<{ userId: string; role: PlayerRole } | null>(null);

    // Load card pool once.
    useEffect(() => {
        loadCards().then(({ all }) => {
            setAllCards(all);
            setCardsLoaded(true);
        });
    }, []);

    // ----- WebSocket -----
    const connectWs = useCallback(() => {
        if (!connDataRef.current || !mountedRef.current) return;
        const { userId, role } = connDataRef.current;

        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!mountedRef.current) return;
            reconnectAttemptRef.current = 0;
            setStatus('Joining draft...');
            ws.send(JSON.stringify({ type: 'join_game', gameId, userId, role }));
            // READY_FOR_DRAFT is sent below in onmessage when 'joined' /
            // 'draft_waiting' arrives. Sending it here would race the server's
            // mode-detection (handleJoinGame fetches games.mode async), and
            // an action arriving before room.mode='draft' is set lands in the
            // lineup-mode handler and gets rejected with "Not in a game".
        };

        ws.onmessage = (event) => {
            if (!mountedRef.current) return;
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'joined':
                    setMyRole(msg.role as PlayerRole);
                    setStatus(msg.players < 2 ? 'Waiting for opponent...' : 'Connected.');
                    // NOTE: do not send READY_FOR_DRAFT here. The server emits
                    // 'joined' before its mode-detection fetch completes, so
                    // an action sent now would be processed while
                    // room.mode is still default 'lineup' and gets rejected.
                    break;
                case 'draft_waiting':
                    setStatus('Waiting for both players to ready up...');
                    // Safe to ready up: 'draft_waiting' is only sent after the
                    // server has confirmed mode='draft' on the room.
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: 'action',
                            action: { type: 'READY_FOR_DRAFT' },
                        }));
                    }
                    break;
                case 'draft_state':
                    setDraftState(msg.state);
                    setTurn(msg.turn);
                    setOpponentDisconnected(false);
                    setStatus('');
                    break;
                case 'draft_complete':
                    setDraftState(msg.state.draft);
                    setSettingLineup({
                        homeLineup: msg.state.homeLineup,
                        awayLineup: msg.state.awayLineup,
                        homeSubmitted: msg.state.homeSubmitted,
                        awaySubmitted: msg.state.awaySubmitted,
                    });
                    setStatus('Draft complete — set your lineup.');
                    break;
                case 'set_lineup_update':
                    setSettingLineup({
                        homeLineup: msg.state.homeLineup,
                        awayLineup: msg.state.awayLineup,
                        homeSubmitted: msg.state.homeSubmitted,
                        awaySubmitted: msg.state.awaySubmitted,
                    });
                    break;
                case 'game_state':
                    // Server has flipped to active — bail to GamePage.
                    onPlayStart(gameId);
                    break;
                case 'player_left':
                    setOpponentDisconnected(true);
                    setStatus('Draft paused — opponent disconnected.');
                    break;
                case 'player_joined':
                    setOpponentDisconnected(false);
                    setStatus('');
                    break;
                case 'error':
                    setError(msg.message);
                    break;
            }
        };

        ws.onclose = () => {
            if (!mountedRef.current) return;
            const attempt = reconnectAttemptRef.current;
            if (attempt < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt), 15000);
                reconnectAttemptRef.current = attempt + 1;
                setStatus(`Reconnecting in ${Math.round(delay / 1000)}s... (${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                reconnectTimerRef.current = setTimeout(() => {
                    if (mountedRef.current) connectWs();
                }, delay);
            } else {
                setStatus('Unable to reconnect. Refresh the page.');
            }
        };

        ws.onerror = () => { /* onclose will handle */ };
    }, [gameId, onPlayStart]);

    useEffect(() => {
        mountedRef.current = true;
        async function init() {
            try {
                const user = await getUser();
                if (!user) throw new Error('Not logged in');
                const game = await getGame(gameId);
                setGameRow(game);
                const role = getMyRole(game, user.id);
                if (!role) throw new Error('Not a participant');
                setMyRole(role);
                connDataRef.current = { userId: user.id, role };
                connectWs();
            } catch (err: any) {
                if (mountedRef.current) setError(err.message);
            }
        }
        init();
        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [gameId, connectWs]);

    // ----- Eligibility computation per render -----
    const draftedSet = useMemo(() => {
        const s = new Set<string>();
        if (!draftState) return s;
        for (const team of [draftState.home, draftState.away]) {
            for (const id of team.starterHitters) s.add(id);
            for (const id of team.benchHitters) s.add(id);
            for (const id of team.starterPitchers) s.add(id);
            for (const id of team.reliefPitchers) s.add(id);
        }
        return s;
    }, [draftState]);

    const availablePool = useMemo(() => {
        if (!cardsLoaded || !draftState) return [];
        return buildAvailablePool(allCards, draftedSet);
    }, [cardsLoaded, allCards, draftState, draftedSet]);

    const myTeam = draftState && myRole ? draftState[myRole] : null;
    const oppTeam = draftState && myRole ? draftState[myRole === 'home' ? 'away' : 'home'] : null;
    const isMyTurn = turn === myRole;

    /** Eligibility map: cardId -> { eligible, buckets, reason } */
    const eligibility = useMemo(() => {
        const map = new Map<string, { eligible: boolean; buckets: DraftBucket[]; reason?: string }>();
        if (!myTeam || !draftState || !cardsLoaded) return map;
        for (const c of allCards) {
            if (draftedSet.has(c.id)) {
                map.set(c.id, { eligible: false, buckets: [], reason: 'drafted' });
                continue;
            }
            const r = checkEligibility(c, myTeam, allCards, draftedSet, availablePool);
            map.set(c.id, r);
        }
        return map;
    }, [allCards, draftedSet, availablePool, myTeam, draftState, cardsLoaded]);

    // ----- Filter pool for grid -----
    const filteredCards = useMemo(() => {
        const lower = search.trim().toLowerCase();
        return allCards
            .filter(c => filter === 'all' || c.type === filter)
            .filter(c => !lower || c.name.toLowerCase().includes(lower) || c.team.toLowerCase().includes(lower))
            .sort((a, b) => b.points - a.points);
    }, [allCards, filter, search]);

    // ----- Pick action -----
    const sendPick = (cardId: string, bucket: DraftBucket) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError('Not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'action',
            action: { type: 'DRAFT_PICK', cardId, bucket },
        }));
        setPendingCard(null);
    };

    const handleCardClick = (card: Card) => {
        if (!isMyTurn) return;
        if (opponentDisconnected) return;
        const r = eligibility.get(card.id);
        if (!r || !r.eligible) return;
        if (r.buckets.length === 1) {
            sendPick(card.id, r.buckets[0]);
        } else {
            // Hitter with both starter + bench available — ask which.
            setPendingCard({ card, buckets: r.buckets });
        }
    };

    // ----- Render -----
    if (error) {
        return (
            <div className="draft-page">
                <div className="draft-error">
                    <p>{error}</p>
                    <button onClick={onBack}>Back to Lobby</button>
                </div>
            </div>
        );
    }
    if (!cardsLoaded || !draftState || !myRole) {
        return (
            <div className="draft-page">
                <div className="draft-loading">{status || 'Loading…'}</div>
            </div>
        );
    }

    // Draft is done — render the set-lineup screen instead of the picking UI.
    if (settingLineup) {
        const myLineup = myRole === 'home' ? settingLineup.homeLineup : settingLineup.awayLineup;
        const mySubmitted = myRole === 'home' ? settingLineup.homeSubmitted : settingLineup.awaySubmitted;
        const oppSubmitted = myRole === 'home' ? settingLineup.awaySubmitted : settingLineup.homeSubmitted;
        return (
            <SetLineupScreen
                lineup={myLineup}
                allCards={allCards}
                mySubmitted={mySubmitted}
                oppSubmitted={oppSubmitted}
                onSubmit={(edited) => {
                    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                        setError('Not connected');
                        return;
                    }
                    wsRef.current.send(JSON.stringify({
                        type: 'action',
                        action: { type: 'SUBMIT_LINEUP', lineup: edited },
                    }));
                }}
                onLeave={onBack}
            />
        );
    }

    const totalPicks = draftState.pickOrder.length;
    const pickNumber = draftState.pickIndex + 1;

    return (
        <div className="draft-page">
            {/* HEADER */}
            <div className="draft-header">
                <button className="draft-back" onClick={onBack}>&larr; Leave Draft</button>
                <div className="draft-pick-indicator">
                    <span className="draft-pick-num">Pick {Math.min(pickNumber, totalPicks)} / {totalPicks}</span>
                    <span className={`draft-turn ${isMyTurn ? 'my-turn' : 'opp-turn'}`}>
                        {isMyTurn ? 'YOUR PICK' : `${turn === 'home' ? 'HOME' : 'AWAY'} IS PICKING`}
                    </span>
                </div>
                <div className="draft-points-row">
                    <PointsBadge label={myRole === 'home' ? 'You (Home)' : 'You (Away)'} team={myTeam!} highlight />
                    <PointsBadge label={myRole === 'home' ? 'Opponent (Away)' : 'Opponent (Home)'} team={oppTeam!} />
                </div>
            </div>

            {opponentDisconnected && (
                <div className="draft-paused-banner">
                    Draft paused — waiting for opponent to reconnect…
                </div>
            )}

            <div className="draft-body">
                {/* CARD POOL */}
                <div className="draft-pool">
                    <div className="draft-pool-controls">
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="draft-search"
                        />
                        <div className="draft-filter-row">
                            {(['all', 'hitter', 'pitcher'] as FilterCat[]).map(f => (
                                <button
                                    key={f}
                                    className={`draft-filter-btn ${filter === f ? 'active' : ''}`}
                                    onClick={() => setFilter(f)}
                                >{f === 'all' ? 'All' : f === 'hitter' ? 'Hitters' : 'Pitchers'}</button>
                            ))}
                        </div>
                    </div>
                    <div className="draft-grid">
                        {filteredCards.map(card => {
                            const elig = eligibility.get(card.id) || { eligible: false, buckets: [] as DraftBucket[] };
                            const greyed = !elig.eligible || !isMyTurn;
                            const tip = !isMyTurn ? `Wait for ${turn} to pick`
                                : elig.eligible ? ''
                                : (elig as any).reason === 'drafted' ? 'Already drafted'
                                : (elig as any).reason === 'matching' ? 'Would break starting-9 position coverage'
                                : (elig as any).reason === 'budget' ? "Can't afford remaining slots after this pick"
                                : 'Not eligible';
                            return (
                                <button
                                    key={card.id}
                                    className={`draft-card ${greyed ? 'greyed' : ''}`}
                                    onClick={() => handleCardClick(card)}
                                    disabled={greyed && !elig.eligible}
                                    title={tip}
                                >
                                    <img src={card.imagePath} alt={card.name} />
                                    <div className="draft-card-meta">
                                        <span className="draft-card-name">{card.name}</span>
                                        <span className="draft-card-pts">{card.points} pts</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* SIDEBAR */}
                <div className="draft-sidebar">
                    <RosterMini label="Your Roster" team={myTeam!} cards={allCards} />
                    <RosterMini label="Opponent" team={oppTeam!} cards={allCards} />
                    <PickHistory state={draftState} cards={allCards} myRole={myRole} />
                </div>
            </div>

            {/* STARTER/BENCH PROMPT MODAL */}
            {pendingCard && (
                <div className="draft-modal-overlay" onClick={() => setPendingCard(null)}>
                    <div className="draft-modal" onClick={e => e.stopPropagation()}>
                        <h3>{pendingCard.card.name}</h3>
                        <p>Where does this player go?</p>
                        <div className="draft-modal-actions">
                            {pendingCard.buckets.includes('starterHitter') && (
                                <button onClick={() => sendPick(pendingCard.card.id, 'starterHitter')}>
                                    Starting Lineup ({pendingCard.card.points} pts)
                                </button>
                            )}
                            {pendingCard.buckets.includes('benchHitter') && (
                                <button onClick={() => sendPick(pendingCard.card.id, 'benchHitter')}>
                                    Bench ({Math.ceil(pendingCard.card.points / 5)} pts)
                                </button>
                            )}
                        </div>
                        <button className="draft-modal-cancel" onClick={() => setPendingCard(null)}>Cancel</button>
                    </div>
                </div>
            )}

        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PointsBadge({ label, team, highlight }: { label: string; team: NonNullable<DraftState['home']>; highlight?: boolean }) {
    const slotsTaken = team.starterHitters.length + team.benchHitters.length + team.starterPitchers.length + team.reliefPitchers.length;
    return (
        <div className={`draft-points-badge ${highlight ? 'highlight' : ''}`}>
            <span className="draft-points-label">{label}</span>
            <span className="draft-points-value">{team.pointsRemaining.toLocaleString()} pts</span>
            <span className="draft-points-meta">{slotsTaken}/20 picks</span>
        </div>
    );
}

function RosterMini({ label, team, cards }: { label: string; team: NonNullable<DraftState['home']>; cards: Card[] }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const renderRow = (rowLabel: string, ids: string[], cap: number) => {
        const filled = ids.map(id => byId.get(id)).filter(Boolean) as Card[];
        return (
            <div className="draft-roster-row">
                <div className="draft-roster-row-label">{rowLabel} ({filled.length}/{cap})</div>
                <div className="draft-roster-cards">
                    {filled.map(c => (
                        <span key={c.id} className="draft-roster-name">{c.name}</span>
                    ))}
                    {Array.from({ length: cap - filled.length }).map((_, i) => (
                        <span key={`empty-${i}`} className="draft-roster-empty">·</span>
                    ))}
                </div>
            </div>
        );
    };
    const flexCap = FLEX_CAP;
    const flexFilled = team.benchHitters.length + team.reliefPitchers.length;
    return (
        <div className="draft-roster-mini">
            <div className="draft-roster-mini-title">{label}</div>
            {renderRow('Hitters', team.starterHitters, STARTER_HITTER_CAP)}
            {renderRow('Starting Pitchers', team.starterPitchers, STARTER_PITCHER_CAP)}
            <div className="draft-roster-row">
                <div className="draft-roster-row-label">Flex ({flexFilled}/{flexCap})</div>
                <div className="draft-roster-cards">
                    {team.reliefPitchers.map(id => {
                        const c = cards.find(x => x.id === id);
                        return c ? <span key={id} className="draft-roster-name">{c.name} <em>(P)</em></span> : null;
                    })}
                    {team.benchHitters.map(id => {
                        const c = cards.find(x => x.id === id);
                        return c ? <span key={id} className="draft-roster-name">{c.name} <em>(B)</em></span> : null;
                    })}
                    {Array.from({ length: flexCap - flexFilled }).map((_, i) => (
                        <span key={`empty-${i}`} className="draft-roster-empty">·</span>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// SetLineupScreen — post-draft, pre-game.
//
// Lets the player tweak the default position assignments and orderings the
// server sent. Constraints enforced inline:
//   - Each starting position used by exactly one hitter
//   - Each batting order 1-9 used by exactly one starting hitter
//   - Each Starter-1..4 slot used by exactly one SP
//   - Bench picks stay bench (the user only edits orderings, not bench/starter
//     distinction — that was finalised during the draft)
// Submit is disabled until the lineup validates.
// ---------------------------------------------------------------------------

const HITTER_SLOTS_LABELS: { key: string; label: string }[] = [
    { key: 'C', label: 'C' },
    { key: '1B', label: '1B' },
    { key: '2B', label: '2B' },
    { key: '3B', label: '3B' },
    { key: 'SS', label: 'SS' },
    { key: 'LF-RF-1', label: 'LF/RF' },
    { key: 'LF-RF-2', label: 'LF/RF' },
    { key: 'CF', label: 'CF' },
    { key: 'DH', label: 'DH' },
];
const SP_SLOT_KEYS = ['Starter-1', 'Starter-2', 'Starter-3', 'Starter-4'];

function eligibleSlotsForHitter(card: HitterCard): string[] {
    const out: string[] = [];
    for (const { key } of HITTER_SLOTS_LABELS) {
        if (key === '1B' || key === 'DH') { out.push(key); continue; }
        if (key === 'LF-RF-1' || key === 'LF-RF-2') {
            if (canPlayPosition(card.positions, 'LF-RF')) out.push(key);
            continue;
        }
        if (canPlayPosition(card.positions, key as FieldPosition)) out.push(key);
    }
    return out;
}

interface SetLineupProps {
    lineup: Team;
    allCards: Card[];
    mySubmitted: boolean;
    oppSubmitted: boolean;
    onSubmit: (lineup: Team) => void;
    onLeave: () => void;
}

function SetLineupScreen({ lineup, allCards, mySubmitted, oppSubmitted, onSubmit, onLeave }: SetLineupProps) {
    // Hydrate cards in slots from the canonical pool — server may have sent
    // partial card objects, but the eligibility helpers want full cards.
    const byId = new Map(allCards.map(c => [c.id, c]));
    const hydratedSlots = useMemo<RosterSlot[]>(() => lineup.slots.map(s => {
        const full = byId.get(s.card.id) || s.card;
        return { ...s, card: full };
    }), [lineup, allCards]);

    const [slots, setSlots] = useState<RosterSlot[]>(hydratedSlots);

    // Reset when server re-sends (e.g. after my own submission echoed back)
    useEffect(() => { setSlots(hydratedSlots); }, [hydratedSlots]);

    const updateSlot = (cardId: string, updates: Partial<RosterSlot>) => {
        setSlots(prev => prev.map(s => s.card.id === cardId ? { ...s, ...updates } : s));
    };

    /**
     * Swap the position assignment between two starting hitters. Caller
     * guarantees both slots are in the starting set.
     */
    const swapHitterPositions = (cardIdA: string, cardIdB: string) => {
        setSlots(prev => {
            const a = prev.find(s => s.card.id === cardIdA);
            const b = prev.find(s => s.card.id === cardIdB);
            if (!a || !b) return prev;
            return prev.map(s => {
                if (s.card.id === cardIdA) return { ...s, assignedPosition: b.assignedPosition };
                if (s.card.id === cardIdB) return { ...s, assignedPosition: a.assignedPosition };
                return s;
            });
        });
    };

    // Group slots
    const startingHitters = slots.filter(s =>
        s.card.type === 'hitter' && s.assignedPosition !== 'bench'
    );
    const benchHitters = slots.filter(s => s.assignedPosition === 'bench');
    const sps = slots.filter(s =>
        s.card.type === 'pitcher' && (s.assignedPosition || '').startsWith('Starter')
    );
    const reliefs = slots.filter(s =>
        s.card.type === 'pitcher' && (s.assignedPosition === 'Reliever' || s.assignedPosition === 'Closer')
    );

    // Validation
    const errors: string[] = [];
    {
        const posSeen = new Set<string>();
        for (const s of startingHitters) {
            if (posSeen.has(s.assignedPosition)) errors.push(`Position ${s.assignedPosition} used twice`);
            posSeen.add(s.assignedPosition);
            // Eligibility
            if (s.card.type === 'hitter') {
                const ok = s.assignedPosition === '1B' || s.assignedPosition === 'DH'
                    || eligibleSlotsForHitter(s.card as HitterCard).includes(s.assignedPosition);
                if (!ok) errors.push(`${s.card.name} cannot play ${s.assignedPosition}`);
            }
        }
        const orderSeen = new Set<number>();
        for (const s of startingHitters) {
            if (s.battingOrder == null) errors.push(`${s.card.name} has no batting order`);
            else if (orderSeen.has(s.battingOrder)) errors.push(`Batting order ${s.battingOrder} used twice`);
            else orderSeen.add(s.battingOrder);
        }
        const spSeen = new Set<string>();
        for (const s of sps) {
            if (spSeen.has(s.assignedPosition)) errors.push(`${s.assignedPosition} used twice`);
            spSeen.add(s.assignedPosition);
        }
    }
    const valid = errors.length === 0;

    const submit = () => {
        if (!valid) return;
        onSubmit({ ...lineup, slots });
    };

    if (mySubmitted) {
        return (
            <div className="draft-page">
                <div className="draft-header">
                    <button className="draft-back" onClick={onLeave}>&larr; Leave</button>
                    <div className="draft-pick-indicator">
                        <span className="draft-turn my-turn">LINEUP SUBMITTED</span>
                    </div>
                    <div />
                </div>
                <div className="setlineup-waiting">
                    <div className="waiting-spinner" />
                    <p>{oppSubmitted ? 'Starting game…' : 'Waiting for opponent to submit lineup…'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="draft-page">
            <div className="draft-header">
                <button className="draft-back" onClick={onLeave}>&larr; Leave</button>
                <div className="draft-pick-indicator">
                    <span className="draft-pick-num">Set Your Lineup</span>
                    <span className="draft-turn my-turn">{oppSubmitted ? 'Opponent ready ✓' : 'Both editing…'}</span>
                </div>
                <div />
            </div>

            <div className="setlineup-body">
                {/* STARTING HITTERS */}
                <section className="setlineup-section">
                    <h3>Starting Lineup</h3>
                    <table className="setlineup-table">
                        <thead>
                            <tr>
                                <th>Card</th>
                                <th>Player</th>
                                <th>Position</th>
                                <th>Batting Order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {startingHitters.map(s => {
                                const eligible = s.card.type === 'hitter'
                                    ? eligibleSlotsForHitter(s.card as HitterCard)
                                    : [];
                                return (
                                    <tr key={s.card.id}>
                                        <td><img src={s.card.imagePath} alt="" className="setlineup-thumb" /></td>
                                        <td>{s.card.name}</td>
                                        <td>
                                            <select
                                                value={s.assignedPosition}
                                                onChange={e => {
                                                    const newPos = e.target.value;
                                                    // If the new pos is already used by someone else, swap.
                                                    const occupant = startingHitters.find(
                                                        x => x.card.id !== s.card.id && x.assignedPosition === newPos
                                                    );
                                                    if (occupant) swapHitterPositions(s.card.id, occupant.card.id);
                                                    else updateSlot(s.card.id, { assignedPosition: newPos });
                                                }}
                                            >
                                                {HITTER_SLOTS_LABELS.map(({ key, label }) => (
                                                    <option key={key} value={key} disabled={!eligible.includes(key)}>
                                                        {label}{eligible.includes(key) ? '' : ' (×)'}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={s.battingOrder ?? ''}
                                                onChange={e => {
                                                    const newOrder = parseInt(e.target.value, 10);
                                                    const occupant = startingHitters.find(
                                                        x => x.card.id !== s.card.id && x.battingOrder === newOrder
                                                    );
                                                    setSlots(prev => prev.map(slot => {
                                                        if (slot.card.id === s.card.id) return { ...slot, battingOrder: newOrder };
                                                        if (occupant && slot.card.id === occupant.card.id) return { ...slot, battingOrder: s.battingOrder };
                                                        return slot;
                                                    }));
                                                }}
                                            >
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                                    <option key={n} value={n}>{n}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                {/* STARTING PITCHERS */}
                <section className="setlineup-section">
                    <h3>Rotation</h3>
                    <table className="setlineup-table">
                        <thead>
                            <tr>
                                <th>Card</th>
                                <th>Player</th>
                                <th>Slot</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sps.map(s => (
                                <tr key={s.card.id}>
                                    <td><img src={s.card.imagePath} alt="" className="setlineup-thumb" /></td>
                                    <td>{s.card.name}</td>
                                    <td>
                                        <select
                                            value={s.assignedPosition}
                                            onChange={e => {
                                                const newSlot = e.target.value;
                                                const occupant = sps.find(
                                                    x => x.card.id !== s.card.id && x.assignedPosition === newSlot
                                                );
                                                setSlots(prev => prev.map(slot => {
                                                    if (slot.card.id === s.card.id) return { ...slot, assignedPosition: newSlot };
                                                    if (occupant && slot.card.id === occupant.card.id) return { ...slot, assignedPosition: s.assignedPosition };
                                                    return slot;
                                                }));
                                            }}
                                        >
                                            {SP_SLOT_KEYS.map(k => (
                                                <option key={k} value={k}>{k.replace('Starter-', 'SP')}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* BULLPEN + BENCH (read-only) */}
                <section className="setlineup-section">
                    <h3>Bullpen</h3>
                    <div className="setlineup-readonly-list">
                        {reliefs.map(s => (
                            <div key={s.card.id} className="setlineup-readonly-row">
                                <img src={s.card.imagePath} alt="" className="setlineup-thumb" />
                                <span>{s.card.name}</span>
                                <span className="setlineup-readonly-tag">{s.assignedPosition}</span>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="setlineup-section">
                    <h3>Bench</h3>
                    <div className="setlineup-readonly-list">
                        {benchHitters.map(s => (
                            <div key={s.card.id} className="setlineup-readonly-row">
                                <img src={s.card.imagePath} alt="" className="setlineup-thumb" />
                                <span>{s.card.name}</span>
                                <span className="setlineup-readonly-tag">bench</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {errors.length > 0 && (
                <div className="setlineup-errors">
                    {errors.map((err, i) => <div key={i}>{err}</div>)}
                </div>
            )}

            <div className="setlineup-submit-row">
                <button
                    className="setlineup-submit-btn"
                    disabled={!valid}
                    onClick={submit}
                >SUBMIT LINEUP</button>
            </div>
        </div>
    );
}

function PickHistory({ state, cards, myRole }: { state: DraftState; cards: Card[]; myRole: PlayerRole }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    return (
        <div className="draft-history">
            <div className="draft-history-title">Picks</div>
            <div className="draft-history-list">
                {state.picks.slice().reverse().map(p => {
                    const card = byId.get(p.cardId);
                    if (!card) return null;
                    const mine = p.actor === myRole;
                    return (
                        <div key={p.pickNumber} className={`draft-history-item ${mine ? 'mine' : ''}`}>
                            <span className="draft-history-num">{p.pickNumber}.</span>
                            <span className="draft-history-actor">{p.actor === 'home' ? 'H' : 'A'}</span>
                            <span className="draft-history-name">{card.name}</span>
                            <span className="draft-history-bucket">
                                {p.bucket === 'starterHitter' ? 'starter' :
                                 p.bucket === 'benchHitter' ? 'bench' :
                                 p.bucket === 'starterPitcher' ? 'SP' : 'RP/CL'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
