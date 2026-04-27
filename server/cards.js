/**
 * Loads + parses the full card pool on server startup. Mirrors
 * game/src/data/cardData.ts and game/src/data/parsePosition.ts.
 *
 * The server reads from game/public/*.json (the client-served bundle).
 * Card data is deterministic between client and server; both compute the
 * same id from (name, edition, year, cardNum, team).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const POSITION_EXPANSIONS = {
    'OF': ['LF', 'CF', 'RF'],
    'IF': ['2B', '3B', 'SS'],
    'LF-RF': ['LF', 'RF'],
};
const VALID_FIELD_POSITIONS = new Set([
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'OF', 'IF', 'LF-RF',
]);
const PITCHER_ROLES = new Set(['Starter', 'Reliever', 'Closer']);

function parsePositions(positionStr) {
    if (!positionStr || positionStr === '-') return [];
    const result = [];
    const parts = positionStr.split(',').map(s => s.trim());
    for (const part of parts) {
        if (/^(Starter|Reliever|Closer)(?:\+\d+)?$/.test(part)) continue;

        const m = part.match(/^([A-Za-z0-9-]+)\+(\d+)$/);
        if (m) {
            const posName = m[1];
            const fielding = parseInt(m[2], 10);
            const expanded = POSITION_EXPANSIONS[posName];
            if (expanded) {
                for (const pos of expanded) result.push({ position: pos, fielding });
            } else if (VALID_FIELD_POSITIONS.has(posName)) {
                result.push({ position: posName, fielding });
            }
            continue;
        }

        const m2 = part.match(/^([A-Za-z0-9-]+)$/);
        if (m2) {
            const posName = m2[1];
            if (PITCHER_ROLES.has(posName)) continue;
            const expanded = POSITION_EXPANSIONS[posName];
            if (expanded) {
                for (const pos of expanded) result.push({ position: pos, fielding: 0 });
            } else if (VALID_FIELD_POSITIONS.has(posName)) {
                result.push({ position: posName, fielding: 0 });
            }
        }
    }
    return result;
}

function parsePitcherRole(positionStr) {
    if (positionStr.includes('Closer')) return 'Closer';
    if (positionStr.includes('Reliever')) return 'Reliever';
    return 'Starter';
}

function makeId(name, ed, yr, num, team) {
    return `${name}|${yr}|${ed}|${num}|${team}`;
}

function transformHitter(raw) {
    return {
        id: makeId(raw.Name, raw.Ed, raw['Yr.'], raw['#'], raw.Team),
        name: raw.Name,
        team: raw.Team,
        cardNum: raw['#'],
        edition: raw.Ed,
        year: raw['Yr.'],
        expansion: raw.expansion,
        points: raw.Points,
        onBase: raw.onBase,
        speed: raw.Speed,
        positions: parsePositions(raw.Position),
        hand: raw.H,
        icons: raw.Icons ? raw.Icons.split(' ').filter(Boolean) : [],
        chart: {
            SO: raw.SO, GB: raw.GB, FB: raw.FB, W: raw.W,
            S: raw.S, SPlus: raw.SPlus, DB: raw.DB, TR: raw.TR, HR: raw.HR,
        },
        imagePath: raw.imagePath,
        type: 'hitter',
    };
}

function transformPitcher(raw) {
    return {
        id: makeId(raw.Name, raw.Ed, raw['Yr.'], raw['#'], raw.Team),
        name: raw.Name,
        team: raw.Team,
        cardNum: raw['#'],
        edition: raw.Ed,
        year: raw['Yr.'],
        expansion: raw.expansion,
        points: raw.Points,
        control: raw.Control,
        ip: raw.IP,
        role: parsePitcherRole(raw.Position),
        hand: raw.H,
        icons: raw.Icons ? raw.Icons.split(' ').filter(Boolean) : [],
        chart: {
            PU: raw.PU, SO: raw.SO, GB: raw.GB, FB: raw.FB,
            W: raw.W, S: raw.S, DB: raw.DB, HR: raw.HR,
        },
        imagePath: raw.imagePath,
        type: 'pitcher',
    };
}

let _allCards = null;

/** Load + parse the full card pool. Cached after first call. */
export function getAllCards() {
    if (_allCards) return _allCards;

    // Try a few candidate paths so this works in dev (relative to server/)
    // and in deployment (cards copied next to the server bundle).
    const candidates = [
        join(__dirname, '..', 'game', 'public'),
        join(__dirname, 'data'),
        join(__dirname),
    ];
    let dir = null;
    for (const c of candidates) {
        try {
            readFileSync(join(c, 'hitters.json'), 'utf8');
            dir = c;
            break;
        } catch { /* try next */ }
    }
    if (!dir) {
        throw new Error('Could not locate hitters.json / pitchers.json. Tried: ' + candidates.join(', '));
    }

    const rawHitters = JSON.parse(readFileSync(join(dir, 'hitters.json'), 'utf8'));
    const rawPitchers = JSON.parse(readFileSync(join(dir, 'pitchers.json'), 'utf8'));

    _allCards = [
        ...rawHitters.map(transformHitter),
        ...rawPitchers.map(transformPitcher),
    ];
    return _allCards;
}
