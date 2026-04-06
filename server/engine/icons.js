/**
 * Icon usage tracking helpers.
 */

export const ICON_MAX_USES = { K: 1, G: 1, HR: 1, SB: 1, '20': 1, CY: Infinity, RP: 1, S: 1, V: 2 };

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
export function findAllGPlayers(team, positionFilter) {
    return team.lineup
        .filter(p => {
            if (!playerHasIcon(p, 'G') || !canUseIcon(team, p.cardId, 'G')) return false;
            if (positionFilter) {
                const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
                return positionFilter.includes(pos);
            }
            return true;
        })
        .map(p => ({ cardId: p.cardId, name: p.name, position: (p.assignedPosition || '').replace(/-\d+$/, '') }));
}
