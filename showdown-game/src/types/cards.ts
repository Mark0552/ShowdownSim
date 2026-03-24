export interface RawHitter {
    '#': number;
    Ed: string;
    Name: string;
    Team: string;
    Points: number;
    'Yr.': string;
    onBase: number;
    Speed: number;
    Position: string;
    H: string;
    Icons: string | null;
    SO: string | null;
    GB: string | null;
    FB: string | null;
    W: string | null;
    S: string | null;
    SPlus: string | null;
    DB: string | null;
    TR: string | null;
    HR: string | null;
    expansion: string;
    imagePath: string;
}

export interface RawPitcher {
    '#': number;
    Ed: string;
    Name: string;
    Team: string;
    Points: number;
    'Yr.': string;
    Control: number;
    IP: number;
    Position: string;
    H: string;
    Icons: string | null;
    PU: string | null;
    SO: string | null;
    GB: string | null;
    FB: string | null;
    W: string | null;
    S: string | null;
    DB: string | null;
    HR: string | null;
    expansion: string;
    imagePath: string;
}

export type FieldPosition = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'LF-RF' | 'DH';
export type PitcherRole = 'Starter' | 'Reliever' | 'Closer';

export interface ParsedPosition {
    position: FieldPosition;
    fielding: number;
}

export interface HitterCard {
    id: string;
    name: string;
    team: string;
    cardNum: number;
    edition: string;
    year: string;
    expansion: string;
    points: number;
    onBase: number;
    speed: number;
    positions: ParsedPosition[];
    hand: string;
    icons: string[];
    chart: {
        SO: string | null;
        GB: string | null;
        FB: string | null;
        W: string | null;
        S: string | null;
        SPlus: string | null;
        DB: string | null;
        TR: string | null;
        HR: string | null;
    };
    imagePath: string;
    type: 'hitter';
}

export interface PitcherCard {
    id: string;
    name: string;
    team: string;
    cardNum: number;
    edition: string;
    year: string;
    expansion: string;
    points: number;
    control: number;
    ip: number;
    role: PitcherRole;
    hand: string;
    icons: string[];
    chart: {
        PU: string | null;
        SO: string | null;
        GB: string | null;
        FB: string | null;
        W: string | null;
        S: string | null;
        DB: string | null;
        HR: string | null;
    };
    imagePath: string;
    type: 'pitcher';
}

export type Card = HitterCard | PitcherCard;
