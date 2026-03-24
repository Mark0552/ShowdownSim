import type { ParsedPosition, FieldPosition, PitcherRole } from '../types/cards';

const PITCHER_ROLES = new Set(['Starter', 'Reliever', 'Closer']);

const POSITION_EXPANSIONS: Record<string, FieldPosition[]> = {
    'OF': ['LF', 'CF', 'RF'],
    'IF': ['2B', '3B', 'SS'],
    'LF-RF': ['LF', 'RF'],
};

const VALID_FIELD_POSITIONS = new Set<string>([
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'OF', 'IF', 'LF-RF',
]);

export function parsePositions(positionStr: string): ParsedPosition[] {
    if (!positionStr || positionStr === '-') return [];

    const result: ParsedPosition[] = [];
    // Split on comma for multi-position cards like "1B+0, 3B+1"
    const parts = positionStr.split(',').map(s => s.trim());

    for (const part of parts) {
        // Check for pitcher roles first (Starter, Reliever, Closer, Closer+0)
        const roleMatch = part.match(/^(Starter|Reliever|Closer)(?:\+\d+)?$/);
        if (roleMatch) continue; // Skip pitcher roles — handled separately

        // Parse "Position+Fielding" format (e.g., "1B+1", "SS+4", "LF-RF+2", "C+9")
        const match = part.match(/^([A-Za-z0-9\-]+)\+(\d+)$/);
        if (match) {
            const posName = match[1];
            const fielding = parseInt(match[2]);
            const expanded = POSITION_EXPANSIONS[posName];
            if (expanded) {
                for (const pos of expanded) {
                    result.push({ position: pos, fielding });
                }
            } else if (VALID_FIELD_POSITIONS.has(posName)) {
                result.push({ position: posName as FieldPosition, fielding });
            }
            continue;
        }

        // Handle bare position names without fielding (e.g., "DH", "CF")
        const barePosMatch = part.match(/^([A-Za-z0-9\-]+)$/);
        if (barePosMatch) {
            const posName = barePosMatch[1];
            if (PITCHER_ROLES.has(posName)) continue;
            const expanded = POSITION_EXPANSIONS[posName];
            if (expanded) {
                for (const pos of expanded) {
                    result.push({ position: pos, fielding: 0 });
                }
            } else if (VALID_FIELD_POSITIONS.has(posName)) {
                result.push({ position: posName as FieldPosition, fielding: 0 });
            }
        }
    }

    return result;
}

export function parsePitcherRole(positionStr: string): PitcherRole {
    if (positionStr.includes('Closer')) return 'Closer';
    if (positionStr.includes('Reliever')) return 'Reliever';
    return 'Starter';
}

export function canPlayPosition(positions: ParsedPosition[], target: FieldPosition): boolean {
    if (target === 'LF-RF') {
        return positions.some(p => p.position === 'LF' || p.position === 'RF');
    }
    return positions.some(p => p.position === target);
}

export function getFieldingAt(positions: ParsedPosition[], target: FieldPosition): number {
    const match = positions.find(p => p.position === target);
    return match ? match.fielding : 0;
}
