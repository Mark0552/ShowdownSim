import type { Card, HitterCard, PitcherCard, FieldPosition } from '../types/cards';
import { canPlayPosition } from './parsePosition';

export interface FilterState {
    search: string;
    type: 'all' | 'hitter' | 'pitcher';
    year: string;
    expansion: string;
    edition: string;
    team: string;
    position: string;
    pointsMin: number;
    pointsMax: number;
    sortBy: string;
    sortDir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: FilterState = {
    search: '',
    type: 'all',
    year: '',
    expansion: '',
    edition: '',
    team: '',
    position: '',
    pointsMin: 0,
    pointsMax: 1000,
    sortBy: 'points',
    sortDir: 'desc',
};

export function getFilterOptions(cards: Card[]) {
    const years = new Set<string>();
    const expansions = new Set<string>();
    const editions = new Set<string>();
    const teams = new Set<string>();

    for (const c of cards) {
        years.add(c.year);
        expansions.add(c.expansion);
        editions.add(c.edition);
        teams.add(c.team);
    }

    return {
        years: [...years].sort(),
        expansions: [...expansions].sort(),
        editions: [...editions].sort(),
        teams: [...teams].sort(),
    };
}

export function filterCards(cards: Card[], filters: FilterState): Card[] {
    let result = cards;

    if (filters.type !== 'all') {
        result = result.filter(c => c.type === filters.type);
    }

    if (filters.search) {
        const s = filters.search.toLowerCase();
        result = result.filter(c => c.name.toLowerCase().includes(s) || c.team.toLowerCase().includes(s));
    }

    if (filters.year) {
        result = result.filter(c => c.year === filters.year);
    }

    if (filters.expansion) {
        result = result.filter(c => c.expansion === filters.expansion);
    }

    if (filters.edition) {
        result = result.filter(c => c.edition === filters.edition);
    }

    if (filters.team) {
        result = result.filter(c => c.team === filters.team);
    }

    if (filters.position) {
        const pos = filters.position;
        result = result.filter(c => {
            if (pos === 'AllHitters') return c.type === 'hitter';
            if (pos === 'AllPitchers') return c.type === 'pitcher';
            if (pos === 'Bullpen') return c.type === 'pitcher' && (c.role === 'Reliever' || c.role === 'Closer');
            if (pos === 'Starter') return c.type === 'pitcher' && c.role === 'Starter';
            if (pos === 'DH') return c.type === 'hitter';
            if (c.type === 'pitcher') return false;
            if (pos === 'LF-RF') {
                return canPlayPosition(c.positions, 'LF') || canPlayPosition(c.positions, 'RF') || canPlayPosition(c.positions, 'LF-RF' as FieldPosition);
            }
            return canPlayPosition(c.positions, pos as FieldPosition);
        });
    }

    if (filters.pointsMin > 0) {
        result = result.filter(c => c.points >= filters.pointsMin);
    }

    if (filters.pointsMax < 1000) {
        result = result.filter(c => c.points <= filters.pointsMax);
    }

    return sortCards(result, filters.sortBy, filters.sortDir);
}

function sortCards(cards: Card[], sortBy: string, dir: 'asc' | 'desc'): Card[] {
    const mult = dir === 'asc' ? 1 : -1;
    return [...cards].sort((a, b) => {
        let av: number | string = 0;
        let bv: number | string = 0;

        switch (sortBy) {
            case 'name': av = a.name; bv = b.name; break;
            case 'team': av = a.team; bv = b.team; break;
            case 'points': av = a.points; bv = b.points; break;
            case 'onBase':
                av = a.type === 'hitter' ? a.onBase : (a as PitcherCard).control;
                bv = b.type === 'hitter' ? b.onBase : (b as PitcherCard).control;
                break;
            case 'speed':
                av = a.type === 'hitter' ? a.speed : 0;
                bv = b.type === 'hitter' ? b.speed : 0;
                break;
            default: av = a.points; bv = b.points;
        }

        if (typeof av === 'string' && typeof bv === 'string') {
            return mult * av.localeCompare(bv);
        }
        return mult * ((av as number) - (bv as number));
    });
}
