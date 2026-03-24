import type { RawHitter, RawPitcher, HitterCard, PitcherCard, Card } from '../types/cards';
import { parsePositions, parsePitcherRole } from './parsePosition';

let allHitters: HitterCard[] = [];
let allPitchers: PitcherCard[] = [];
let allCards: Card[] = [];
let loaded = false;

function normalizeImagePath(p: string): string {
    return '/' + p.replace(/\\/g, '/');
}

function makeId(name: string, ed: string, yr: string, num: number, team: string): string {
    return `${name}|${yr}|${ed}|${num}|${team}`;
}

function transformHitter(raw: RawHitter): HitterCard {
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
        imagePath: normalizeImagePath(raw.imagePath),
        type: 'hitter',
    };
}

function transformPitcher(raw: RawPitcher): PitcherCard {
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
        imagePath: normalizeImagePath(raw.imagePath),
        type: 'pitcher',
    };
}

export async function loadCards(): Promise<{ hitters: HitterCard[]; pitchers: PitcherCard[]; all: Card[] }> {
    if (loaded) return { hitters: allHitters, pitchers: allPitchers, all: allCards };

    const [hittersRes, pitchersRes] = await Promise.all([
        fetch('/hitters.json'),
        fetch('/pitchers.json'),
    ]);

    const rawHitters: RawHitter[] = await hittersRes.json();
    const rawPitchers: RawPitcher[] = await pitchersRes.json();

    allHitters = rawHitters.map(transformHitter);
    allPitchers = rawPitchers.map(transformPitcher);
    allCards = [...allHitters, ...allPitchers];
    loaded = true;

    return { hitters: allHitters, pitchers: allPitchers, all: allCards };
}

export function getCards() {
    return { hitters: allHitters, pitchers: allPitchers, all: allCards };
}
