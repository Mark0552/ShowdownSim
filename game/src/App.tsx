import { useState, useEffect } from 'react';
import type { Card } from './types/cards';
import type { SavedLineup } from './lib/lineups';
import { loadCards } from './data/cardData';
import { supabase } from './lib/supabase';
import { useTeamStore } from './store/teamStore';
import { useDragStore } from './store/dragStore';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import LineupsPage from './pages/LineupsPage';
import LobbyPage from './pages/LobbyPage';
import TeamBuilder from './pages/TeamBuilder';

type Page = 'login' | 'menu' | 'lineups' | 'builder' | 'lobby' | 'game';

export default function App() {
    const [cards, setCards] = useState<Card[]>([]);
    const [cardsLoading, setCardsLoading] = useState(true);
    const [page, setPage] = useState<Page>('login');
    const [userEmail, setUserEmail] = useState('');
    const [editingLineup, setEditingLineup] = useState<SavedLineup | null>(null);
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const teamStore = useTeamStore();
    const dragStore = useDragStore();

    useEffect(() => {
        loadCards().then(({ all }) => {
            setCards(all);
            setCardsLoading(false);
        });
    }, []);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setUserEmail(user.email || '');
                setPage('menu');
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                setPage('login');
                setUserEmail('');
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserEmail(user.email || '');
            setPage('menu');
        }
    };

    const handleEditLineup = (lineup: SavedLineup | null) => {
        setEditingLineup(lineup);
        if (lineup) {
            const cardMap = new Map(cards.map(c => [c.id, c]));
            const hydratedSlots = lineup.data.slots
                ?.map((slot: any) => {
                    const card = cardMap.get(slot.card?.id);
                    if (!card) return null;
                    return { ...slot, card };
                })
                .filter(Boolean) || [];
            teamStore.dispatch({ type: 'LOAD', team: { ...lineup.data, slots: hydratedSlots } });
        } else {
            teamStore.clearTeam();
        }
        setPage('builder');
    };

    const handleGameStart = (gameId: string) => {
        setActiveGameId(gameId);
        setPage('game');
    };

    if (cardsLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 18 }}>Loading cards...</div>
            </div>
        );
    }

    switch (page) {
        case 'login':
            return <LoginPage onLogin={handleLogin} />;
        case 'menu':
            return (
                <MainMenu
                    userEmail={userEmail}
                    onNavigate={(p) => setPage(p as Page)}
                    onLogout={() => setPage('login')}
                />
            );
        case 'lineups':
            return (
                <LineupsPage
                    onBack={() => setPage('menu')}
                    onEditLineup={handleEditLineup}
                />
            );
        case 'builder':
            return (
                <TeamBuilder
                    cards={cards}
                    teamStore={teamStore}
                    dragStore={dragStore}
                    editingLineup={editingLineup}
                    onBack={() => { setEditingLineup(null); setPage('lineups'); }}
                />
            );
        case 'lobby':
            return (
                <LobbyPage
                    onBack={() => setPage('menu')}
                    onGameStart={handleGameStart}
                />
            );
        case 'game':
            // Placeholder until Phase 2+3
            return (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: 16 }}>
                    <h1 style={{ color: 'var(--accent)' }}>Game Starting...</h1>
                    <p style={{ color: 'var(--text-dim)' }}>Game ID: {activeGameId?.slice(0, 8)}</p>
                    <p style={{ color: 'var(--text-muted)' }}>Game engine coming soon</p>
                    <button
                        onClick={() => { setActiveGameId(null); setPage('lobby'); }}
                        style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                        Back to Lobby
                    </button>
                </div>
            );
    }
}
