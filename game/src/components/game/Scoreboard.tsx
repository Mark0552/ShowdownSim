import type { GameState } from '../../types/gameState';
import './Scoreboard.css';

interface Props {
    state: GameState;
    homeEmail: string;
    awayEmail: string;
}

export default function Scoreboard({ state, homeEmail, awayEmail }: Props) {
    const maxInnings = Math.max(9, state.inning);
    const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);

    const getInningRuns = (team: 'home' | 'away', inning: number): string => {
        const teamState = team === 'home' ? state.homeTeam : state.awayTeam;
        const runs = teamState.runsPerInning[inning - 1];
        if (runs === undefined) {
            // Future inning
            if (inning > state.inning) return '';
            if (inning === state.inning) {
                if (team === 'away' && state.halfInning === 'top') return '';
                if (team === 'home' && state.halfInning === 'top') return '';
            }
            return '0';
        }
        return String(runs);
    };

    const isCurrentInning = (inning: number) => inning === state.inning;

    return (
        <div className="scoreboard">
            <table>
                <thead>
                    <tr>
                        <th className="sb-team-col"></th>
                        {innings.map(i => (
                            <th key={i} className={`sb-inning ${isCurrentInning(i) ? 'current' : ''}`}>{i}</th>
                        ))}
                        <th className="sb-total">R</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className={state.halfInning === 'top' ? 'batting' : ''}>
                        <td className="sb-team-name">{awayEmail.split('@')[0]}</td>
                        {innings.map(i => (
                            <td key={i} className={isCurrentInning(i) ? 'current' : ''}>{getInningRuns('away', i)}</td>
                        ))}
                        <td className="sb-total">{state.score.away}</td>
                    </tr>
                    <tr className={state.halfInning === 'bottom' ? 'batting' : ''}>
                        <td className="sb-team-name">{homeEmail.split('@')[0]}</td>
                        {innings.map(i => (
                            <td key={i} className={isCurrentInning(i) ? 'current' : ''}>{getInningRuns('home', i)}</td>
                        ))}
                        <td className="sb-total">{state.score.home}</td>
                    </tr>
                </tbody>
            </table>
            <div className="sb-info">
                {state.halfInning === 'top' ? '▲' : '▼'} {state.inning}
                {state.isOver && ' — FINAL'}
            </div>
        </div>
    );
}
