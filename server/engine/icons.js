/**
 * Icon usage tracking helpers.
 */

export const ICON_MAX_USES = { K: 1, G: 1, HR: 1, SB: 1, '20': Infinity, CY: Infinity, RP: 1, S: 1, V: 2 };

export function canUseIcon(team, cardId, icon) {
    const usage = team.iconUsage?.[cardId]?.[icon] || 0;
    return usage < (ICON_MAX_USES[icon] || 1);
}

export function recordIconUse(team, cardId, icon) {
    const newUsage = { ...team.iconUsage };
    if (!newUsage[cardId]) newUsage[cardId] = {};
    newUsage[cardId] = { ...newUsage[cardId] };
    newUsage[cardId][icon] = (newUsage[cardId][icon] || 0) + 1;
    return { ...team, iconUsage: newUsage };
}

export function playerHasIcon(player, iconName) {
    return player.icons && player.icons.includes(iconName);
}

// Find any player on team with unused G icon
export function findGPlayer(team) {
    return team.lineup.find(p => playerHasIcon(p, 'G') && canUseIcon(team, p.cardId, 'G'));
}

// Find ALL players on team with unused G icon (for player choice)
// Phase 6: out-of-position players cannot use the G icon (gIconEligible check).
export function findAllGPlayers(team, positionFilter) {
    return team.lineup
        .filter(p => {
            if (!playerHasIcon(p, 'G') || !canUseIcon(team, p.cardId, 'G')) return false;
            if (positionFilter) {
                const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
                if (!positionFilter.includes(pos)) return false;
            }
            // G only available when the player is on-card at their assigned position.
            const slot = p.assignedPosition || '';
            const onCard = (p.positions || []).some(cp => {
                if (slot === 'LF-RF') return cp.position === 'LF' || cp.position === 'RF' || cp.position === 'LF-RF';
                return cp.position === slot.replace(/-\d+$/, '');
            });
            return onCard;
        })
        .map(p => ({ cardId: p.cardId, name: p.name, position: (p.assignedPosition || '').replace(/-\d+$/, '') }));
}
