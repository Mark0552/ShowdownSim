export type GameStatus = 'waiting' | 'lineup_select' | 'in_progress' | 'finished';
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
    state: any;
    pending_action: any;
    winner_user_id: string | null;
    created_at: string;
    updated_at: string;
}
