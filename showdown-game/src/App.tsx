import { useState, useEffect } from 'react';
import type { Card } from './types/cards';
import { loadCards } from './data/cardData';
import { useTeamStore } from './store/teamStore';
import { useDragStore } from './store/dragStore';
import TeamBuilder from './pages/TeamBuilder';

export default function App() {
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const teamStore = useTeamStore();
    const dragStore = useDragStore();

    useEffect(() => {
        loadCards().then(({ all }) => {
            setCards(all);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 18 }}>Loading 1,196 cards...</div>
            </div>
        );
    }

    return <TeamBuilder cards={cards} teamStore={teamStore} dragStore={dragStore} />;
}
