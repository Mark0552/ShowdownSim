import { useState, useEffect } from 'react';
import type { SavedLineup } from '../lib/lineups';
import { getLineups, createLineup, deleteLineup } from '../lib/lineups';
import { validateTeam } from '../logic/teamRules';
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
                        const validation = data?.slots ? validateTeam(data) : { valid: false, errors: ['No players'], totalPoints: 0, playerCount: 0 };

                        return (
                            <div key={lineup.id} className="lineup-item" style={{ borderLeft: `4px solid ${validation.valid ? '#4ade80' : '#e94560'}` }}>
                                <div className="lineup-item-info">
                                    <h3>
                                        <span style={{ color: validation.valid ? '#4ade80' : '#e94560', marginRight: 8 }}>
                                            {validation.valid ? '\u2713' : '\u2717'}
                                        </span>
                                        {lineup.name}
                                    </h3>
                                    <div className="lineup-item-meta">
                                        <span>{playerCount} players</span>
                                        <span>{validation.totalPoints.toLocaleString()} / 5,000 pts</span>
                                        <span>Updated {formatDate(lineup.updated_at)}</span>
                                    </div>
                                    {!validation.valid && (
                                        <div style={{ fontSize: 11, color: '#e94560', marginTop: 4 }}>
                                            {validation.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
                                            {validation.errors.length > 3 && <div>+{validation.errors.length - 3} more issues</div>}
                                        </div>
                                    )}
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
