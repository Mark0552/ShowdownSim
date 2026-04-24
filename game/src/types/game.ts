export type GameStatus = 'waiting' | 'lineup_select' | 'in_progress' | 'finished';
export type SeriesStatus = 'waiting' | 'in_progress' | 'finished';
export type PlayerRole = 'home' | 'away';

export interface GameRow {
    id: string;
    status: GameStatus;
    home_user_id: string;
    away_user_id: string | null;
    home_user_email: string | null;
    away_user_email: string | null;
    home_lineup_id: string | null;
    away_lineup_id: string | null;
    home_lineup_name: string | null;
    away_lineup_name: string | null;
    home_ready: boolean;
    away_ready: boolean;
    home_ready_next: boolean;
    away_ready_next: boolean;
    state: any;
    pending_action: any;
    password: string | null;
    winner_user_id: string | null;
    series_id: string | null;
    game_number: number;
    created_at: string;
    updated_at: string;
}

export interface SeriesRow {
    id: string;
    home_user_id: string;
    away_user_id: string | null;
    home_user_email: string | null;
    away_user_email: string | null;
    best_of: number;
    home_wins: number;
    away_wins: number;
    home_lineup_id: string | null;
    away_lineup_id: string | null;
    home_lineup_name: string | null;
    away_lineup_name: string | null;
    status: SeriesStatus;
    winner_user_id: string | null;
    starter_offset: number;
    reliever_history: any;
    created_at: string;
}
