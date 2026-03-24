import type { Card, HitterCard, PitcherCard } from '../../types/cards';
import './CardDetail.css';

interface Props {
    card: Card;
    onRoster: boolean;
    onAdd: () => void;
    onClose: () => void;
    addLabel?: string;
}

export default function CardDetail({ card, onRoster, onAdd, onClose, addLabel = '+ Add to Roster' }: Props) {
    const isHitter = card.type === 'hitter';
    const h = card as HitterCard;
    const p = card as PitcherCard;

    return (
        <div className="card-detail-overlay" onClick={onClose}>
            <div className="card-detail" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>X</button>

                <div className="cd-layout">
                    <img src={card.imagePath} alt={card.name} className="cd-image" />

                    <div className="cd-info">
                        <h2>{card.name}</h2>
                        <div className="cd-meta">
                            <span>{card.team}</span>
                            <span>#{card.cardNum}</span>
                            <span>{card.edition}</span>
                            <span>{card.year}</span>
                            <span>{card.expansion}</span>
                        </div>

                        <div className="cd-stats">
                            <div className="cd-stat">
                                <span className="cd-stat-label">Points</span>
                                <span className="cd-stat-value">{card.points}</span>
                            </div>
                            {isHitter ? (
                                <>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">On-Base</span>
                                        <span className="cd-stat-value">{h.onBase}</span>
                                    </div>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">Speed</span>
                                        <span className="cd-stat-value">{h.speed}</span>
                                    </div>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">Position</span>
                                        <span className="cd-stat-value">
                                            {h.positions.map(p => `${p.position}+${p.fielding}`).join(', ') || 'DH'}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">Control</span>
                                        <span className="cd-stat-value">{p.control}</span>
                                    </div>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">IP</span>
                                        <span className="cd-stat-value">{p.ip}</span>
                                    </div>
                                    <div className="cd-stat">
                                        <span className="cd-stat-label">Role</span>
                                        <span className="cd-stat-value">{p.role}</span>
                                    </div>
                                </>
                            )}
                            <div className="cd-stat">
                                <span className="cd-stat-label">Hand</span>
                                <span className="cd-stat-value">{card.hand}</span>
                            </div>
                            <div className="cd-stat">
                                <span className="cd-stat-label">Icons</span>
                                <span className="cd-stat-value">{card.icons.length > 0 ? card.icons.join(' ') : 'None'}</span>
                            </div>
                        </div>

                        <div className="cd-chart">
                            <h3>Chart</h3>
                            <table>
                                <thead>
                                    <tr>
                                        {isHitter ? (
                                            <>{['SO', 'GB', 'FB', 'W', 'S', 'S+', 'DB', 'TR', 'HR'].map(f =>
                                                <th key={f}>{f}</th>
                                            )}</>
                                        ) : (
                                            <>{['PU', 'SO', 'GB', 'FB', 'W', 'S', 'DB', 'HR'].map(f =>
                                                <th key={f}>{f}</th>
                                            )}</>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        {isHitter ? (
                                            <>{[h.chart.SO, h.chart.GB, h.chart.FB, h.chart.W, h.chart.S, h.chart.SPlus, h.chart.DB, h.chart.TR, h.chart.HR].map((v, i) =>
                                                <td key={i}>{v || '-'}</td>
                                            )}</>
                                        ) : (
                                            <>{[p.chart.PU, p.chart.SO, p.chart.GB, p.chart.FB, p.chart.W, p.chart.S, p.chart.DB, p.chart.HR].map((v, i) =>
                                                <td key={i}>{v || '-'}</td>
                                            )}</>
                                        )}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {!onRoster && addLabel && (
                            <button className="cd-add-btn" onClick={onAdd}>{addLabel}</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
