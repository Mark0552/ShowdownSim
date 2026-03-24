import { supabase } from './supabase';

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

export async function createLineup(name: string, teamData: any): Promise<SavedLineup> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    const { data, error } = await supabase
        .from('lineups')
        .insert({ user_id: user.id, name, data: teamData })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateLineup(id: string, name: string, teamData: any): Promise<SavedLineup> {
    const { data, error } = await supabase
        .from('lineups')
        .update({ name, data: teamData })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteLineup(id: string): Promise<void> {
    const { error } = await supabase
        .from('lineups')
        .delete()
        .eq('id', id);
    if (error) throw error;
}
