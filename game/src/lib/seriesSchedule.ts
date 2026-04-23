/**
 * MLB postseason home-field schedule.
 *
 * The series creator is the higher seed and gets the home-field advantage
 * pattern for their bestOf format:
 *   3-game series (Wild Card):    all 3 games at creator (3-0-0).
 *   5-game series (Division):     creator hosts 1, 2, 5 (2-2-1).
 *   7-game series (LCS / WS):     creator hosts 1, 2, 6, 7 (2-3-2).
 *
 * Returns true if the creator (higher seed) hosts the given game.
 */
export function isCreatorHomeInGame(bestOf: number, gameNumber: number): boolean {
    if (bestOf === 3) return true;
    if (bestOf === 5) return [1, 2, 5].includes(gameNumber);
    if (bestOf === 7) return [1, 2, 6, 7].includes(gameNumber);
    // Any non-standard bestOf: default to creator-hosts-game-1 only.
    return gameNumber === 1;
}

/** Short label for a game's home-field ownership, for UI badges. */
export function homeFieldLabel(bestOf: number, gameNumber: number): 'creator' | 'opponent' {
    return isCreatorHomeInGame(bestOf, gameNumber) ? 'creator' : 'opponent';
}
