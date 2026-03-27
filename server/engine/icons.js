/**
 * Icon usage tracking helpers.
 */

export const ICON_MAX_USES = { K: 1, G: 1, HR: 1, SB: 1, '20': 1, CY: 1, RP: 1, S: 1, V: 2 };

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
