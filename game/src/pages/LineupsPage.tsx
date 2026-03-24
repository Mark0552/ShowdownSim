import { useState, useEffect } from 'react';
import type { SavedLineup } from '../lib/lineups';
import { getLineups, createLineup, deleteLineup } from '../lib/lineups';
import './LineupsPage.css';

interface Props {
    onBack: () => void;
    onEditLineup: (lineup: SavedLineup | null) => void; // null = new lineup
}

export default function LineupsPage({ onBack, onEditLineup }: Props) {
    const [lineups, setLineups] = useState<SavedLineup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadLineups = async () => {
        try {
            setLoading(true);
            const data = await getLineups();
            setLineups(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadLineups(); }, []);

    const handleDelete = async (lineup: SavedLineup) => {
        if (!confirm(`Delete "${lineup.name}"?`)) return;
        try {
            await deleteLineup(lineup.id);
            setLineups(prev => prev.filter(l => l.id !== lineup.id));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="lineups-page">
            <div className="lineups-container">
                <div className="lineups-header">
                    <button className="lineups-back" onClick={onBack}>&larr; Back</button>
                    <h1>My Lineups</h1>
                    <button className="lineups-new" onClick={() => onEditLineup(null)}>
                        + New Lineup
                    </button>
                </div>

                {error && <div className="lineups-error">{error}</div>}

                {loading && <div className="lineups-loading">Loading lineups...</div>}

                {!loading && lineups.length === 0 && (
                    <div className="lineups-empty">
                        <p>No lineups yet.</p>
                        <p>Create your first team roster!</p>
                    </div>
                )}

                <div className="lineups-grid">
                    {lineups.map(lineup => {
                        const data = lineup.data;
                        const playerCount = data?.slots?.length || 0;
                        const totalPoints = data?.slots?.reduce((sum: number, s: any) => {
                            if (s.assignedPosition === 'bench') return sum + Math.ceil(s.card.points / 5);
                            return sum + s.card.points;
                        }, 0) || 0;

                        return (
                            <div key={lineup.id} className="lineup-item">
                                <div className="lineup-item-info">
                                    <h3>{lineup.name}</h3>
                                    <div className="lineup-item-meta">
                                        <span>{playerCount} players</span>
                                        <span>{totalPoints.toLocaleString()} pts</span>
                                        <span>Updated {formatDate(lineup.updated_at)}</span>
                                    </div>
                                    {/* Preview: show first few player names */}
                                    <div className="lineup-item-preview">
                                        {data?.slots?.slice(0, 5).map((s: any, i: number) => (
                                            <span key={i} className="preview-player">{s.card.name}</span>
                                        ))}
                                        {playerCount > 5 && <span className="preview-more">+{playerCount - 5} more</span>}
                                    </div>
                                </div>
                                <div className="lineup-item-actions">
                                    <button className="lineup-edit-btn" onClick={() => onEditLineup(lineup)}>Edit</button>
                                    <button className="lineup-delete-btn" onClick={() => handleDelete(lineup)}>Delete</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
