/**
 * Fielding position helpers.
 */

export function getFieldingFromSlot(positions, assignedPos) {
    if (!positions || !assignedPos || assignedPos === 'bench' || assignedPos === 'DH') return 0;
    const normalized = assignedPos.replace(/-\d+$/, '');
    if (normalized === 'LF-RF') {
        const match = positions.find(p => p.position === 'LF' || p.position === 'RF');
        return match ? match.fielding : 0;
    }
    const match = positions.find(p => p.position === normalized);
    return match ? match.fielding : 0;
}

export const INFIELD_POSITIONS = ['1B', '2B', '3B', 'SS']; // C has 0 fielding for IF total
export const OUTFIELD_POSITIONS = ['LF', 'CF', 'RF', 'LF-RF'];

export function computeFieldingTotals(lineup) {
    let inf = 0, outf = 0, catcherArm = 0;
    for (const p of lineup) {
        const pos = (p.assignedPosition || '').replace(/-\d+$/, '');
        if (pos === 'C') {
            catcherArm = p.arm || 0; // catcher's value is Arm, not fielding
        } else if (INFIELD_POSITIONS.includes(pos)) {
            inf += (p.fielding || 0);
        } else if (OUTFIELD_POSITIONS.includes(pos)) {
            outf += (p.fielding || 0);
        }
    }
    return { totalInfieldFielding: inf, totalOutfieldFielding: outf, catcherArm };
}
