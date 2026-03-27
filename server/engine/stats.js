/**
 * Batter and pitcher stat tracking helpers.
 */

export function addBatterStat(team, cardId, stat, amount = 1) {
    const newStats = { ...team.batterStats };
    if (!newStats[cardId]) newStats[cardId] = { ab: 0, h: 0, r: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hr: 0, sb: 0, cs: 0 };
    newStats[cardId] = { ...newStats[cardId], [stat]: (newStats[cardId][stat] || 0) + amount };
    return { ...team, batterStats: newStats };
}

export function addPitcherStat(team, cardId, stat, amount = 1) {
    const newStats = { ...team.pitcherStats };
    if (!newStats[cardId]) newStats[cardId] = { ip: 0, h: 0, r: 0, bb: 0, ibb: 0, so: 0, hr: 0, bf: 0 };
    newStats[cardId] = { ...newStats[cardId], [stat]: (newStats[cardId][stat] || 0) + amount };
    return { ...team, pitcherStats: newStats };
}
