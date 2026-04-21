import { useState, useEffect, useMemo, useRef } from 'react';
import type { RawHitter, RawPitcher } from '../sim/simEngine';
import {
    fitHitterPricing, fitPitcherPricing,
    type PricingFit, type PricingRow,
} from '../pricing/pricingRegression';
import type { Card } from '../types/cards';
import CardTooltip from '../components/cards/CardTooltip';
import { hitterFinalToCard, pitcherFinalToCard } from '../components/cards/cardAdapters';
import './PricingPage.css';

const BASE = import.meta.env.BASE_URL || '/';

interface Props { onBack: () => void; }

type SortKey = 'valueRatio' | 'residual' | 'actualPoints' | 'predictedPoints' | 'name' | 'onBaseOrControl' | 'speedOrIp';
type Kind = 'hitters' | 'pitchers';

export default function PricingPage({ onBack }: Props) {
    const [rawData, setRawData] = useState<{ hitters: RawHitter[]; pitchers: RawPitcher[] } | null>(null);
    const [error, setError] = useState('');
    const [kind, setKind] = useState<Kind>('hitters');
    const [sortKey, setSortKey] = useState<SortKey>('residual');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [filter, setFilter] = useState('');
    const [hoverCard, setHoverCard] = useState<Card | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        Promise.all([
            fetch(`${BASE}hitters.json`).then(r => r.json() as Promise<RawHitter[]>),
            fetch(`${BASE}pitchers.json`).then(r => r.json() as Promise<RawPitcher[]>),
        ]).then(([hitters, pitchers]) => setRawData({ hitters, pitchers }))
          .catch((err) => setError(`Failed to load card data: ${err?.message || err}`));
    }, []);

    const hitterFit: PricingFit | null = useMemo(
        () => rawData ? fitHitterPricing(rawData.hitters) : null,
        [rawData]
    );
    const pitcherFit: PricingFit | null = useMemo(
        () => rawData ? fitPitcherPricing(rawData.pitchers) : null,
        [rawData]
    );

    const fit = kind === 'hitters' ? hitterFit : pitcherFit;

    const sortedRows = useMemo(() => {
        if (!fit) return [];
        const q = filter.trim().toLowerCase();
        const filtered = q ? fit.rows.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.team.toLowerCase().includes(q) ||
            (r.icons || '').toLowerCase().includes(q) ||
            (r.position || '').toLowerCase().includes(q)
        ) : fit.rows;
        const mult = sortDir === 'desc' ? -1 : 1;
        const sorted = [...filtered].sort((a, b) => {
            const av = (a as any)[sortKey];
            const bv = (b as any)[sortKey];
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
            return String(av).localeCompare(String(bv)) * mult;
        });
        return sorted;
    }, [fit, sortKey, sortDir, filter]);

    const handleSort = (key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) {
                setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                return prev;
            }
            // Default: asc for name, desc for most numeric — asc here is
            // "most underpriced first" for residual/valueRatio which is the
            // interesting direction, so we keep asc as the default.
            setSortDir(key === 'name' ? 'asc' : (key === 'residual' || key === 'valueRatio' ? 'asc' : 'desc'));
            return key;
        });
    };

    const sortArrow = (key: SortKey) =>
        sortKey === key ? (sortDir === 'desc' ? ' \u25BC' : ' \u25B2') : '';

    const showCardPopup = (row: PricingRow) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
            // Build a minimal Card-shaped object by going through the finals adapter.
            // Both adapters need the raw stats — cheapest way is to look up the raw
            // card by name tokens.
            if (!rawData) return;
            if (kind === 'hitters') {
                const raw = rawData.hitters.find(h =>
                    `${h.Name} ${h['Yr.']} ${h.Ed} ${h['#']} ${h.Team}` === row.name
                );
                if (raw) {
                    setHoverCard(hitterFinalToCard({
                        name: row.name, points: raw.Points, icons: raw.Icons,
                        onBase: raw.onBase, Speed: raw.Speed, Position: raw.Position,
                        hand: raw.H || '', team: raw.Team, edition: raw.Ed, year: raw['Yr.'],
                        expansion: raw.expansion || null, imagePath: raw.imagePath,
                        chart: {
                            SO: raw.SO || '', GB: raw.GB || '', FB: raw.FB || '',
                            W: raw.W || '', S: raw.S || '', SPlus: raw.SPlus || '',
                            DB: raw.DB || '', TR: raw.TR || '', HR: raw.HR || '',
                        },
                    } as any));
                }
            } else {
                const raw = rawData.pitchers.find(p =>
                    `${p.Name} ${p['Yr.']} ${p.Ed} ${p['#']} ${p.Team}` === row.name
                );
                if (raw) {
                    setHoverCard(pitcherFinalToCard({
                        name: row.name, points: raw.Points, Icons: raw.Icons,
                        Control: raw.Control, IP: raw.IP, Position: raw.Position,
                        hand: raw.H || '', team: raw.Team, edition: raw.Ed, year: raw['Yr.'],
                        expansion: raw.expansion || null, imagePath: raw.imagePath,
                        chart: {
                            PU: raw.PU || '', SO: raw.SO || '', GB: raw.GB || '', FB: raw.FB || '',
                            W: raw.W || '', S: raw.S || '', DB: raw.DB || '', HR: raw.HR || '',
                        },
                    } as any));
                }
            }
        }, 200);
    };
    const hidePopup = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHoverCard(null); };

    // Coefficient display: sort descending by absolute value so the most
    // influential features float to the top.
    const coefSorted = useMemo(() => {
        if (!fit) return [];
        return fit.featureNames.map((name, i) => ({ name, value: fit.coefficients[i] }))
            .map((x, i) => ({ ...x, _idx: i }))
            .sort((a, b) => {
                // Keep intercept at top
                if (a.name === '(intercept)') return -1;
                if (b.name === '(intercept)') return 1;
                return Math.abs(b.value) - Math.abs(a.value);
            });
    }, [fit]);

    return (
        <div className="pricing-page">
            <div className="pricing-container">
                <div className="pricing-header">
                    <button className="pricing-back" onClick={onBack}>&larr; Back</button>
                    <h1>Card Pricing Analysis</h1>
                    <div />
                </div>

                <div className="pricing-explainer">
                    <p>
                        Reverse-engineers WotC's card pricing formula with a ridge regression:
                        points = f(OB, Control, chart coverage, icons, position/role, fielding, speed).
                        For each card, <b>predicted points</b> is what the stats say the card should cost,
                        and the <b>residual</b> (actual &minus; predicted) flags over- and under-priced cards.
                    </p>
                    <p>
                        <span className="resid-good">Negative residual / value ratio &lt; 1</span> = <b>underpriced</b> (good buy),
                        {' '}<span className="resid-bad">Positive residual / value ratio &gt; 1</span> = <b>overpriced</b>.
                    </p>
                </div>

                {error && <div className="pricing-error">{error}</div>}
                {!rawData && !error && <div className="pricing-loading">Loading card catalog…</div>}

                {fit && (
                    <>
                        <div className="pricing-tabs">
                            <button className={`pricing-tab ${kind === 'hitters' ? 'active' : ''}`} onClick={() => setKind('hitters')}>Hitters ({hitterFit?.rows.length ?? 0})</button>
                            <button className={`pricing-tab ${kind === 'pitchers' ? 'active' : ''}`} onClick={() => setKind('pitchers')}>Pitchers ({pitcherFit?.rows.length ?? 0})</button>
                        </div>

                        <div className="pricing-fit-summary">
                            <span>R&sup2;: <b>{fit.rSquared.toFixed(3)}</b></span>
                            <span>Mean |residual|: <b>{fit.meanAbsResidual.toFixed(1)} pts</b></span>
                            <span className="pricing-fit-note">
                                {fit.rSquared > 0.9 ? 'Very tight fit — the pricing formula is close to linear in these features.'
                                    : fit.rSquared > 0.7 ? 'Reasonable fit — most price movement is explained.'
                                    : 'Loose fit — nonlinearities or missing features at play.'}
                            </span>
                        </div>

                        <div className="pricing-layout">
                            {/* Coefficients panel */}
                            <div className="pricing-coefs">
                                <h3>Feature Weights</h3>
                                <p className="pricing-coef-sub">How many points each feature contributes on average.</p>
                                <table className="pricing-coef-table">
                                    <thead><tr><th>Feature</th><th>Pts</th></tr></thead>
                                    <tbody>
                                        {coefSorted.map(c => (
                                            <tr key={c.name}>
                                                <td>{c.name}</td>
                                                <td className={c.value > 0 ? 'pos' : c.value < 0 ? 'neg' : ''}>{c.value.toFixed(1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Card-level table */}
                            <div className="pricing-rows">
                                <div className="pricing-rows-head">
                                    <input
                                        type="text" className="pricing-filter"
                                        placeholder="Filter by name, team, icon, position…"
                                        value={filter}
                                        onChange={e => setFilter(e.target.value)}
                                    />
                                    <span className="pricing-row-count">{sortedRows.length.toLocaleString()} cards</span>
                                </div>
                                <div className="pricing-table-wrap">
                                    <table className="pricing-table">
                                        <thead>
                                            <tr>
                                                <th onClick={() => handleSort('name')} className="sortable">Name{sortArrow('name')}</th>
                                                <th onClick={() => handleSort('onBaseOrControl')} className="sortable">{kind === 'hitters' ? 'OB' : 'Ctrl'}{sortArrow('onBaseOrControl')}</th>
                                                <th onClick={() => handleSort('speedOrIp')} className="sortable">{kind === 'hitters' ? 'Spd' : 'IP'}{sortArrow('speedOrIp')}</th>
                                                <th>Pos / Role</th>
                                                <th>Icons</th>
                                                <th onClick={() => handleSort('actualPoints')} className="sortable num">Actual{sortArrow('actualPoints')}</th>
                                                <th onClick={() => handleSort('predictedPoints')} className="sortable num">Predicted{sortArrow('predictedPoints')}</th>
                                                <th onClick={() => handleSort('residual')} className="sortable num">Residual{sortArrow('residual')}</th>
                                                <th onClick={() => handleSort('valueRatio')} className="sortable num">Value Ratio{sortArrow('valueRatio')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedRows.map(r => (
                                                <tr key={r.name}>
                                                    <td className="name-cell"
                                                        onMouseEnter={() => showCardPopup(r)}
                                                        onMouseLeave={hidePopup}>
                                                        {r.name}
                                                    </td>
                                                    <td>{r.onBaseOrControl}</td>
                                                    <td>{r.speedOrIp}</td>
                                                    <td>{r.position}</td>
                                                    <td className="icons-cell">{r.icons || ''}</td>
                                                    <td className="num">{r.actualPoints}</td>
                                                    <td className="num">{r.predictedPoints.toFixed(0)}</td>
                                                    <td className={`num ${r.residual < -20 ? 'resid-good' : r.residual > 20 ? 'resid-bad' : ''}`}>
                                                        {r.residual > 0 ? '+' : ''}{r.residual.toFixed(0)}
                                                    </td>
                                                    {/* Ratio coloring follows residual sign so a negative ratio
                                                         (model predicts <= 0) correctly colors red instead of green. */}
                                                    <td className={`num ${r.residual < -20 ? 'resid-good' : r.residual > 20 ? 'resid-bad' : ''}`}>
                                                        {r.valueRatio.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {hoverCard && <CardTooltip card={hoverCard} />}
            </div>
        </div>
    );
}
