import { useState, useEffect, useCallback } from 'react';
import type { Card } from './types/cards';
import type { SavedLineup } from './lib/lineups';
import { loadCards } from './data/cardData';
import { supabase } from './lib/supabase';
import { getUsername, getUser } from './lib/auth';
import { useTeamStore } from './store/teamStore';
import { useDragStore } from './store/dragStore';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import LineupsPage from './pages/LineupsPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import StatsPage from './pages/StatsPage';
import SimulationPage from './pages/SimulationPage';
import PricingPage from './pages/PricingPage';
import TeamBuilder from './pages/TeamBuilder';
import MusicPlayer from './components/MusicPlayer';

type Page = 'login' | 'menu' | 'lineups' | 'builder' | 'lobby' | 'game' | 'stats' | 'simulation' | 'pricing';

/** Read page + gameId from URL hash */
function readHash(): { page: Page | null; gameId: string | null } {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return { page: null, gameId: null };
    if (hash.startsWith('game/')) {
        return { page: 'game', gameId: hash.slice(5) };
    }
    const validPages: Page[] = ['menu', 'lineups', 'builder', 'lobby', 'stats', 'simulation', 'pricing'];
    if (validPages.includes(hash as Page)) {
        return { page: hash as Page, gameId: null };
    }
    return { page: null, gameId: null };
}

export default function App() {
    const [cards, setCards] = useState<Card[]>([]);
    const [cardsLoading, setCardsLoading] = useState(true);
    const [page, setPageState] = useState<Page>('login');
    const [userEmail, setUserEmail] = useState('');
    const [editingLineup, setEditingLineup] = useState<SavedLineup | null>(null);
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const teamStore = useTeamStore();
    const dragStore = useDragStore();

    // Navigate and update hash
    const setPage = useCallback((p: Page, gameId?: string | null) => {
        setPageState(p);
        if (p === 'game' && gameId) {
            window.location.hash = `game/${gameId}`;
        } else if (p === 'login') {
            window.location.hash = '';
        } else {
            window.location.hash = p;
        }
    }, []);

    useEffect(() => {
        loadCards().then(({ all }) => {
            setCards(all);
            setCardsLoading(false);
        });
    }, []);

    useEffect(() => {
        getUser().then((user) => {
            if (user) {
                setUserEmail(getUsername(user));
                // Restore page from hash if user is logged in
                const { page: hashPage, gameId } = readHash();
                if (hashPage === 'game' && gameId) {
                    setActiveGameId(gameId);
                    setPageState('game');
                } else if (hashPage) {
                    setPageState(hashPage);
                } else {
                    setPage('menu');
                }
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                setPage('login');
                setUserEmail('');
            }
        });

        return () => subscription.unsubscribe();
    }, [setPage]);

    // Listen for browser back/forward
    useEffect(() => {
        const onHashChange = () => {
            const { page: hashPage, gameId } = readHash();
            if (hashPage === 'game' && gameId) {
                setActiveGameId(gameId);
                setPageState('game');
            } else if (hashPage) {
                setPageState(hashPage);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const handleLogin = async () => {
        const user = await getUser();
        if (user) {
            setUserEmail(getUsername(user));
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
        setPage('game', gameId);
    };

    if (cardsLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 18 }}>Loading cards...</div>
            </div>
        );
    }

    const renderPage = () => { switch (page) {
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
        case 'stats':
            return (
                <StatsPage
                    onBack={() => setPage('menu')}
                />
            );
        case 'simulation':
            return (
                <SimulationPage
                    onBack={() => setPage('menu')}
                />
            );
        case 'pricing':
            return (
                <PricingPage
                    onBack={() => setPage('menu')}
                />
            );
        case 'game':
            if (!activeGameId) return null;
            return (
                <GamePage
                    gameId={activeGameId}
                    onBack={() => { setActiveGameId(null); setPage('lobby'); }}
                />
            );
    } };

    return (
        <>
            {renderPage()}
            {page !== 'login' && <MusicPlayer />}
        </>
    );
}
