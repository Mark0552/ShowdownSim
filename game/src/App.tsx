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
import TeamBuilder from './pages/TeamBuilder';

type Page = 'login' | 'menu' | 'lineups' | 'builder';

export default function App() {
    const [cards, setCards] = useState<Card[]>([]);
    const [cardsLoading, setCardsLoading] = useState(true);
    const [page, setPage] = useState<Page>('login');
    const [userEmail, setUserEmail] = useState('');
    const [editingLineup, setEditingLineup] = useState<SavedLineup | null>(null);
    const teamStore = useTeamStore();
    const dragStore = useDragStore();

    // Load cards
    useEffect(() => {
        loadCards().then(({ all }) => {
            setCards(all);
            setCardsLoading(false);
        });
    }, []);

    // Check existing session
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setUserEmail(user.email || '');
                setPage('menu');
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
            // Load the lineup data into the team store
            const cardMap = new Map(cards.map(c => [c.id, c]));
            const hydratedSlots = lineup.data.slots
                ?.map((slot: any) => {
                    const card = cardMap.get(slot.card?.id);
                    if (!card) return null;
                    return { ...slot, card };
                })
                .filter(Boolean) || [];
            teamStore.dispatch({
                type: 'LOAD',
                team: { ...lineup.data, slots: hydratedSlots }
            });
        } else {
            teamStore.clearTeam();
        }
        setPage('builder');
    };

    const handleBuilderBack = () => {
        setEditingLineup(null);
        setPage('lineups');
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
                    onBack={handleBuilderBack}
                />
            );
    }
}
