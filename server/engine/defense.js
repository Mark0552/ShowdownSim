/**
 * Defense validator — bipartite matching to decide "validPossible":
 * given 9 hitters (lineup + DH), can 7 of them fill the 7 native-required
 * fielding slots (C, 2B, 3B, SS, LF-RF-1, LF-RF-2, CF) natively? If yes,
 * the remaining 2 go to 1B (any card legal with penalty) and DH (no
 * fielding). If no, the defense is forced into OOP somewhere and Accept
 * allows penalties.
 *
 * 9×7 matching — simple augmenting-path DFS is plenty fast.
 */

const NATIVE_SLOTS = ['C', '2B', '3B', 'SS', 'LF-RF-1', 'LF-RF-2', 'CF'];

function normalizeSlot(slotKey) {
    return (slotKey || '').replace(/-\d+$/, '');
}

/** Does this card's own positions list cover the given fielding slot natively? */
export function cardCanPlaySlotNatively(card, slotKey) {
    const norm = normalizeSlot(slotKey);
    const positions = card?.positions || [];
    if (norm === 'LF-RF') {
        return positions.some(p => p.position === 'LF' || p.position === 'RF' || p.position === 'LF-RF');
    }
    return positions.some(p => p.position === norm);
}

/**
 * Hopcroft-Karp-style augmenting-path matching. For each of the 7 native
 * slots, try to match it to one of the `cards`. Returns true iff all 7
 * slots can be matched (a perfect matching on the slot side).
 *
 * @param {Array} cards  Array of PlayerSlot-like objects (need .positions)
 */
export function validPossible(cards) {
    if (!Array.isArray(cards) || cards.length < NATIVE_SLOTS.length) return false;

    const matchSlotCard = new Array(NATIVE_SLOTS.length).fill(-1);

    function tryAugment(slotIdx, visited) {
        for (let c = 0; c < cards.length; c++) {
            if (visited[c]) continue;
            if (!cardCanPlaySlotNatively(cards[c], NATIVE_SLOTS[slotIdx])) continue;
            visited[c] = true;
            // Is this card already matched to another slot? If so, try to rematch.
            const currentSlot = matchSlotCard.indexOf(c);
            if (currentSlot === -1 || tryAugment(currentSlot, visited)) {
                matchSlotCard[slotIdx] = c;
                return true;
            }
        }
        return false;
    }

    for (let s = 0; s < NATIVE_SLOTS.length; s++) {
        const visited = new Array(cards.length).fill(false);
        if (!tryAugment(s, visited)) return false;
    }
    return true;
}
