import type { GameState } from '../../engine/gameEngine';
import './Scoreboard.css';

interface Props {
    state: GameState;
    homeName: string;
    awayName: string;
}

export default function Scoreboard({ state, homeName, awayName }: Props) {
    const maxInnings = Math.max(9, state.inning);
    const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);

    return (
        <div className="scoreboard">
            <table>
                <thead>
                    <tr>
                        <th className="sb-team-col"></th>
                        {innings.map(i => (
                            <th key={i} className={i === state.inning ? 'current' : ''}>{i}</th>
                        ))}
                        <th className="sb-total">R</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className={state.halfInning === 'top' ? 'batting' : ''}>
                        <td className="sb-team-name">{awayName}</td>
                        {innings.map(i => (
                            <td key={i} className={i === state.inning ? 'current' : ''}>
                                {state.awayTeam.runsPerInning[i - 1] ?? ''}
                            </td>
                        ))}
                        <td className="sb-total">{state.score.away}</td>
                    </tr>
                    <tr className={state.halfInning === 'bottom' ? 'batting' : ''}>
                        <td className="sb-team-name">{homeName}</td>
                        {innings.map(i => (
                            <td key={i} className={i === state.inning ? 'current' : ''}>
                                {state.homeTeam.runsPerInning[i - 1] ?? ''}
                            </td>
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
