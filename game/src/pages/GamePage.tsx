import { useState, useEffect, useRef } from 'react';
import type { GameState } from '../types/gameState';
import type { GameAction } from '../types/gameActions';
import type { PlayerRole } from '../types/game';
import { getGame, getMyRole, subscribeToGame } from '../lib/games';
import { startGameSession, submitAction, endGameSession, type GameSession } from '../lib/gameSync';
import { supabase } from '../lib/supabase';
import Scoreboard from '../components/game/Scoreboard';
import Diamond from '../components/game/Diamond';
import AtBatPanel from '../components/game/AtBatPanel';
import ActionBar from '../components/game/ActionBar';
import GameLog from '../components/game/GameLog';
import './GamePage.css';

interface Props {
    gameId: string;
    onBack: () => void;
}

export default function GamePage({ gameId, onBack }: Props) {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myRole, setMyRole] = useState<PlayerRole | null>(null);
    const [homeEmail, setHomeEmail] = useState('');
    const [awayEmail, setAwayEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const sessionRef = useRef<GameSession | null>(null);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not logged in');

                const game = await getGame(gameId);
                const role = getMyRole(game, user.id);
                if (!role) throw new Error('Not a participant in this game');

                setMyRole(role);
                setHomeEmail(game.home_user_email || '');
                setAwayEmail(game.away_user_email || '');

                const session = await startGameSession(gameId, role, (state) => {
                    if (mounted) setGameState(state);
                });

                sessionRef.current = session;
                setLoading(false);
            } catch (err: any) {
                if (mounted) setError(err.message);
                setLoading(false);
            }
        };

        init();

        return () => {
            mounted = false;
            if (sessionRef.current) {
                endGameSession(sessionRef.current);
            }
        };
    }, [gameId]);

    const handleAction = async (action: GameAction) => {
        if (!sessionRef.current) return;
        try {
            await submitAction(sessionRef.current, action);
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) {
        return (
            <div className="game-page loading">
                <div>Loading game...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="game-page loading">
                <div className="game-error">{error}</div>
                <button onClick={onBack}>Back to Lobby</button>
            </div>
        );
    }

    if (!gameState || !myRole) {
        return (
            <div className="game-page loading">
                <div>Initializing...</div>
            </div>
        );
    }

    const battingTeam = gameState.halfInning === 'top' ? gameState.awayTeam : gameState.homeTeam;

    return (
        <div className="game-page">
            <div className="game-top">
                <button className="game-back-btn" onClick={onBack}>&larr; Leave</button>
                <Scoreboard state={gameState} homeEmail={homeEmail} awayEmail={awayEmail} />
            </div>

            <div className="game-main">
                <div className="game-left">
                    <Diamond bases={gameState.bases} outs={gameState.outs} battingTeam={battingTeam} />
                    <ActionBar state={gameState} myRole={myRole} onAction={handleAction} />
                </div>
                <div className="game-center">
                    <AtBatPanel state={gameState} />
                </div>
                <div className="game-right">
                    <GameLog state={gameState} />
                </div>
            </div>
        </div>
    );
}
