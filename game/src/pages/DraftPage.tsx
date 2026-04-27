import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Card, HitterCard, FieldPosition } from '../types/cards';
import type { DraftState, DraftBucket } from '../types/draft';
import type { GameRow, PlayerRole } from '../types/game';
import type { Team, RosterSlot } from '../types/team';
import { getGame, getMyRole } from '../lib/games';
import { getUser } from '../lib/auth';
import { loadCards } from '../data/cardData';
import { canPlayPosition } from '../data/parsePosition';
import { checkEligibility, buildAvailablePool } from '../logic/draftConstraints';
import { STARTER_HITTER_CAP, STARTER_PITCHER_CAP, FLEX_CAP } from '../types/draft';
import { DEFAULT_FILTERS, getFilterOptions, filterCards, type FilterState } from '../data/filters';
import FilterBar from '../components/catalog/FilterBar';
import CardTooltip from '../components/cards/CardTooltip';
import './DraftPage.css';

const WS_URL = 'wss://showdownsim-production.up.railway.app';
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const HOVER_DELAY_MS = 400;

interface Props {
    gameId: string;
    onBack: () => void;
    onPlayStart: (gameId: string) => void; // called when status flips to in_progress
}

export default function DraftPage({ gameId, onBack, onPlayStart }: Props) {
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [cardsLoaded, setCardsLoaded] = useState(false);

    const [, setGameRow] = useState<GameRow | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [draftState, setDraftState] = useState<DraftState | null>(null);
    const [turn, setTurn] = useState<PlayerRole | null>(null);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('Connecting...');
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    const [settingLineup, setSettingLineup] = useState<{
        homeLineup: Team;
        awayLineup: Team;
        homeSubmitted: boolean;
        awaySubmitted: boolean;
    } | null>(null);

    const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
    const [pendingCard, setPendingCard] = useState<{ card: Card; buckets: DraftBucket[] } | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const mountedRef = useRef(true);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connDataRef = useRef<{ userId: string; role: PlayerRole } | null>(null);

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
            // READY_FOR_DRAFT is sent on 'draft_waiting' below — sending it now
            // races the server's mode-detection.
        };

        ws.onmessage = (event) => {
            if (!mountedRef.current) return;
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'joined':
                    setMyRole(msg.role as PlayerRole);
                    setStatus(msg.players < 2 ? 'Waiting for opponent...' : 'Connected.');
                    break;
                case 'draft_waiting':
                    setStatus('Waiting for both players to ready up...');
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

        ws.onerror = () => { /* onclose handles */ };
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

    // ----- Eligibility -----
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

    /** Map of cardId -> eligibility result for the picker (myTeam). */
    const eligibility = useMemo(() => {
        const map = new Map<string, { eligible: boolean; buckets: DraftBucket[]; reason?: string }>();
        if (!myTeam || !draftState || !cardsLoaded) return map;
        for (const c of allCards) {
            if (draftedSet.has(c.id)) {
                map.set(c.id, { eligible: false, buckets: [], reason: 'drafted' });
                continue;
            }
            map.set(c.id, checkEligibility(c, myTeam, allCards, draftedSet, availablePool));
        }
        return map;
    }, [allCards, draftedSet, availablePool, myTeam, draftState, cardsLoaded]);

    /** Visible pool: filter via FilterBar, then drop ineligible cards entirely. */
    const filterOptions = useMemo(() => getFilterOptions(allCards), [allCards]);
    const visibleCards = useMemo(() => {
        if (!cardsLoaded) return [];
        const filtered = filterCards(allCards, filters);
        return filtered.filter(c => eligibility.get(c.id)?.eligible);
    }, [allCards, filters, eligibility, cardsLoaded]);

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
        if (!isMyTurn || opponentDisconnected) return;
        const r = eligibility.get(card.id);
        if (!r || !r.eligible) return;
        // ALWAYS confirm — even single-bucket picks. Modal gives the user a
        // chance to back out before the action commits.
        setPendingCard({ card, buckets: r.buckets });
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
                <div className="draft-pool">
                    <FilterBar
                        filters={filters}
                        options={filterOptions}
                        onChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
                        onClear={() => setFilters({ ...DEFAULT_FILTERS })}
                        resultCount={visibleCards.length}
                        totalCount={allCards.length - draftedSet.size}
                    />
                    <div className="draft-grid">
                        {visibleCards.map(card => (
                            <DraftPoolCard
                                key={card.id}
                                card={card}
                                onClick={() => handleCardClick(card)}
                                disabled={!isMyTurn || opponentDisconnected}
                            />
                        ))}
                        {visibleCards.length === 0 && (
                            <div className="draft-grid-empty">
                                No eligible cards match your filters. Adjust filters or wait — eligible cards may open up after the next pick.
                            </div>
                        )}
                    </div>
                </div>

                <div className="draft-sidebar">
                    <RosterMini label="Your Roster" team={myTeam!} cards={allCards} />
                    <RosterMini label="Opponent" team={oppTeam!} cards={allCards} />
                    <PickHistory state={draftState} cards={allCards} myRole={myRole} />
                </div>
            </div>

            {pendingCard && (
                <ConfirmPickModal
                    card={pendingCard.card}
                    buckets={pendingCard.buckets}
                    onConfirm={(bucket) => sendPick(pendingCard.card.id, bucket)}
                    onCancel={() => setPendingCard(null)}
                />
            )}
        </div>
    );
}

// ===========================================================================
// Sub-components
// ===========================================================================

/** Card with a 400ms hover tooltip and click handler. Used in the draft grid. */
function DraftPoolCard({ card, onClick, disabled }: { card: Card; onClick: () => void; disabled: boolean }) {
    const [hover, setHover] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEnter = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHover(true), HOVER_DELAY_MS);
    };
    const onLeave = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setHover(false);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return (
        <>
            <button
                className={`draft-card ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && onClick()}
                disabled={disabled}
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
            >
                <img src={card.imagePath} alt={card.name} />
                <div className="draft-card-meta">
                    <span className="draft-card-name">{card.name}</span>
                    <span className="draft-card-pts">{card.points} pts</span>
                </div>
            </button>
            {hover && <CardTooltip card={card} />}
        </>
    );
}

/** Inline name span with hover tooltip — used in roster panels and pick history. */
function HoverName({ card, suffix, mine }: { card: Card; suffix?: string; mine?: boolean }) {
    const [hover, setHover] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEnter = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHover(true), HOVER_DELAY_MS);
    };
    const onLeave = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setHover(false);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return (
        <>
            <span
                className={`draft-roster-name ${mine ? 'mine' : ''}`}
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
            >
                {card.name}{suffix ? <em> {suffix}</em> : null}
            </span>
            {hover && <CardTooltip card={card} />}
        </>
    );
}

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
    const renderRow = (rowLabel: string, ids: string[], cap: number, suffix?: (c: Card) => string) => {
        const filled = ids.map(id => byId.get(id)).filter(Boolean) as Card[];
        return (
            <div className="draft-roster-row">
                <div className="draft-roster-row-label">{rowLabel} ({filled.length}/{cap})</div>
                <div className="draft-roster-cards">
                    {filled.map(c => (
                        <HoverName key={c.id} card={c} suffix={suffix?.(c)} />
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
                        const c = byId.get(id);
                        return c ? <HoverName key={id} card={c} suffix="(P)" /> : null;
                    })}
                    {team.benchHitters.map(id => {
                        const c = byId.get(id);
                        return c ? <HoverName key={id} card={c} suffix="(B)" /> : null;
                    })}
                    {Array.from({ length: flexCap - flexFilled }).map((_, i) => (
                        <span key={`empty-${i}`} className="draft-roster-empty">·</span>
                    ))}
                </div>
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
                            <HoverName card={card} mine={mine} />
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

function ConfirmPickModal({ card, buckets, onConfirm, onCancel }: {
    card: Card; buckets: DraftBucket[]; onConfirm: (b: DraftBucket) => void; onCancel: () => void;
}) {
    const labelFor = (b: DraftBucket) => {
        switch (b) {
            case 'starterHitter':  return `Starting Lineup — ${card.points} pts`;
            case 'benchHitter':    return `Bench — ${Math.ceil(card.points / 5)} pts`;
            case 'starterPitcher': return `Starting Rotation — ${card.points} pts`;
            case 'reliefPitcher':  return `Bullpen — ${card.points} pts`;
        }
    };
    const askingChoice = buckets.length > 1; // hitter that could go either starter or bench
    return (
        <div className="draft-modal-overlay" onClick={onCancel}>
            <div className="draft-modal" onClick={e => e.stopPropagation()}>
                <img src={card.imagePath} alt={card.name} className="draft-modal-img" />
                <h3>{card.name}</h3>
                <p>{askingChoice ? 'Where does this player go?' : 'Confirm this pick?'}</p>
                <div className="draft-modal-actions">
                    {buckets.map(b => (
                        <button key={b} onClick={() => onConfirm(b)}>{labelFor(b)}</button>
                    ))}
                </div>
                <button className="draft-modal-cancel" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

// ===========================================================================
// SetLineupScreen — drag-and-drop, three rows
//
// Row 1: position assignment (drop a hitter onto a position slot — swaps if
// occupied). Row 2: batting order (drag to reorder 1-9). Row 3: SP rotation
// (drag to reorder Starter-1..4). Bullpen + bench stay read-only — the
// starter/bench distinction was finalised during the draft.
// ===========================================================================

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
    // Hydrate slot.card from canonical pool (server may send partial card objects).
    const byId = useMemo(() => new Map(allCards.map(c => [c.id, c])), [allCards]);
    const hydratedSlots = useMemo<RosterSlot[]>(() => lineup.slots.map(s => {
        const full = byId.get(s.card.id) || s.card;
        return { ...s, card: full };
    }), [lineup, byId]);

    const [slots, setSlots] = useState<RosterSlot[]>(hydratedSlots);
    useEffect(() => { setSlots(hydratedSlots); }, [hydratedSlots]);

    // Group slots
    const startingHitters = slots.filter(s => s.card.type === 'hitter' && s.assignedPosition !== 'bench');
    const benchHitters = slots.filter(s => s.assignedPosition === 'bench');
    const sps = slots.filter(s => s.card.type === 'pitcher' && (s.assignedPosition || '').startsWith('Starter'));
    const reliefs = slots.filter(s =>
        s.card.type === 'pitcher' && (s.assignedPosition === 'Reliever' || s.assignedPosition === 'Closer')
    );

    /** Position view: which hitter is assigned to each of the 9 hitter slots. */
    const hittersBySlot = new Map<string, RosterSlot>();
    for (const s of startingHitters) hittersBySlot.set(s.assignedPosition, s);

    /** Batting order view: array of length 9 sorted by battingOrder. */
    const battingOrdered = [...startingHitters].sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));

    /** Rotation view: array of length 4 sorted by Starter-N. */
    const rotationOrdered = [...sps].sort((a, b) => {
        const an = parseInt((a.assignedPosition.match(/\d+/) || ['9'])[0], 10);
        const bn = parseInt((b.assignedPosition.match(/\d+/) || ['9'])[0], 10);
        return an - bn;
    });

    // ----- Drag-drop helpers -----
    const dragRef = useRef<{ kind: 'pos' | 'bat' | 'rot'; cardId: string } | null>(null);
    const [dragging, setDragging] = useState(false); // suppresses tooltip during drag

    const swapPositions = (cardA: string, cardB: string) => {
        setSlots(prev => {
            const a = prev.find(s => s.card.id === cardA);
            const b = prev.find(s => s.card.id === cardB);
            if (!a || !b) return prev;
            return prev.map(s => {
                if (s.card.id === cardA) return { ...s, assignedPosition: b.assignedPosition };
                if (s.card.id === cardB) return { ...s, assignedPosition: a.assignedPosition };
                return s;
            });
        });
    };

    const reorderBatting = (fromCard: string, toCard: string) => {
        setSlots(prev => {
            const from = prev.find(s => s.card.id === fromCard);
            const to = prev.find(s => s.card.id === toCard);
            if (!from || !to || from.battingOrder == null || to.battingOrder == null) return prev;
            // Swap their battingOrder values.
            return prev.map(s => {
                if (s.card.id === fromCard) return { ...s, battingOrder: to.battingOrder };
                if (s.card.id === toCard)   return { ...s, battingOrder: from.battingOrder };
                return s;
            });
        });
    };

    const reorderRotation = (fromCard: string, toCard: string) => {
        setSlots(prev => {
            const from = prev.find(s => s.card.id === fromCard);
            const to = prev.find(s => s.card.id === toCard);
            if (!from || !to) return prev;
            return prev.map(s => {
                if (s.card.id === fromCard) return { ...s, assignedPosition: to.assignedPosition };
                if (s.card.id === toCard)   return { ...s, assignedPosition: from.assignedPosition };
                return s;
            });
        });
    };

    // ----- Validation -----
    const errors: string[] = [];
    {
        const posSeen = new Set<string>();
        for (const s of startingHitters) {
            if (posSeen.has(s.assignedPosition)) errors.push(`Position ${s.assignedPosition} used twice`);
            posSeen.add(s.assignedPosition);
            if (s.card.type === 'hitter') {
                const pos = s.assignedPosition;
                const ok = pos === '1B' || pos === 'DH'
                    || eligibleSlotsForHitter(s.card as HitterCard).includes(pos);
                if (!ok) errors.push(`${s.card.name} cannot play ${pos.replace(/-\d$/, '')}`);
            }
        }
        const orderSeen = new Set<number>();
        for (const s of startingHitters) {
            if (s.battingOrder == null) errors.push(`${s.card.name} has no batting order`);
            else if (orderSeen.has(s.battingOrder)) errors.push(`Batting order ${s.battingOrder} used twice`);
            else orderSeen.add(s.battingOrder);
        }
    }
    const valid = errors.length === 0;

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
                <DragRow
                    title="Position Assignment"
                    subtitle="Drag a hitter onto a position to swap. Each hitter must end up at an eligible position."
                >
                    {HITTER_SLOTS_LABELS.map(({ key, label }) => {
                        const occupant = hittersBySlot.get(key);
                        return (
                            <DragSlot
                                key={key}
                                label={label}
                                slot={occupant || null}
                                eligible={!occupant ? true
                                    : occupant.card.type === 'hitter'
                                        ? (key === '1B' || key === 'DH'
                                            || eligibleSlotsForHitter(occupant.card as HitterCard).includes(key))
                                        : true}
                                onDragStart={(cardId) => { dragRef.current = { kind: 'pos', cardId }; setDragging(true); }}
                                onDragEnd={() => { dragRef.current = null; setDragging(false); }}
                                onDrop={(droppedCardId) => {
                                    if (!occupant) return; // nothing to swap with — keep simple model
                                    if (occupant.card.id === droppedCardId) return;
                                    swapPositions(occupant.card.id, droppedCardId);
                                }}
                                draggingNow={dragging}
                            />
                        );
                    })}
                </DragRow>

                <DragRow
                    title="Batting Order"
                    subtitle="Drag a hitter onto a slot to swap their batting order."
                >
                    {battingOrdered.map(s => (
                        <DragSlot
                            key={s.card.id}
                            label={`#${s.battingOrder}`}
                            slot={s}
                            eligible={true}
                            onDragStart={(cardId) => { dragRef.current = { kind: 'bat', cardId }; setDragging(true); }}
                            onDragEnd={() => { dragRef.current = null; setDragging(false); }}
                            onDrop={(droppedCardId) => {
                                if (s.card.id === droppedCardId) return;
                                reorderBatting(droppedCardId, s.card.id);
                            }}
                            draggingNow={dragging}
                        />
                    ))}
                </DragRow>

                <DragRow
                    title="Starting Rotation"
                    subtitle="Drag a starter onto a slot to swap their rotation order."
                >
                    {rotationOrdered.map(s => (
                        <DragSlot
                            key={s.card.id}
                            label={s.assignedPosition.replace('Starter-', 'SP')}
                            slot={s}
                            eligible={true}
                            onDragStart={(cardId) => { dragRef.current = { kind: 'rot', cardId }; setDragging(true); }}
                            onDragEnd={() => { dragRef.current = null; setDragging(false); }}
                            onDrop={(droppedCardId) => {
                                if (s.card.id === droppedCardId) return;
                                reorderRotation(droppedCardId, s.card.id);
                            }}
                            draggingNow={dragging}
                        />
                    ))}
                </DragRow>

                <section className="setlineup-section">
                    <h3>Bullpen</h3>
                    <div className="setlineup-readonly-list">
                        {reliefs.map(s => (
                            <ReadonlyCardRow key={s.card.id} slot={s} />
                        ))}
                    </div>
                </section>

                <section className="setlineup-section">
                    <h3>Bench</h3>
                    <div className="setlineup-readonly-list">
                        {benchHitters.map(s => (
                            <ReadonlyCardRow key={s.card.id} slot={s} tag="bench" />
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
                    onClick={() => valid && onSubmit({ ...lineup, slots })}
                >SUBMIT LINEUP</button>
            </div>
        </div>
    );
}

function DragRow({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="setlineup-section">
            <h3>{title}</h3>
            {subtitle && <p className="setlineup-subtitle">{subtitle}</p>}
            <div className="setlineup-drag-row">{children}</div>
        </section>
    );
}

interface DragSlotProps {
    label: string;
    slot: RosterSlot | null;
    eligible: boolean;
    onDragStart: (cardId: string) => void;
    onDragEnd: () => void;
    onDrop: (droppedCardId: string) => void;
    draggingNow: boolean;
}

function DragSlot({ label, slot, eligible, onDragStart, onDragEnd, onDrop, draggingNow }: DragSlotProps) {
    const [hover, setHover] = useState(false);
    const [over, setOver] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onMouseEnter = () => {
        if (draggingNow || !slot) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHover(true), HOVER_DELAY_MS);
    };
    const onMouseLeave = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setHover(false);
    };
    useEffect(() => { if (draggingNow) setHover(false); }, [draggingNow]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    return (
        <div
            className={`setlineup-slot ${over ? 'over' : ''} ${!eligible ? 'invalid' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const cardId = e.dataTransfer.getData('text/plain');
                if (cardId) onDrop(cardId);
            }}
        >
            <div className="setlineup-slot-label">{label}</div>
            {slot ? (
                <div
                    className="setlineup-slot-card"
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', slot.card.id);
                        e.dataTransfer.effectAllowed = 'move';
                        onDragStart(slot.card.id);
                    }}
                    onDragEnd={onDragEnd}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <img src={slot.card.imagePath} alt="" />
                    <div className="setlineup-slot-name">{slot.card.name}</div>
                </div>
            ) : (
                <div className="setlineup-slot-empty">empty</div>
            )}
            {hover && slot && <CardTooltip card={slot.card} />}
        </div>
    );
}

function ReadonlyCardRow({ slot, tag }: { slot: RosterSlot; tag?: string }) {
    const [hover, setHover] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEnter = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHover(true), HOVER_DELAY_MS);
    };
    const onLeave = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setHover(false);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return (
        <div
            className="setlineup-readonly-row"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            <img src={slot.card.imagePath} alt="" className="setlineup-thumb" />
            <span>{slot.card.name}</span>
            <span className="setlineup-readonly-tag">{tag || slot.assignedPosition}</span>
            {hover && <CardTooltip card={slot.card} />}
        </div>
    );
}
