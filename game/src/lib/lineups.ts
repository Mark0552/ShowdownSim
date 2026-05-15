import { supabase } from './supabase';
import { getUser } from './auth';

export interface SavedLineup {
    id: string;
    name: string;
    data: any; // Team object
    created_at: string;
    updated_at: string;
}

export async function getLineups(): Promise<SavedLineup[]> {
    const { data, error } = await supabase
        .from('lineups')
        .select('*')
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

/** Translate a Supabase/Postgres error into a user-facing message. The
 *  lineups table has a unique index on (user_id, LOWER(name)) — duplicate
 *  names come back as Postgres error code 23505 (unique_violation). For
 *  anything else, fall through to the original error message. */
function describeLineupError(error: any, name: string): Error {
    if (error?.code === '23505') {
        return new Error(`You already have a lineup named "${name}". Pick a different name.`);
    }
    return new Error(error?.message || 'Lineup save failed');
}

export async function createLineup(name: string, teamData: any): Promise<SavedLineup> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('lineups')
        .insert({ user_id: user.id, name, data: teamData })
        .select()
        .single();
    if (error) throw describeLineupError(error, name);
    return data;
}

export async function updateLineup(id: string, name: string, teamData: any): Promise<SavedLineup> {
    const { data, error } = await supabase
        .from('lineups')
        .update({ name, data: teamData })
        .eq('id', id)
        .select()
        .single();
    if (error) throw describeLineupError(error, name);
    return data;
}

export async function deleteLineup(id: string): Promise<void> {
    const { error } = await supabase
        .from('lineups')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

/**
 * Duplicate an existing lineup. The new lineup gets the same `data` but a
 * fresh name that doesn't collide with the user's existing lineups —
 * "{source} (copy)", "{source} (copy 2)", "{source} (copy 3)", ...
 *
 * Name uniqueness is enforced at the DB level via the lineups_user_name_unique
 * index; we pre-check here mostly to pick a sensible default name. There's
 * still a theoretical race (two tabs copying the same lineup simultaneously)
 * — the DB will reject the second insert and the caller gets a friendly
 * "already exists" error via describeLineupError.
 */
export async function copyLineup(source: SavedLineup): Promise<SavedLineup> {
    const user = await getUser();
    if (!user) throw new Error('Not logged in');

    // Fetch the user's existing lineup names (lowercased) so we can pick
    // a unique suffix without round-tripping through DB errors.
    const { data: existing, error: fetchError } = await supabase
        .from('lineups')
        .select('name')
        .eq('user_id', user.id);
    if (fetchError) throw new Error(fetchError.message);

    const existingLower = new Set((existing || []).map(r => (r.name || '').toLowerCase()));

    // Try "{source} (copy)" first. If taken, walk "{source} (copy 2)",
    // "(copy 3)", etc. until we land on a free slot. The unique index is
    // case-insensitive so we compare lowercased names here too.
    let candidate = `${source.name} (copy)`;
    if (existingLower.has(candidate.toLowerCase())) {
        let n = 2;
        while (existingLower.has(`${source.name} (copy ${n})`.toLowerCase())) n++;
        candidate = `${source.name} (copy ${n})`;
    }

    const { data, error } = await supabase
        .from('lineups')
        .insert({ user_id: user.id, name: candidate, data: source.data })
        .select()
        .single();
    if (error) throw describeLineupError(error, candidate);
    return data;
}
