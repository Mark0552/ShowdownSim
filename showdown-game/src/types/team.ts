import type { Card, HitterCard, PitcherCard, FieldPosition, PitcherRole } from './cards';

export interface RosterSlot {
    card: Card;
    assignedPosition: string; // slot key: 'C', '1B', 'LF-RF-1', 'Starter-1', 'Reliever', 'Closer', 'bench'
    battingOrder: number | null;
    isBackup: boolean;
}

export interface Team {
    name: string;
    slots: RosterSlot[];
    rules: 'AL' | 'NL';
}

export interface TeamValidation {
    valid: boolean;
    errors: string[];
    totalPoints: number;
    playerCount: number;
}

export const MAX_ROSTER = 20;
export const MAX_POINTS = 5000;

// Lineup slot definitions
export interface SlotDef {
    key: string;
    label: string;
    filterPos: string; // what to filter catalog by
}

export const LINEUP_SLOT_DEFS: SlotDef[] = [
    { key: 'C',       label: 'C',     filterPos: 'C' },
    { key: '1B',      label: '1B',    filterPos: '1B' },
    { key: '2B',      label: '2B',    filterPos: '2B' },
    { key: '3B',      label: '3B',    filterPos: '3B' },
    { key: 'SS',      label: 'SS',    filterPos: 'SS' },
    { key: 'LF-RF-1', label: 'LF-RF', filterPos: 'LF-RF' },
    { key: 'LF-RF-2', label: 'LF-RF', filterPos: 'LF-RF' },
    { key: 'CF',      label: 'CF',    filterPos: 'CF' },
    { key: 'DH',      label: 'DH',    filterPos: 'DH' },
];

export const STARTER_SLOT_DEFS: SlotDef[] = [
    { key: 'Starter-1', label: 'SP1', filterPos: 'Starter' },
    { key: 'Starter-2', label: 'SP2', filterPos: 'Starter' },
    { key: 'Starter-3', label: 'SP3', filterPos: 'Starter' },
    { key: 'Starter-4', label: 'SP4', filterPos: 'Starter' },
];

// Required slots for a valid lineup
export const REQUIRED_SLOT_KEYS: string[] = [
    'C', '1B', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF', 'DH',
    'Starter-1', 'Starter-2', 'Starter-3', 'Starter-4',
];

export const BACKUP_COST_DIVISOR = 5;
