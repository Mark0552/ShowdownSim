import { useEffect, useRef } from 'react';
import type { Card, HitterCard, PitcherCard } from '../../types/cards';
import './CardTooltip.css';

interface Props {
    card: Card;
    /** Optional dismiss callback. When provided, mobile mode renders a tap
     *  backdrop + × button so the tooltip can be closed by touch (hover-out
     *  doesn't fire reliably on iOS). Desktop ignores this — the parent's
     *  mouseleave still drives dismissal there. */
    onClose?: () => void;
}

export default function CardTooltip({ card, onClose }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const isHitter = card.type === 'hitter';
    const h = card as HitterCard;
    const p = card as PitcherCard;

    // Position near top-right of viewport so it doesn't overlap the card being hovered
    useEffect(() => {
        if (ref.current) {
            // Keep it visible
            const el = ref.current;
            const rect = el.getBoundingClientRect();
            if (rect.bottom > window.innerHeight) {
                el.style.top = `${window.innerHeight - rect.height - 10}px`;
            }
        }
    }, [card]);

    return (
        <>
            {onClose && <div className="ct-backdrop" onClick={onClose} />}
            <div className="card-tooltip" ref={ref}>
                {onClose && (
                    <button className="ct-close" onClick={onClose} aria-label="Close">✕</button>
                )}
                <div className="ct-layout">
                <img src={card.imagePath} alt="" className="ct-image" />
                <div className="ct-info">
                    <h3>{card.name}</h3>
                    <div className="ct-meta">
                        <span>{card.team}</span>
                        <span>#{card.cardNum}</span>
                        <span>{card.edition}</span>
                        <span>{card.year}</span>
                        <span>{card.expansion}</span>
                    </div>

                    <div className="ct-stats">
                        <div className="ct-stat"><span>Points</span><span>{card.points}</span></div>
                        {isHitter ? (
                            <>
                                <div className="ct-stat"><span>On-Base</span><span>{h.onBase}</span></div>
                                <div className="ct-stat"><span>Speed</span><span>{h.speed}</span></div>
                                <div className="ct-stat"><span>Position</span><span>{h.positions.map(p => `${p.position}+${p.fielding}`).join(', ') || 'DH'}</span></div>
                            </>
                        ) : (
                            <>
                                <div className="ct-stat"><span>Control</span><span>{p.control}</span></div>
                                <div className="ct-stat"><span>IP</span><span>{p.ip}</span></div>
                                <div className="ct-stat"><span>Role</span><span>{p.role}</span></div>
                            </>
                        )}
                        <div className="ct-stat"><span>Hand</span><span>{card.hand}</span></div>
                        <div className="ct-stat"><span>Icons</span><span>{card.icons.length > 0 ? card.icons.join(' ') : 'None'}</span></div>
                    </div>

                    <div className="ct-chart">
                        <table>
                            <thead>
                                <tr>
                                    {isHitter
                                        ? ['SO','GB','FB','W','S','S+','DB','TR','HR'].map(f => <th key={f}>{f}</th>)
                                        : ['PU','SO','GB','FB','W','S','DB','HR'].map(f => <th key={f}>{f}</th>)
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    {isHitter
                                        ? [h.chart.SO, h.chart.GB, h.chart.FB, h.chart.W, h.chart.S, h.chart.SPlus, h.chart.DB, h.chart.TR, h.chart.HR].map((v, i) => <td key={i}>{v || '-'}</td>)
                                        : [p.chart.PU, p.chart.SO, p.chart.GB, p.chart.FB, p.chart.W, p.chart.S, p.chart.DB, p.chart.HR].map((v, i) => <td key={i}>{v || '-'}</td>)
                                    }
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            </div>
        </>
    );
}
