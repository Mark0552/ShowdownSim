import type { FieldPosition } from '../types/cards';
import type { RosterSlot, Team, TeamValidation } from '../types/team';
import { MAX_ROSTER, MAX_POINTS, BACKUP_COST_DIVISOR, REQUIRED_SLOT_KEYS } from '../types/team';
import { canPlayPosition } from '../data/parsePosition';

export function getEffectivePoints(slot: RosterSlot): number {
    // Bench players are always 1/5 cost
    if (slot.assignedPosition === 'bench') return Math.ceil(slot.card.points / BACKUP_COST_DIVISOR);
    return slot.card.points;
}

export function calculateTotalPoints(slots: RosterSlot[]): number {
    return slots.reduce((sum, s) => sum + getEffectivePoints(s), 0);
}

export function validateTeam(team: Team): TeamValidation {
    const errors: string[] = [];
    const slots = team.slots;
    const totalPoints = calculateTotalPoints(slots);

    // Must have exactly 20 players
    if (slots.length !== MAX_ROSTER) {
        errors.push(`Need exactly ${MAX_ROSTER} players (have ${slots.length})`);
    }

    // Must be at or under 5000 points
    if (totalPoints > MAX_POINTS) {
        errors.push(`Over point cap: ${totalPoints} / ${MAX_POINTS}`);
    }

    // All required slots filled
    const filledSlots = new Set(slots.map(s => s.assignedPosition));
    for (const key of REQUIRED_SLOT_KEYS) {
        if (!filledSlots.has(key)) {
            const label = key.replace(/-\d$/, '').replace('Starter', 'SP');
            errors.push(`Empty slot: ${label}`);
        }
    }

    // No duplicate cards
    const cardIds = new Set<string>();
    for (const slot of slots) {
        if (cardIds.has(slot.card.id)) {
            errors.push(`Duplicate card: ${slot.card.name}`);
        }
        cardIds.add(slot.card.id);
    }

    // Validate hitters can play their assigned position
    for (const slot of slots) {
        if (slot.card.type !== 'hitter') continue;
        const pos = slot.assignedPosition;
        if (pos === 'DH' || pos === 'bench') continue;
        // Normalize: 'LF-RF-1' -> 'LF-RF'
        const filterPos = pos.replace(/-\d$/, '') as FieldPosition;
        if (!canPlayPosition(slot.card.positions, filterPos)) {
            errors.push(`${slot.card.name} cannot play ${filterPos}`);
        }
    }

    // Validate pitchers are in pitcher slots
    for (const slot of slots) {
        if (slot.card.type !== 'pitcher') continue;
        if (!slot.assignedPosition.startsWith('Starter') &&
            slot.assignedPosition !== 'Reliever' &&
            slot.assignedPosition !== 'Closer' &&
            slot.assignedPosition !== 'bench') {
            errors.push(`Pitcher ${slot.card.name} in invalid slot`);
        }
    }

    // Backup players can't be pitchers
    for (const slot of slots) {
        if (slot.isBackup && slot.card.type === 'pitcher') {
            errors.push(`Pitcher ${slot.card.name} cannot be a backup`);
        }
    }

    return { valid: errors.length === 0, errors, totalPoints, playerCount: slots.length };
}
