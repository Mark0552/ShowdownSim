import { useReducer, useCallback, useMemo } from 'react';
import type { Card } from '../types/cards';
import type { RosterSlot, Team, TeamValidation } from '../types/team';
import { validateTeam, calculateTotalPoints } from '../logic/teamRules';

type TeamAction =
    | { type: 'ADD_TO_SLOT'; card: Card; slotKey: string }
    | { type: 'REMOVE_CARD'; cardId: string }
    | { type: 'TOGGLE_BACKUP'; cardId: string }
    | { type: 'SET_LINEUP_ORDER'; orderedCardIds: string[] }
    | { type: 'SET_STARTER_ORDER'; orderedCardIds: string[] }
    | { type: 'SET_RULES'; rules: 'AL' | 'NL' }
    | { type: 'CLEAR' }
    | { type: 'LOAD'; team: Team };

// Slots where only one card can be assigned (replace on re-add)
const UNIQUE_SLOTS = new Set([
    'C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH',
    'Starter-1', 'Starter-2', 'Starter-3', 'Starter-4',
]);

function teamReducer(state: Team, action: TeamAction): Team {
    switch (action.type) {
        case 'ADD_TO_SLOT': {
            if (state.slots.some(s => s.card.id === action.card.id)) return state;
            const slot: RosterSlot = {
                card: action.card,
                assignedPosition: action.slotKey,
                battingOrder: null,
                isBackup: action.slotKey === 'bench',
            };
            // For unique slots, replace any existing card there
            if (UNIQUE_SLOTS.has(action.slotKey)) {
                const filtered = state.slots.filter(s => s.assignedPosition !== action.slotKey);
                return { ...state, slots: [...filtered, slot] };
            }
            return { ...state, slots: [...state.slots, slot] };
        }
        case 'REMOVE_CARD': {
            return { ...state, slots: state.slots.filter(s => s.card.id !== action.cardId) };
        }
        case 'TOGGLE_BACKUP':
            return {
                ...state,
                slots: state.slots.map(s =>
                    s.card.id === action.cardId ? { ...s, isBackup: !s.isBackup } : s
                ),
            };
        case 'SET_LINEUP_ORDER': {
            const orderMap = new Map(action.orderedCardIds.map((id, i) => [id, i + 1]));
            return {
                ...state,
                slots: state.slots.map(s => ({
                    ...s,
                    battingOrder: orderMap.has(s.card.id) ? orderMap.get(s.card.id)! : s.battingOrder,
                })),
            };
        }
        case 'SET_STARTER_ORDER': {
            // Re-assign starter slot keys based on new order
            const newSlots = state.slots.map(s => {
                const idx = action.orderedCardIds.indexOf(s.card.id);
                if (idx >= 0) {
                    return { ...s, assignedPosition: `Starter-${idx + 1}` };
                }
                return s;
            });
            return { ...state, slots: newSlots };
        }
        case 'SET_RULES':
            return { ...state, rules: action.rules };
        case 'CLEAR':
            return { name: '', slots: [], rules: 'AL' };
        case 'LOAD':
            return action.team;
        default:
            return state;
    }
}

const initialTeam: Team = { name: '', slots: [], rules: 'AL' };

export function useTeamStore() {
    const [team, dispatch] = useReducer(teamReducer, initialTeam);

    const validation = useMemo(() => validateTeam(team), [team]);
    const totalPoints = useMemo(() => calculateTotalPoints(team.slots), [team.slots]);
    const remainingPoints = useMemo(() => 5000 - totalPoints, [totalPoints]);
    const rosterCardIds = useMemo(() => new Set(team.slots.map(s => s.card.id)), [team.slots]);

    const addToSlot = useCallback((card: Card, slotKey: string) =>
        dispatch({ type: 'ADD_TO_SLOT', card, slotKey }), []);
    const removeCard = useCallback((cardId: string) =>
        dispatch({ type: 'REMOVE_CARD', cardId }), []);
    const toggleBackup = useCallback((cardId: string) =>
        dispatch({ type: 'TOGGLE_BACKUP', cardId }), []);
    const setLineupOrder = useCallback((orderedCardIds: string[]) =>
        dispatch({ type: 'SET_LINEUP_ORDER', orderedCardIds }), []);
    const setStarterOrder = useCallback((orderedCardIds: string[]) =>
        dispatch({ type: 'SET_STARTER_ORDER', orderedCardIds }), []);
    const setRules = useCallback((rules: 'AL' | 'NL') =>
        dispatch({ type: 'SET_RULES', rules }), []);
    const clearTeam = useCallback(() => dispatch({ type: 'CLEAR' }), []);

    // Slot lookup: key -> slot
    const slotMap = useMemo(() => {
        const m = new Map<string, RosterSlot>();
        for (const s of team.slots) m.set(s.assignedPosition, s);
        return m;
    }, [team.slots]);

    const starterSlots = useMemo(() =>
        [1, 2, 3, 4].map(i => slotMap.get(`Starter-${i}`)).filter(Boolean) as RosterSlot[], [slotMap]);

    const bullpenSlots = useMemo(() =>
        team.slots.filter(s => s.assignedPosition === 'Reliever' || s.assignedPosition === 'Closer'), [team.slots]);

    const benchSlots = useMemo(() =>
        team.slots.filter(s => s.assignedPosition === 'bench'), [team.slots]);

    const lineupSlots = useMemo(() =>
        team.slots.filter(s => s.battingOrder !== null).sort((a, b) => a.battingOrder! - b.battingOrder!), [team.slots]);

    return {
        team, validation, totalPoints, remainingPoints, rosterCardIds, slotMap,
        starterSlots, bullpenSlots, benchSlots, lineupSlots,
        addToSlot, removeCard, toggleBackup, setLineupOrder, setStarterOrder,
        setRules, clearTeam, dispatch,
    };
}

export type TeamStore = ReturnType<typeof useTeamStore>;
