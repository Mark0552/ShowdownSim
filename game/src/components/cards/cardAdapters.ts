/**
 * Adapters that convert in-game player slots and simulation result rows
 * into the Card shape expected by CardTooltip, so every hover popup across
 * the app can share the same component.
 */

import type { Card, HitterCard, PitcherCard, FieldPosition, ParsedPosition, PitcherRole } from '../../types/cards';
import type { PlayerSlot } from '../../engine/gameEngine';
import type { HitterFinal, PitcherFinal } from '../../sim/simStats';

/** Parse a Position string like "1B+1, OF+0" into ParsedPosition[]. */
function parsePositions(posStr: string | undefined | null): ParsedPosition[] {
    if (!posStr) return [];
    const raw = posStr.trim();
    if (!raw || raw === 'DH') return raw === 'DH' ? [{ position: 'DH' as FieldPosition, fielding: 0 }] : [];
    return raw.split(',').map(p => {
        const [pos, fld] = p.trim().split('+');
        return { position: pos as FieldPosition, fielding: parseInt(fld || '0', 10) || 0 };
    });
}

function iconsStringToArray(icons: string | null | undefined): string[] {
    if (!icons) return [];
    // Icons are stored as space-separated tokens on the sim-side rows
    return String(icons).split(/\s+/).filter(Boolean);
}

/** Parse the combined sim-name `${Name} ${Yr} ${Ed} ${#} ${Team}` into
 *  its pieces. Tokens are read from the end so multi-word names work. */
function parseCombinedName(combined: string): { name: string; year: string; edition: string; cardNum: number; team: string } {
    const parts = (combined || '').split(' ');
    if (parts.length < 5) return { name: combined || '', year: '', edition: '', cardNum: 0, team: '' };
    const team = parts.pop() || '';
    const cardNum = parseInt(parts.pop() || '0', 10) || 0;
    const edition = parts.pop() || '';
    const year = parts.pop() || '';
    const name = parts.join(' ');
    return { name, year, edition, cardNum, team };
}

/** Build a Card from a PlayerSlot (live game). */
export function playerSlotToCard(p: PlayerSlot): Card {
    const common = {
        id: p.cardId,
        name: p.name,
        team: p.team ?? '',
        cardNum: parseInt(String(p.cardNumber || '0'), 10) || 0,
        edition: p.edition ?? '',
        year: p.year ?? '',
        expansion: p.expansion ?? '',
        points: p.points ?? 0,
        hand: p.hand ?? '',
        icons: p.icons || [],
        imagePath: p.imagePath,
    };
    if (p.type === 'pitcher') {
        const chart = (p.chart || {}) as any;
        const role = (p.role as PitcherRole) || 'Starter';
        return {
            ...common,
            control: p.control ?? 0,
            ip: p.ip ?? 0,
            role,
            chart: {
                PU: chart.PU ?? null, SO: chart.SO ?? null, GB: chart.GB ?? null, FB: chart.FB ?? null,
                W: chart.W ?? null, S: chart.S ?? null, DB: chart.DB ?? null, HR: chart.HR ?? null,
            },
            type: 'pitcher',
        } as PitcherCard;
    }
    // hitter
    const chart = (p.chart || {}) as any;
    // Use the player's actual native-positions array. Earlier code synthesized
    // a single entry from assignedPosition + p.fielding, which meant the
    // tooltip only ever showed the CURRENT slot at the CURRENT effective
    // fielding (penalty applied) — wrong for a "card detail" view that
    // should show the static card's own positions. PlayerSlot now carries
    // p.positions directly, so use it.
    const assigned = (p.assignedPosition || '').replace(/-\d+$/, '');
    const positions: ParsedPosition[] = (p.positions && p.positions.length > 0)
        ? p.positions as ParsedPosition[]
        : assigned === 'DH'
            ? [{ position: 'DH' as FieldPosition, fielding: 0 }]
            : [];
    return {
        ...common,
        onBase: p.onBase ?? 0,
        speed: p.speed ?? 0,
        positions,
        chart: {
            SO: chart.SO ?? null, GB: chart.GB ?? null, FB: chart.FB ?? null,
            W: chart.W ?? null, S: chart.S ?? null, SPlus: chart.SPlus ?? null,
            DB: chart.DB ?? null, TR: chart.TR ?? null, HR: chart.HR ?? null,
        },
        type: 'hitter',
    } as HitterCard;
}

/** Build a HitterCard from a HitterFinal (simulation result row). */
export function hitterFinalToCard(h: HitterFinal): HitterCard {
    const parsed = parseCombinedName(h.name);
    const chart = h.chart || {};
    return {
        id: h.name,
        name: parsed.name || h.name,
        team: h.team || parsed.team,
        cardNum: parsed.cardNum,
        edition: h.edition || parsed.edition,
        year: h.year || parsed.year,
        expansion: h.expansion || '',
        points: h.points,
        onBase: h.onBase,
        speed: h.Speed,
        positions: parsePositions(h.Position),
        hand: h.hand || '',
        icons: iconsStringToArray(h.icons),
        chart: {
            SO: chart.SO ?? null, GB: chart.GB ?? null, FB: chart.FB ?? null,
            W: chart.W ?? null, S: chart.S ?? null, SPlus: chart.SPlus ?? null,
            DB: chart.DB ?? null, TR: chart.TR ?? null, HR: chart.HR ?? null,
        },
        imagePath: h.imagePath || '',
        type: 'hitter',
    };
}

/** Build a PitcherCard from a PitcherFinal (simulation result row). */
export function pitcherFinalToCard(p: PitcherFinal): PitcherCard {
    const parsed = parseCombinedName(p.name);
    const chart = (p as any).chart || {};
    const rawRole = (p as any).Position as string | undefined;
    const role: PitcherRole = rawRole === 'Reliever' ? 'Reliever' : rawRole === 'Closer' ? 'Closer' : 'Starter';
    return {
        id: p.name,
        name: parsed.name || p.name,
        team: (p as any).team || parsed.team,
        cardNum: parsed.cardNum,
        edition: (p as any).edition || parsed.edition,
        year: (p as any).year || parsed.year,
        expansion: (p as any).expansion || '',
        points: p.points,
        control: (p as any).Control ?? 0,
        ip: (p as any).IP ?? 0,
        role,
        hand: (p as any).hand || '',
        icons: iconsStringToArray((p as any).Icons),
        chart: {
            PU: chart.PU ?? null, SO: chart.SO ?? null, GB: chart.GB ?? null, FB: chart.FB ?? null,
            W: chart.W ?? null, S: chart.S ?? null, DB: chart.DB ?? null, HR: chart.HR ?? null,
        },
        imagePath: (p as any).imagePath || '',
        type: 'pitcher',
    };
}
