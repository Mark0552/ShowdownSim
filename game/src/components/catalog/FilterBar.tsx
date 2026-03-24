import type { FilterState } from '../../data/filters';
import './FilterBar.css';

interface Props {
    filters: FilterState;
    options: {
        years: string[];
        expansions: string[];
        editions: string[];
        teams: string[];
    };
    onChange: (key: keyof FilterState, value: string | number) => void;
    onClear: () => void;
    resultCount: number;
    totalCount: number;
}

export default function FilterBar({ filters, options, onChange, onClear, resultCount, totalCount }: Props) {
    // Combined position/type value
    const posValue = filters.position || (filters.type === 'hitter' ? 'AllHitters' : filters.type === 'pitcher' ? 'AllPitchers' : '');

    const handlePosChange = (val: string) => {
        // Reset both type and position, then set based on selection
        if (val === '') {
            onChange('type', 'all');
            onChange('position', '');
        } else if (val === 'AllHitters') {
            onChange('type', 'hitter');
            onChange('position', 'AllHitters');
        } else if (val === 'AllPitchers') {
            onChange('type', 'pitcher');
            onChange('position', '');
        } else if (val === 'Starter' || val === 'Bullpen') {
            onChange('type', 'pitcher');
            onChange('position', val);
        } else {
            onChange('type', 'hitter');
            onChange('position', val);
        }
    };

    return (
        <div className="filter-bar">
            <div className="filter-row">
                <input
                    type="text"
                    className="filter-search"
                    placeholder="Search name or team..."
                    value={filters.search}
                    onChange={e => onChange('search', e.target.value)}
                />
                <select value={posValue} onChange={e => handlePosChange(e.target.value)}>
                    <option value="">All Cards</option>
                    <optgroup label="Hitters">
                        <option value="AllHitters">All Hitters</option>
                        <option value="C">C</option>
                        <option value="1B">1B</option>
                        <option value="2B">2B</option>
                        <option value="3B">3B</option>
                        <option value="SS">SS</option>
                        <option value="LF-RF">LF-RF</option>
                        <option value="CF">CF</option>
                        <option value="DH">DH</option>
                    </optgroup>
                    <optgroup label="Pitchers">
                        <option value="AllPitchers">All Pitchers</option>
                        <option value="Starter">SP</option>
                        <option value="Bullpen">RP / CL</option>
                    </optgroup>
                </select>
                <select value={filters.team} onChange={e => onChange('team', e.target.value)}>
                    <option value="">All Teams</option>
                    {options.teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>
            <div className="filter-row">
                <select value={filters.year} onChange={e => onChange('year', e.target.value)}>
                    <option value="">All Years</option>
                    {options.years.map(y => <option key={y} value={y}>20{y.replace("'", '')}</option>)}
                </select>
                <select value={filters.expansion} onChange={e => onChange('expansion', e.target.value)}>
                    <option value="">All Sets</option>
                    {options.expansions.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select value={filters.edition} onChange={e => onChange('edition', e.target.value)}>
                    <option value="">All Editions</option>
                    {options.editions.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select value={filters.sortBy} onChange={e => onChange('sortBy', e.target.value)}>
                    <option value="points">Sort: Points</option>
                    <option value="name">Sort: Name</option>
                    <option value="team">Sort: Team</option>
                    <option value="onBase">Sort: OB/Ctrl</option>
                    <option value="speed">Sort: Speed</option>
                </select>
                <button
                    className="sort-dir-btn"
                    onClick={() => onChange('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')}
                >
                    {filters.sortDir === 'asc' ? '↑' : '↓'}
                </button>
                <button className="clear-btn" onClick={onClear}>Clear</button>
                <span className="result-count">{resultCount} / {totalCount}</span>
            </div>
        </div>
    );
}
