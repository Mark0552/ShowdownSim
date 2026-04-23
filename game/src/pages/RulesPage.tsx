import { useState } from 'react';
import './RulesPage.css';

interface Props {
    onBack: () => void;
}

type Tab = 'advanced' | 'expert';

interface Section {
    id: string;
    title: string;
}

const ADVANCED_SECTIONS: Section[] = [
    { id: 'overview', title: 'Overview' },
    { id: 'team-building', title: 'Team Building' },
    { id: 'icons', title: 'Icons Reference' },
    { id: 'pregame', title: 'Pre-Game' },
    { id: 'atbat-flow', title: 'At-Bat Flow' },
    { id: 'pitch', title: 'Pitch Resolution' },
    { id: 'chart', title: 'Chart Outcomes' },
    { id: 'baserunning', title: 'Baserunning' },
    { id: 'fielding', title: 'Fielding' },
    { id: 'fatigue', title: 'Fatigue & Pitching Changes' },
    { id: 'substitutions', title: 'Substitutions' },
    { id: 'steals', title: 'Stolen Bases' },
    { id: 'end-of-inning', title: 'End of Inning / Game' },
    { id: 'series', title: 'Series Play' },
    { id: 'stats', title: 'Stats Tracked' },
];

const EXPERT_SECTIONS: Section[] = [
    { id: 'expert-status', title: 'Status' },
    { id: 'expert-overview', title: 'What Expert Adds' },
    { id: 'expert-cards', title: 'Strategy Card Types' },
    { id: 'expert-roadmap', title: 'Roadmap' },
];

export default function RulesPage({ onBack }: Props) {
    const [tab, setTab] = useState<Tab>('advanced');
    const sections = tab === 'advanced' ? ADVANCED_SECTIONS : EXPERT_SECTIONS;

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="rules-page">
            <div className="rules-container">
                <div className="rules-header">
                    <button className="rules-back" onClick={onBack}>&larr; Menu</button>
                    <h1>Game Rules</h1>
                    <div className="rules-header-spacer" />
                </div>

                <div className="rules-tabs">
                    <button
                        className={`rules-tab ${tab === 'advanced' ? 'active' : ''}`}
                        onClick={() => setTab('advanced')}
                    >Advanced</button>
                    <button
                        className={`rules-tab ${tab === 'expert' ? 'active' : ''}`}
                        onClick={() => setTab('expert')}
                    >Expert</button>
                </div>

                <div className="rules-layout">
                    <nav className="rules-toc">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                className="rules-toc-link"
                                onClick={() => scrollTo(s.id)}
                            >{s.title}</button>
                        ))}
                    </nav>

                    <div className="rules-content">
                        {tab === 'advanced' ? <AdvancedRules /> : <ExpertRules />}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AdvancedRules() {
    return (
        <>
            <section id="overview">
                <h2>Overview</h2>
                <p>
                    This game implements the <strong>MLB Showdown 2004/2005 Advanced Rules</strong> from the
                    official rulebook, plus a handful of house rules that resolve ambiguous cases and
                    streamline multiplayer play. Games are rolled by the server as authoritative state;
                    both players see identical outcomes. The engine covers every at-bat phase, icon
                    activation, fielding penalty, baserunning scenario, and substitution path.
                </p>
                <p className="rules-note">
                    House rules are called out inline with a <span className="rules-house">HOUSE</span> tag.
                </p>
            </section>

            <section id="team-building">
                <h2>Team Building</h2>

                <h3>Roster Composition</h3>
                <ul>
                    <li><strong>20 players total</strong> — exactly 20 cards must be placed to save a playable lineup.</li>
                    <li><strong>5,000 point cap</strong> — cumulative card points may not exceed 5,000.</li>
                    <li><strong>9 batting positions</strong>: C, 1B, 2B, 3B, SS, LF-RF (×2), CF, DH.</li>
                    <li><strong>4 starting pitchers</strong> (SP1-SP4) — populate the series rotation.</li>
                    <li><strong>Bullpen</strong>: any number of Relievers and Closers (combined must fit within the 20-slot total).</li>
                    <li><strong>Bench</strong>: fills remaining slots. Bench players pay <strong>1/5 their card cost</strong> (rounded up).</li>
                </ul>

                <h3>Position Eligibility <span className="rules-house">HOUSE</span></h3>
                <p>
                    <span className="rules-house">HOUSE</span> Out-of-position placement and the associated
                    penalty scheme are a house addition. In the official rulebook, hitters must be placed at
                    a position printed on their card. This implementation allows any hitter at <strong>1B</strong>{' '}
                    voluntarily, and permits all other non-native placements only when a mid-game sub leaves
                    no native fielder for a slot.
                </p>
                <table className="rules-table">
                    <thead>
                        <tr><th>Placement</th><th>Penalty</th><th>Allowed in Builder?</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>On-card position</td><td><code>0</code></td><td>Yes</td></tr>
                        <tr><td>Position player at 1B</td><td><code>-1</code></td><td>Yes (only voluntary OOP slot)</td></tr>
                        <tr><td>DH-only card at 1B</td><td><code>-2</code></td><td>Yes</td></tr>
                        <tr><td>Similar-group OOP <span className="rules-note-inline">(2B/3B/SS swap; LF/CF/RF swap)</span></td><td><code>-2</code></td><td>Forced only — when mid-game subs leave no native fielder</td></tr>
                        <tr><td>Cross-group OOP</td><td><code>-3</code></td><td>Forced only — when mid-game subs leave no native fielder</td></tr>
                        <tr><td>Non-catcher at C</td><td><code>-3</code></td><td>Forced only — when mid-game subs leave no native fielder</td></tr>
                    </tbody>
                </table>
                <p>
                    Penalties add directly to the fielder's contribution during fielding rolls (GB-DP, extra-base
                    attempts). A penalty less than zero disables the G icon at that slot.
                </p>

                <h3>Backups &amp; Bench Rules</h3>
                <ul>
                    <li>Bench players are marked <strong>isBackup</strong>. They cannot be placed as starters.</li>
                    <li>Pitchers cannot be bench/backup players.</li>
                    <li>Backups cannot pinch-hit before the <strong>7th inning</strong> (exception: home team may use a backup in the <strong>bottom of the 6th</strong>).</li>
                </ul>

                <h3>DH</h3>
                <ul>
                    <li>DH is always used. Pitchers never bat.</li>
                    <li>Any hitter may occupy the DH slot (no position requirement).</li>
                </ul>
            </section>

            <section id="icons">
                <h2>Icons Reference</h2>

                <h3>Pitcher Icons</h3>
                <table className="rules-table">
                    <thead>
                        <tr><th>Icon</th><th>Effect</th><th>Usage Limit</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>K</strong></td>
                            <td>Override any hit or walk result to <strong>Strikeout</strong>. Offered to defense before the result applies.</td>
                            <td>1× per game</td>
                        </tr>
                        <tr>
                            <td><strong>20</strong></td>
                            <td>+3 Control for a single pitch. Activated before the pitch roll.</td>
                            <td>1× per inning (team-scoped — not reset by pitching change)</td>
                        </tr>
                        <tr>
                            <td><strong>RP</strong></td>
                            <td>+3 Control for the <em>remainder of the current inning</em>. Relievers/Closers only, inning 7+.</td>
                            <td>1× per pitcher per game</td>
                        </tr>
                        <tr>
                            <td><strong>CY</strong></td>
                            <td>Passive: when the pitcher finishes a 1-2-3 inning, add +1 to their effective IP (reduces fatigue).</td>
                            <td>Unlimited</td>
                        </tr>
                        <tr>
                            <td><strong>G</strong></td>
                            <td>Pitcher plays their own position; +10 fielding bonus on DP / extra-base rolls.</td>
                            <td>1× per game</td>
                        </tr>
                    </tbody>
                </table>

                <h3>Hitter Icons</h3>
                <table className="rules-table">
                    <thead>
                        <tr><th>Icon</th><th>Effect</th><th>Usage Limit</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>HR</strong></td>
                            <td>Convert a DB or TR result to <strong>Home Run</strong>.</td>
                            <td>1× per game</td>
                        </tr>
                        <tr>
                            <td><strong>V</strong></td>
                            <td>Reroll an out (SO/GB/FB/PU). <strong>Cannot be used to reroll a K-induced strikeout</strong> — the K icon's conversion is final.</td>
                            <td>2× per game</td>
                        </tr>
                        <tr>
                            <td><strong>S</strong></td>
                            <td>Upgrade a Single or Single+ to a <strong>Double</strong>. Cannot be stacked with HR on the same result.</td>
                            <td>1× per game</td>
                        </tr>
                        <tr>
                            <td><strong>SB</strong></td>
                            <td>Batter auto-steals the next open base after reaching on any on-base result.</td>
                            <td>1× per game</td>
                        </tr>
                        <tr>
                            <td><strong>G</strong></td>
                            <td>+10 fielding on a DP or extra-base roll at the player's slot. Defense chooses which G player to use when multiple are eligible.</td>
                            <td>1× per player per game</td>
                        </tr>
                        <tr>
                            <td><strong>R / RY</strong></td>
                            <td>Informational (Rookie / Rookie Year). No gameplay effect.</td>
                            <td>—</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section id="pregame">
                <h2>Pre-Game</h2>

                <h3>Lineup Selection</h3>
                <p>
                    Each player selects a saved lineup from their account. Once both players click <em>Ready</em>,
                    the server validates both lineups and initializes the game. The lineup is then <strong>locked</strong> —
                    editing the lineup in the builder afterwards does not affect the in-progress game or any
                    subsequent game in the same series.
                </p>

                <h3>Starting Pitcher Roll</h3>
                <p>
                    A single <strong>d20</strong> determines the starting pitcher for <em>both</em> teams at the start of Game 1:
                </p>
                <ul>
                    <li>1–5 → SP1</li>
                    <li>6–10 → SP2</li>
                    <li>11–15 → SP3</li>
                    <li>16–20 → SP4</li>
                </ul>
                <p>
                    This offset is stored on the series row. Subsequent games rotate through the four starters:
                    <code> slot = ((offset + gameNum - 2) mod 4) + 1</code>. Rotation is deterministic after Game 1's roll.
                </p>
            </section>

            <section id="atbat-flow">
                <h2>At-Bat Flow</h2>
                <p>
                    Each at-bat moves through a deterministic phase sequence. The server enforces whose turn
                    it is at each step via the <code>whoseTurn()</code> table and validates every action against
                    a per-phase whitelist. The core path is eight phases; several <em>conditional</em> phases
                    only appear when specific triggers fire.
                </p>

                <h3>Game Setup (one-time)</h3>
                <ol className="rules-ordered">
                    <li><strong>sp_roll</strong> — single d20 roll determines both teams' Game 1 starting pitcher (1-5 = SP1, 6-10 = SP2, 11-15 = SP3, 16-20 = SP4). Series Game 2+ skip this, using the stored <code>series.starter_offset</code>.</li>
                    <li><strong>defense_setup</strong> <em>(conditional)</em> — entered at half-inning boundaries when the defense has bench players that could validly take the field. The defense drags-and-drops players into field/DH slots. Submits when a valid matching exists.</li>
                </ol>

                <h3>Core At-Bat Sequence</h3>
                <ol className="rules-ordered">
                    <li><strong>pre_atbat</strong> <em>(offense, conditional)</em> — entered only if the offense has ≥1 meaningful option: eligible bench player (respecting backup/inning rules), a runner able to steal, or an SB icon available. If none apply, the engine auto-skips straight to <code>defense_sub</code>. Actions: pinch hit, pinch run, steal, activate SB icon, skip.
                        <ul>
                            <li><strong>subPhaseStep: offense_first</strong> — first entry for this at-bat.</li>
                            <li><strong>subPhaseStep: offense_re</strong> — re-entry after the defense made a pitching change; the offense gets a fresh round of options against the new matchup.</li>
                        </ul>
                    </li>
                    <li><strong>defense_sub</strong> <em>(defense, always entered)</em> — actions: pitching change, activate the 20 icon (inline with pitch), activate the RP icon (inning 7+, relievers/closers only), <strong>intentionally walk the batter</strong> (no separate <code>ibb_decision</code> phase is used in practice), skip to bunt/pitch.</li>
                    <li><strong>bunt_decision</strong> <em>(offense, conditional)</em> — offered only when runners are on 1st and/or 2nd, no runner on 3rd, and fewer than 2 outs. Accept rolls the bunt on the pitcher's chart (PU = hold runners, any other = runners advance 1). Skip proceeds to pitch.</li>
                    <li><strong>pitch</strong> <em>(defense rolls)</em> — d20 + Effective Control compared to the batter's On-Base number. Chooses pitcher's or hitter's chart.</li>
                    <li><strong>swing</strong> <em>(offense rolls)</em> — d20 resolved against the selected chart. Produces an outcome code (SO / GB / FB / PU / W / S / S+ / DB / TR / HR).</li>
                    <li><strong>result_icons</strong> <em>(conditional)</em> — defense icons resolve first (K converts hit/walk → strikeout); then offense icons (HR, V for reroll, S for single→double). The server prompts each eligible team in order; an empty prompt is skipped automatically. <strong>V cannot reroll a K-induced strikeout</strong>.</li>
                    <li><strong>baserunning</strong> <em>(not a user-facing phase)</em> — the engine applies the outcome: moves runners, scores runs, records outs, archives subbed-out players. May push one of the conditional phases below.</li>
                </ol>

                <h3>Conditional Post-Swing Phases</h3>
                <ol className="rules-ordered">
                    <li><strong>gb_decision</strong> <em>(defense)</em> — entered on a GB result with runners on base. Defense picks Double Play, Force at Home, or Hold Runners.</li>
                    <li><strong>extra_base_offer</strong> <em>(offense)</em> — entered on a single with a runner on 1st (or similar multi-base scenarios) where the runner could attempt an extra base. Offense chooses whom to send.</li>
                    <li><strong>extra_base</strong> <em>(defense)</em> — entered after <code>extra_base_offer</code> if the offense sent a runner. Defense picks which eligible runner to throw at, then the d20 resolves.</li>
                </ol>

                <h3>Steal Flow (branches from pre_atbat)</h3>
                <ol className="rules-ordered">
                    <li><strong>steal_sb</strong> <em>(conditional)</em> — entered when the offense activates the SB icon. Auto-resolves to success (no roll) and returns to <code>pre_atbat</code>.</li>
                    <li><strong>steal_resolve</strong> <em>(conditional)</em> — entered on a standard steal attempt. d20 + Catcher Arm (+5 to 3rd) vs runner Speed. Returns to <code>pre_atbat</code> afterward.</li>
                </ol>

                <h3>End States</h3>
                <ul>
                    <li>After baserunning (and any post-swing phases) completes, control returns to <code>pre_atbat</code> for the next batter — or to <code>defense_setup</code> / the next half-inning's <code>pre_atbat</code> if three outs were recorded.</li>
                    <li><strong>game_over</strong> — terminal state on walk-off, regulation completion, or extra-inning conclusion. Server writes <code>status='finished'</code> + <code>winner_user_id</code>.</li>
                </ul>

                <h3>Pitching Change Special Case</h3>
                <p>
                    When the defense makes a pitching change in <code>defense_sub</code>, the state returns to{' '}
                    <code>pre_atbat</code> with <code>subPhaseStep: 'offense_re'</code> so the offense gets a
                    fresh pass of options against the new pitcher. Skipping from <code>offense_re</code> goes
                    back to <code>defense_sub</code> (where the defense can still use 20/RP/IBB if available).
                    This is why a pitching change during an at-bat doesn't skip the at-bat.
                </p>
            </section>

            <section id="pitch">
                <h2>Pitch Resolution</h2>
                <h3>Formula</h3>
                <pre className="rules-formula">
Effective Control = max(0, Card Control − Fatigue + Icon Mods)
Pitch Total       = d20 + Effective Control

if Pitch Total &gt; Batter's On-Base → use PITCHER'S chart
else                                → use HITTER'S chart
                </pre>
                <p className="rules-note">
                    The comparison is strictly greater than (<code>&gt;</code>), not ≥. A tie goes to the hitter.
                </p>

                <h3>Modifiers</h3>
                <ul>
                    <li><strong>Fatigue</strong>: <code>-1</code> per inning past the pitcher's effective IP.</li>
                    <li><strong>20 icon</strong>: <code>+3</code> to a single pitch (stripped after the pitch).</li>
                    <li><strong>RP icon</strong>: <code>+3</code> for the rest of the inning (stripped when the inning ends or when the pitcher changes).</li>
                </ul>

                <h3>Effective IP</h3>
                <pre className="rules-formula">
Effective IP = (Card IP − Series Reliever Penalty)
             − floor(Runs Allowed ÷ 3)
             + CY Bonus Innings
                </pre>
                <p>
                    When the inning the pitcher is currently in exceeds Effective IP, each subsequent inning
                    applies a −1 Control penalty.
                </p>
            </section>

            <section id="chart">
                <h2>Chart Outcomes</h2>
                <p>
                    Every card has a chart mapping d20 swing rolls to outcomes. Both pitcher and hitter
                    charts share the same outcome vocabulary:
                </p>
                <table className="rules-table">
                    <thead>
                        <tr><th>Code</th><th>Name</th><th>Effect</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>PU</td><td>Pop Up</td><td>Automatic out. Runners hold.</td></tr>
                        <tr><td>SO</td><td>Strikeout</td><td>Out. Runners hold (unless a steal was triggered).</td></tr>
                        <tr><td>GB</td><td>Ground Ball</td><td>Out at 1st by default. Defense may choose DP / force home / hold runners depending on base state.</td></tr>
                        <tr><td>FB</td><td>Fly Ball</td><td>Out. Sac-fly scores runner from 3rd if fewer than 2 outs.</td></tr>
                        <tr><td>W</td><td>Walk</td><td>Batter to 1st. Forced runners advance. No pitch count.</td></tr>
                        <tr><td>S</td><td>Single</td><td>Batter to 1st. Runners advance one base.</td></tr>
                        <tr><td>S+</td><td>Single Plus</td><td>Batter to 1st (runners advance one). Batter then auto-steals 2nd if open.</td></tr>
                        <tr><td>DB</td><td>Double</td><td>Batter to 2nd. Runners advance two bases (runner from 1st scores is possible via extra-base roll).</td></tr>
                        <tr><td>TR</td><td>Triple</td><td>Batter to 3rd. All runners score.</td></tr>
                        <tr><td>HR</td><td>Home Run</td><td>Everyone scores including the batter.</td></tr>
                    </tbody>
                </table>

                <h3>Sac Bunt (Offense Choice)</h3>
                <p>
                    If offered and accepted, the bunt rolls on the <em>pitcher's</em> chart:
                </p>
                <ul>
                    <li><strong>PU</strong> → runners hold, batter out.</li>
                    <li>Any other result → runners advance one base, batter out.</li>
                </ul>
            </section>

            <section id="baserunning">
                <h2>Baserunning</h2>

                <h3>Forced Advancement</h3>
                <p>
                    On a walk, hit by pitch, or single, only runners who are <em>forced</em> advance mandatorily.
                    All other base movement is governed by the outcome's advancement rule (S / DB / TR / HR).
                </p>

                <h3>Extra Base Attempts</h3>
                <p>
                    On a Single with a runner on 1st (or a Double with a runner on 1st), the offense may attempt
                    to take an extra base. Speed-based bonuses are added to the <em>runner's target</em>, making
                    them harder to throw out:
                </p>
                <pre className="rules-formula">
Runner Target = Runner Speed
            +5 if the runner is going home
            +5 if there are already 2 outs

Defense Roll = d20 + Outfield Fielding Total
            +10 if the G icon is activated (on-card OF only)

if Defense Roll &gt; Runner Target → runner OUT
else                              → runner SAFE  (ties go to the runner)
                </pre>
                <p>
                    The offense decides first whether to send the runner; the defense then chooses which
                    runner to throw at when multiple are eligible.
                </p>

                <h3>Ground Ball Decision</h3>
                <p>
                    With eligible base states on a GB result, the defense enters the <code>gb_decision</code>{' '}
                    phase and picks one of the options below. When no option applies, the batter is simply out
                    at 1st and runners advance normally.
                </p>
                <h4>Double Play <span className="rules-note-inline">(requires runner on 1st)</span></h4>
                <pre className="rules-formula">
Runner on 1st is out automatically (no roll).
Other runners advance.

d20 + IF Fielding  vs  Batter Speed

if defense &gt; batter speed → batter OUT (double play, 2 outs total)
else                        → batter SAFE at 1st (1 out, runner on 1st gone)
                </pre>

                <h4>Force at Home <span className="rules-note-inline">(requires bases loaded)</span></h4>
                <p>
                    Runner from 3rd is thrown out at home (no roll). Other runners advance one base. Batter
                    reaches 1st on a fielder's choice.
                </p>

                <h4>
                    <span className="rules-house">HOUSE</span> Hold Runners
                    <span className="rules-note-inline">(offered in specific base states where runners aren't forced)</span>
                </h4>
                <pre className="rules-formula">
Target = round((Batter Speed + Lead Runner Speed) / 2)

d20 + IF Fielding  vs  Target

if defense &gt; target → batter OUT at 1st, runners held
else                   → batter SAFE at 1st, runners held
                </pre>
                <p>
                    The lead runner is the one furthest along (3rd → 2nd → 1st priority). This option is
                    available when no runner on 1st forces the play (runners only on 2nd and/or 3rd), or in
                    the runner-on-1st-and-3rd-without-2nd scenario where the defense can prefer the force at
                    2nd while holding the runner on 3rd.
                </p>
            </section>

            <section id="fielding">
                <h2>Fielding</h2>

                <h3>Fielding Totals</h3>
                <p>
                    Defensive rolls aggregate fielding from the positions involved:
                </p>
                <ul>
                    <li><strong>Infield</strong> (1B + 2B + 3B + SS): used for GB-DP rolls.</li>
                    <li><strong>Outfield</strong> (LF + CF + RF + both LF-RF slots): used for extra-base rolls.</li>
                    <li><strong>Catcher Arm</strong>: used for steal attempts. +5 bonus on throws to 3rd.</li>
                </ul>
                <p>
                    Each contribution is <em>card fielding + OOP penalty</em>. A non-native assignment applies
                    the penalty directly to that slot's contribution.
                </p>

                <h3>G Icon</h3>
                <ul>
                    <li>Available only when the player is on-card at their assigned position (penalty = 0).</li>
                    <li>Adds +10 to a DP roll or an extra-base throw.</li>
                    <li>1× per player per game.</li>
                    <li>When multiple eligible G players exist, the defense chooses which one to activate.</li>
                </ul>
            </section>

            <section id="fatigue">
                <h2>Fatigue &amp; Pitching Changes</h2>

                <h3>Starter Longevity</h3>
                <ul>
                    <li>Starters cannot be removed before <strong>inning 5</strong> <em>unless</em> they have allowed 10 or more runs.</li>
                    <li>Once a starter leaves, only relievers and closers may enter (not other starters).</li>
                    <li>A pitcher's <strong>entry inning</strong> is tracked to compute innings pitched.</li>
                </ul>

                <h3>Fatigue Penalty</h3>
                <p>
                    Every inning the pitcher is <em>in</em> past their Effective IP applies −1 to Control. The
                    penalty continues to stack each additional inning.
                </p>

                <h3>Runs-Allowed Penalty</h3>
                <p>
                    Effective IP is reduced by <code>floor(runs / 3)</code>. A pitcher who has given up 3+ runs
                    effectively loses one IP; 6+ runs loses two IP.
                </p>

                <h3>CY Bonus</h3>
                <p>
                    Pitchers with the CY icon who finish a 1-2-3 inning (three outs, zero baserunners) gain +1
                    effective IP. Tracked via <code>cyBonusInnings</code> and added to Effective IP each inning.
                </p>

                <h3>Reliever Fatigue Across a Series</h3>
                <p>
                    Each <em>consecutive</em> prior series game a reliever appeared in subtracts{' '}
                    <strong>−1</strong> from their effective IP this game:
                </p>
                <ul>
                    <li>Pitched the previous game → <strong>−1 IP</strong></li>
                    <li>Pitched the previous two games → <strong>−2 IP</strong></li>
                    <li>Pitched the previous three → <strong>−3 IP</strong>, and so on</li>
                </ul>
                <p>
                    A single game of rest <strong>fully resets</strong> the streak — the count stops at the
                    first prior game the reliever didn't appear in. Starters are exempt. Effective IP is
                    clamped at 0 (never negative); if a reliever's card IP is exceeded by the penalty, any
                    use immediately incurs fatigue.
                </p>
            </section>

            <section id="substitutions">
                <h2>Substitutions</h2>

                <h3>Pinch Hit / Pinch Run</h3>
                <p>
                    During <code>pre_atbat</code>, the offense may pinch-hit or pinch-run. The replacement
                    comes from the bench and takes the original player's lineup position. The replaced player
                    is archived (preserved in <code>archivedPlayers</code> for box-score continuity) and cannot
                    return to the game.
                </p>
                <p>
                    Backups cannot pinch-hit before the 7th inning. The home team may use a backup in the
                    bottom of the 6th as an exception.
                </p>

                <h3>Pitching Change</h3>
                <ul>
                    <li>Triggered by defense during <code>defense_sub</code>.</li>
                    <li>Only relievers or closers may enter.</li>
                    <li>Starters cannot be removed before inning 5 unless they've allowed 10+ runs.</li>
                    <li>A pitching change resets the <code>controlModifier</code> (RP/20 bonuses cleared).</li>
                    <li>The new pitcher's <code>pitcherEntryInning</code> is set to the current inning for fatigue calculation.</li>
                </ul>

                <h3>Defensive Setup / Position Swap</h3>
                <p>
                    At half-inning boundaries, the defense may enter a <code>defense_setup</code> phase to
                    rearrange their fielders — subbing players from the bench into any field slot, swapping
                    active players between positions, or moving a player to DH. The modal validates that a
                    feasible lineup exists via a bipartite-matching check before allowing submit.
                </p>
                <p>
                    Any player placed at a non-native position incurs the appropriate OOP penalty, which is
                    displayed in the in-game lineup panel and applied to fielding rolls.
                </p>
            </section>

            <section id="steals">
                <h2>Stolen Bases</h2>

                <h3>When Attempts Are Allowed</h3>
                <ul>
                    <li>Only during the <code>pre_atbat</code> phase (before any pitch).</li>
                    <li>One active steal per pre-at-bat (by any eligible runner).</li>
                    <li>A runner may attempt only one active steal per trip to the bases (S+ auto-steals count against this limit).</li>
                </ul>

                <h3>Formula</h3>
                <pre className="rules-formula">
Defense Roll = d20 + Catcher Arm
            +5 if the throw is to 3rd base

Runner Target = Runner Speed

if Defense Roll &gt; Target → runner CAUGHT STEALING (out)
else                      → runner SAFE  (ties go to the runner)
                </pre>
                <p>
                    Home plate cannot be actively stolen in this implementation.
                </p>
            </section>

            <section id="end-of-inning">
                <h2>End of Inning / Game</h2>

                <h3>Inning End</h3>
                <p>
                    Three outs end the half-inning. Baserunners are cleared, outs reset to 0, icon flags are
                    reset (20-icon-used, RP control modifier for the next team). If the defense's CY icon
                    holder finished 1-2-3, cyBonusInnings increments.
                </p>

                <h3>Game End</h3>
                <ul>
                    <li><strong>Regulation:</strong> After 9 complete innings, if scores differ, the winner is determined.</li>
                    <li><strong>Walk-off:</strong> Inning 9+ bottom, home leading at any point after a scoring play → game ends immediately.</li>
                    <li><strong>Extra innings:</strong> Tied after 9 → continue inning by inning until someone leads at the end of a full inning.</li>
                </ul>

                <h3>Game Completion</h3>
                <p>
                    At game over the server writes <code>status='finished'</code>, <code>winner_user_id</code>,
                    and the final state. Stats are saved to <code>game_player_stats</code> (idempotent).
                    The game row is <strong>never deleted</strong> on conclusion — it's preserved for box-score
                    review, series continuation, and career stat aggregation.
                </p>
            </section>

            <section id="series">
                <h2>Series Play</h2>

                <h3>Best-of-N Format</h3>
                <p>
                    Series are best-of-3, best-of-5, or best-of-7. A series ends when one player wins a
                    majority of games. Subsequent games are not created (ensureNextSeriesGame is lazy).
                </p>

                <h3>Locked Lineups</h3>
                <p>
                    The lineup each player selects for Game 1 is <strong>frozen</strong> for the entire series.
                    Editing the underlying lineup in the builder afterwards does not leak into in-progress
                    games — the selection is snapshotted into <code>games.state.homeLineup / awayLineup</code>,
                    and each next-game row inherits the snapshot from the previous game.
                </p>

                <h3>Starting Rotation</h3>
                <p>
                    Game 1's SP d20 roll picks the starting slot (SP1-SP4), and that offset is stored on the
                    series row. Every subsequent game uses the next slot in order (wrapping at SP4 → SP1).
                    Both teams use the same offset.
                </p>

                <h3>Reliever Fatigue</h3>
                <p>
                    Relievers who pitched in the previous series game(s) start with reduced IP (see Fatigue
                    section). This carries forward automatically — no manual bookkeeping.
                </p>
            </section>

            <section id="stats">
                <h2>Stats Tracked</h2>

                <h3>Batting</h3>
                <p>PA, AB, H, R, RBI, BB, IBB, SO, HR, 2B, 3B, TB, SB, CS, GIDP, SH, SF</p>
                <p>
                    <span className="rules-house">HOUSE</span> IBB is tracked strictly separately from BB
                    (not as a subset). OBP and OPS formulas count IBB as its own component:
                </p>
                <pre className="rules-formula">
OBP = (H + BB + IBB) ÷ (AB + BB + IBB + SF)
SLG = TB ÷ AB
OPS = OBP + SLG
                </pre>

                <h3>Pitching</h3>
                <p>IP (in outs), H, R, BB, IBB, SO, HR, BF, W, L, SV</p>
                <pre className="rules-formula">
ERA  = (R × 9) ÷ (IP ÷ 3)
WHIP = (H + BB) ÷ (IP ÷ 3)
                </pre>
                <p>
                    IP is stored internally as outs (thirds of an inning). Displayed as <code>X.Y</code> where
                    Y is outs in the current inning.
                </p>

                <h3>W/L/SV</h3>
                <p>
                    Tracked via <code>wlTracker</code> during play: the "pitcher of record" for each team updates
                    on lead changes. Save rules follow standard MLB criteria (closer finishes, leading team,
                    minimum innings / tying run on deck).
                </p>
            </section>
        </>
    );
}

function ExpertRules() {
    return (
        <>
            <section id="expert-status">
                <h2>Status</h2>
                <div className="rules-construction">
                    <div className="rules-construction-badge">UNDER CONSTRUCTION</div>
                    <p>
                        Expert rules add <strong>strategy cards</strong> on top of the Advanced ruleset. This
                        layer is not yet wired into the game engine. Card data and images are present in the
                        repository, but the server has no hand-management, card-play phases, or effect
                        resolution yet.
                    </p>
                    <p>
                        Games created in the lobby today use <strong>Advanced rules only</strong>. A future
                        release will add a per-series toggle to enable Expert play.
                    </p>
                </div>
            </section>

            <section id="expert-overview">
                <h2>What Expert Adds</h2>
                <p>
                    MLB Showdown's Expert rules introduce a deck of 175 strategy cards that each player shuffles
                    into their team. Cards are drawn during play and can be activated at specific phases to
                    swing outcomes, counter opponent plays, or trigger one-time effects.
                </p>
                <p>
                    The complete catalog already lives in <code>simulation/strategy_cards.json</code> and card
                    images are stored under <code>cards/2004-Strategy/</code>, <code>cards/2005-Strategy/</code>,
                    and the Trading Deadline / Pennant Run strategy expansions.
                </p>
            </section>

            <section id="expert-cards">
                <h2>Strategy Card Types</h2>
                <p>
                    Strategy cards fall into three broad categories. Exact phase-timing rules will be documented
                    here as implementation lands.
                </p>
                <table className="rules-table">
                    <thead>
                        <tr><th>Type</th><th>Played By</th><th>Typical Effect</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Offense</strong></td>
                            <td>Batting team</td>
                            <td>Modify a pitch or swing roll, upgrade a result, advance a runner, counter a defensive card.</td>
                        </tr>
                        <tr>
                            <td><strong>Defense</strong></td>
                            <td>Fielding team</td>
                            <td>Modify a pitch or fielding roll, convert a hit to an out, prevent an advance, counter an offensive card.</td>
                        </tr>
                        <tr>
                            <td><strong>Utility</strong></td>
                            <td>Either team</td>
                            <td>Draw, search, substitution effects, and other cross-cutting mechanics not tied to a specific phase.</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section id="expert-roadmap">
                <h2>Roadmap</h2>
                <p>
                    The Expert layer is a non-trivial addition to the engine. At minimum it requires:
                </p>
                <ul>
                    <li>New server state for each team's deck, discard pile, and hand.</li>
                    <li>New phases for card-play windows (pre-pitch, pre-swing, pre-result, pre-sub).</li>
                    <li>Effect resolution for every card type (some effects cascade).</li>
                    <li>UI for hand display, card selection, opponent-played-card notification.</li>
                    <li>Stack/counter mechanics where one card can negate another.</li>
                </ul>
                <p>
                    No ETA yet. The Advanced ruleset is fully playable in the meantime.
                </p>
            </section>
        </>
    );
}
