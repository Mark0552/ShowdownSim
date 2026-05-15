import { useEffect, useState, useMemo, useCallback } from 'react';
import './StrategyCardsPage.css';

const BASE = import.meta.env.BASE_URL || '/';

interface StrategyCard {
    '#': number;
    Name: string;
    Type: 'Off' | 'Def' | 'Util';
    'Yr.': string;
    WhenPlayed: string;
    Description: string;
    expansion: string;
    imagePath: string;
}

interface Props {
    onBack: () => void;
}

const YEAR_ORDER = ["'04", "'05"] as const;
const EXPANSION_ORDER = ['Base Set', 'Pennant Run', 'Trading Deadline'] as const;
const TYPE_ORDER = ['Off', 'Def', 'Util'] as const;
const TYPE_LABELS: Record<string, string> = { Off: 'Offense', Def: 'Defense', Util: 'Utility' };

function sortCards(a: StrategyCard, b: StrategyCard): number {
    const yA = YEAR_ORDER.indexOf(a['Yr.'] as typeof YEAR_ORDER[number]);
    const yB = YEAR_ORDER.indexOf(b['Yr.'] as typeof YEAR_ORDER[number]);
    if (yA !== yB) return yA - yB;
    const eA = EXPANSION_ORDER.indexOf(a.expansion as typeof EXPANSION_ORDER[number]);
    const eB = EXPANSION_ORDER.indexOf(b.expansion as typeof EXPANSION_ORDER[number]);
    if (eA !== eB) return eA - eB;
    const tA = TYPE_ORDER.indexOf(a.Type);
    const tB = TYPE_ORDER.indexOf(b.Type);
    if (tA !== tB) return tA - tB;
    return (a['#'] || 0) - (b['#'] || 0);
}

export default function StrategyCardsPage({ onBack }: Props) {
    const [cards, setCards] = useState<StrategyCard[] | null>(null);
    const [error, setError] = useState('');

    // Filter state — Set is mutated by toggling checkboxes. Start with
    // all values selected so the first view shows everything.
    const [yearFilter, setYearFilter] = useState<Set<string>>(new Set(YEAR_ORDER));
    const [expansionFilter, setExpansionFilter] = useState<Set<string>>(new Set(EXPANSION_ORDER));
    const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(TYPE_ORDER));

    const [index, setIndex] = useState(0);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        fetch(`${BASE}strategy_cards.json`)
            .then(r => r.json() as Promise<StrategyCard[]>)
            .then(setCards)
            .catch((err) => setError(`Failed to load strategy cards: ${err?.message || err}`));
    }, []);

    const filtered = useMemo<StrategyCard[]>(() => {
        if (!cards) return [];
        return cards
            .filter(c => yearFilter.has(c['Yr.']) && expansionFilter.has(c.expansion) && typeFilter.has(c.Type))
            .sort(sortCards);
    }, [cards, yearFilter, expansionFilter, typeFilter]);

    // If filters tighten and the current index falls out of range, clamp
    // back to a valid slot rather than crashing or rendering nothing.
    useEffect(() => {
        if (filtered.length === 0) { setIndex(0); return; }
        if (index >= filtered.length) setIndex(0);
        setImgFailed(false);
    }, [filtered.length, index]);

    const goPrev = useCallback(() => {
        if (filtered.length === 0) return;
        setIndex(i => (i - 1 + filtered.length) % filtered.length);
        setImgFailed(false);
    }, [filtered.length]);

    const goNext = useCallback(() => {
        if (filtered.length === 0) return;
        setIndex(i => (i + 1) % filtered.length);
        setImgFailed(false);
    }, [filtered.length]);

    // Arrow-key navigation. Only fires when the user isn't typing into a
    // form field; not strictly needed here since there are no text inputs,
    // but cheap defense.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') goPrev();
            else if (e.key === 'ArrowRight') goNext();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goPrev, goNext]);

    const toggleFilter = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(value)) next.delete(value); else next.add(value);
        setter(next);
        setIndex(0);
    };

    const renderFilterGroup = (
        label: string,
        values: readonly string[],
        set: Set<string>,
        setter: (s: Set<string>) => void,
        labelMap?: Record<string, string>,
    ) => (
        <div className="sc-filter-group">
            <span className="sc-filter-label">{label}</span>
            <div className="sc-filter-row">
                {values.map(v => (
                    <label key={v} className="sc-filter-option">
                        <input
                            type="checkbox"
                            checked={set.has(v)}
                            onChange={() => toggleFilter(set, v, setter)}
                        />
                        <span>{labelMap?.[v] || v}</span>
                    </label>
                ))}
            </div>
        </div>
    );

    // ---------- render ----------

    if (error) {
        return (
            <div className="strategy-cards-page">
                <div className="strategy-cards-container">
                    <div className="strategy-cards-header">
                        <button className="strategy-cards-back" onClick={onBack}>&larr; Back</button>
                        <h1>Strategy Cards</h1>
                        <div />
                    </div>
                    <div className="sc-error">{error}</div>
                </div>
            </div>
        );
    }

    if (!cards) {
        return (
            <div className="strategy-cards-page">
                <div className="strategy-cards-container">
                    <div className="strategy-cards-header">
                        <button className="strategy-cards-back" onClick={onBack}>&larr; Back</button>
                        <h1>Strategy Cards</h1>
                        <div />
                    </div>
                    <div className="sc-loading">Loading…</div>
                </div>
            </div>
        );
    }

    const current = filtered[index] || null;
    const imgPath = current ? `${BASE}${current.imagePath.replace(/\\/g, '/')}` : '';

    return (
        <div className="strategy-cards-page">
            <div className="strategy-cards-container">
                <div className="strategy-cards-header">
                    <button className="strategy-cards-back" onClick={onBack}>&larr; Back</button>
                    <h1>Strategy Cards</h1>
                    <div className="strategy-cards-header-spacer" />
                </div>

                <div className="sc-controls">
                    {renderFilterGroup('Year', YEAR_ORDER, yearFilter, setYearFilter)}
                    {renderFilterGroup('Expansion', EXPANSION_ORDER, expansionFilter, setExpansionFilter)}
                    {renderFilterGroup('Type', TYPE_ORDER, typeFilter, setTypeFilter, TYPE_LABELS)}
                </div>

                <div className="sc-nav">
                    <button className="sc-nav-btn" onClick={goPrev} disabled={filtered.length === 0}>
                        &larr; Prev
                    </button>
                    <span className="sc-nav-counter">
                        {filtered.length === 0 ? '0 / 0' : `${index + 1} / ${filtered.length}`}
                    </span>
                    <button className="sc-nav-btn" onClick={goNext} disabled={filtered.length === 0}>
                        Next &rarr;
                    </button>
                </div>

                {!current ? (
                    <div className="sc-empty">No cards match these filters.</div>
                ) : (
                    <div className="sc-card">
                        {imgFailed ? (
                            <div className="sc-img-missing">image missing</div>
                        ) : (
                            <img
                                className="sc-img"
                                src={imgPath}
                                alt={current.Name}
                                onError={() => setImgFailed(true)}
                            />
                        )}
                        <div className="sc-text">
                            <h2>{current.Name}</h2>
                            <div className="sc-meta">
                                <span className="sc-pill">#{current['#']}</span>
                                <span className="sc-pill">{current['Yr.']}</span>
                                <span className="sc-pill">{current.expansion}</span>
                                <span className={`sc-pill sc-type-${current.Type}`}>
                                    {TYPE_LABELS[current.Type] || current.Type}
                                </span>
                            </div>
                            <div className="sc-section">
                                <h3>When Played</h3>
                                <p>{current.WhenPlayed || '—'}</p>
                            </div>
                            <div className="sc-section">
                                <h3>Description</h3>
                                <p>{current.Description || '—'}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="sc-hint">
                    Tip: use &larr; / &rarr; keys to navigate.
                    Sort order: Year &rarr; Expansion &rarr; Type &rarr; #.
                </div>
            </div>
        </div>
    );
}
