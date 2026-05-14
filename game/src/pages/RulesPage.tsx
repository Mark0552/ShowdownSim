import { useState } from 'react';
import './RulesPage.css';

interface Props {
    onBack: () => void;
}

type Tab = 'start' | 'advanced' | 'expert';

interface Section {
    id: string;
    title: string;
}

const START_SECTIONS: Section[] = [
    { id: 'welcome', title: 'Welcome' },
    { id: 'card-anatomy', title: 'Reading a Card' },
    { id: 'duel', title: 'The Core Duel' },
    { id: 'first-lineup', title: 'Your First Lineup' },
    { id: 'first-game', title: 'Playing a Game' },
    { id: 'common-icons', title: 'Common Icons' },
    { id: 'mobile-desktop', title: 'Mobile vs Desktop' },
    { id: 'tips', title: 'Tips for New Players' },
    { id: 'glossary', title: 'Glossary' },
];

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
    const [tab, setTab] = useState<Tab>('start');
    const sections = tab === 'start' ? START_SECTIONS
        : tab === 'advanced' ? ADVANCED_SECTIONS
        : EXPERT_SECTIONS;

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="rules-page">
            <div className="rules-container">
                <div className="rules-stickytop">
                    <div className="rules-header">
                        <button className="rules-back" onClick={onBack}>&larr; Menu</button>
                        <h1>Showdown Rules</h1>
                        <div className="rules-header-spacer" />
                    </div>

                    <div className="rules-tabs">
                        <button
                            className={`rules-tab ${tab === 'start' ? 'active' : ''}`}
                            onClick={() => setTab('start')}
                        >Getting Started</button>
                        <button
                            className={`rules-tab ${tab === 'advanced' ? 'active' : ''}`}
                            onClick={() => setTab('advanced')}
                        >Advanced Rules</button>
                        <button
                            className={`rules-tab ${tab === 'expert' ? 'active' : ''}`}
                            onClick={() => setTab('expert')}
                        >Expert Rules</button>
                    </div>
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
                        {tab === 'start' ? <GettingStarted />
                            : tab === 'advanced' ? <AdvancedRules />
                            : <ExpertRules />}
                    </div>
                </div>
            </div>
        </div>
    );
}

function GettingStarted() {
    return (
        <>
            <section id="welcome">
                <h2>Welcome to MLB Showdown</h2>
                <p>
                    MLB Showdown is a baseball card game originally published by Wizards of the Coast from
                    2000 to 2005. Each card represents a real MLB player from that season, with their stats
                    translated into a d20 chart system. Two players each build a 20-card team within a
                    5,000-point budget, then play head-to-head — the pitcher rolls, the batter rolls, and
                    the dice plus the cards decide what happens.
                </p>
                <p>
                    This app is a full digital recreation of the <strong>2004 and 2005 Advanced ruleset</strong> —
                    the most complete and balanced version of the game. The card pool is the entire
                    2004/2005 catalog (1,196 cards across Base, Pennant Run, Trading Deadline, and Promos),
                    and the engine handles every Advanced rule: pitcher fatigue, on-card icons, position
                    penalties, double plays, extra-base attempts, the works.
                </p>
                <p>
                    Games run head-to-head over a live connection. The server rolls every die so there's no
                    honor system to worry about — both players see identical outcomes. A typical 9-inning
                    game takes 30 to 45 minutes. Series play (best-of-3, 5, or 7) inherits lineups,
                    rotations, and reliever fatigue across games.
                </p>
                <div className="rules-callout">
                    <strong>If you're brand new to Showdown,</strong> this tab is the place to start. The
                    <strong> Advanced Rules</strong> tab on the right is the full rulebook — open it when
                    you want the exact math behind a specific situation. The <strong>Expert Rules</strong> tab
                    documents a future strategy-card layer that isn't yet implemented.
                </div>
            </section>

            <section id="card-anatomy">
                <h2>Reading a Card</h2>
                <p>
                    Every card has the same six things you care about. The layouts differ slightly between
                    hitters and pitchers; everything else is symmetrical.
                </p>

                <h3>Hitter Cards</h3>
                <pre className="rules-formula">
{`Name      Albert Pujols
Position  1B            ← where this hitter plays in the field
Points    460           ← cost against the 5,000-pt team cap
On-Base   12            ← duels the pitcher's roll (higher = on base more often)
Speed     12            ← steals, double plays, extra-base attempts
Icons     HR, S, G      ← one-time game effects

Chart (the d20 outcome table when the duel goes to the hitter):
  SO   1
  GB   2-3
  FB   4-5
  W    —
  S    6-11        ← single
  S+   —
  DB   12-15       ← double
  TR   —
  HR   16-20       ← bigger range = more power`}
                </pre>

                <h3>Pitcher Cards</h3>
                <pre className="rules-formula">
{`Name      Roy Halladay
Position  Starter       ← Starter, Reliever, or Closer
Points    500
Control   5             ← duels the batter's On-Base
IP        7             ← effective innings before fatigue
Icons     CY, 20

Chart (the d20 outcome table when the duel goes to the pitcher):
  PU   1-3        ← pop-out
  SO   4-9        ← strikeouts — wide range = power pitcher
  GB   10-15
  FB   16-19
  W    20
  ...`}
                </pre>

                <h3>What matters most</h3>
                <ul>
                    <li><strong>On-Base vs Control.</strong> The two dueling numbers. We explain the duel in detail in the next section.</li>
                    <li><strong>Chart density.</strong> Two hitters with the same On-Base aren't equal. One might have HR ranges of 18-20 (3 squares); another 19-20 (2 squares). The first will hit more home runs. Always check the chart, not just the headline number.</li>
                    <li><strong>Speed (hitters) / IP (pitchers).</strong> Both translate directly into game outcomes. Speed-15 runners are dangerous on the bases. IP-8 starters stay in the game longer before fatigue.</li>
                    <li><strong>Icons.</strong> Free upside. A pitcher with K + 20 + CY at 500 points is dramatically stronger than a pitcher with the same chart and no icons at 400.</li>
                    <li><strong>Points.</strong> The cost. The cap is 5,000 — every point you save on one card is a point you can spend on another.</li>
                </ul>
            </section>

            <section id="duel">
                <h2>The Core Duel</h2>
                <p>
                    Every at-bat in Showdown is a contest between two numbers: the pitcher's <strong>Control</strong>
                    and the batter's <strong>On-Base</strong>.
                </p>
                <pre className="rules-formula">
{`PITCH ROLL = d20 + Control

If PITCH ROLL is greater than the batter's On-Base
    → use the PITCHER'S chart (mostly outs)
Otherwise (PITCH ROLL ≤ On-Base)
    → use the HITTER'S chart (mostly hits)`}
                </pre>
                <p>
                    The hitter then rolls a d20 on whichever chart was selected. The number that comes up
                    maps to an outcome: strikeout, ground ball, single, home run, etc.
                </p>
                <p>
                    A few common matchups, to give you a feel:
                </p>
                <table className="rules-table">
                    <thead>
                        <tr><th>Matchup</th><th>Pitcher wins ~</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Control 3 vs OB 10</td><td>60%</td><td>Average pitcher, average hitter</td></tr>
                        <tr><td>Control 5 vs OB 10</td><td>70%</td><td>Good pitcher exploits average hitter</td></tr>
                        <tr><td>Control 5 vs OB 13</td><td>55%</td><td>Elite pitcher narrowly favored over elite hitter</td></tr>
                        <tr><td>Control 3 vs OB 13</td><td>45%</td><td>Average pitcher loses more than half the time vs elite hitter</td></tr>
                    </tbody>
                </table>
                <p>
                    A tie always goes to the hitter. That's why winning the duel requires the pitcher's
                    roll to be <em>strictly greater</em> than the On-Base, not just equal.
                </p>
            </section>

            <section id="first-lineup">
                <h2>Your First Lineup</h2>
                <p>
                    Click <strong>Lineups</strong> → <strong>New Lineup</strong>. The team builder has three
                    main regions: a card catalog on the left, a roster sidebar on the right, and a 9-slot
                    batting order along the bottom.
                </p>

                <h3>Build Constraints</h3>
                <ul>
                    <li><strong>20 cards total.</strong> Exactly 20 — not 19, not 21. Saving an incomplete lineup is blocked.</li>
                    <li><strong>5,000 points.</strong> Cumulative card costs cannot exceed this.</li>
                    <li><strong>9 starting hitters</strong> in your batting order: one each at C, 1B, 2B, 3B, SS, CF, plus two LF/RF slots and one DH.</li>
                    <li><strong>4 starting pitchers</strong> in your rotation (SP1 through SP4). Series play rotates through these.</li>
                    <li><strong>Bullpen</strong> — any number of Relievers and Closers; they count against the 20-card total.</li>
                    <li><strong>Bench</strong> — the rest of your slots. Bench players cost <strong>1/5 of their card cost</strong>, rounded up. This is where you stash cheap pinch-hit options and defensive substitutes.</li>
                </ul>

                <h3>How to Draft</h3>
                <p>
                    Mark each card you add as <strong>Starter</strong>, <strong>Bullpen</strong>, or
                    <strong> Bench</strong>. The catalog supports filters (year, position, team, point range)
                    and a text search so you can find specific players quickly. Hover any card to see the
                    full stats and chart in a tooltip; tap on mobile.
                </p>

                <div className="rules-callout">
                    <strong>Spend on pitching first.</strong> The single biggest mistake new players make is
                    spreading the 5,000 points evenly across offense and defense. The optimal build is
                    heavy on elite starting pitching — see the Tips section for details. Read that first
                    before locking in a balanced-looking team.
                </div>
            </section>

            <section id="first-game">
                <h2>Playing a Game</h2>
                <p>The full flow from menu to final out:</p>

                <h3>1. Create or Join a Game</h3>
                <p>
                    Click <strong>Play Game</strong>. You'll see the lobby — your active series at the top,
                    your open games next, then available games hosted by others. Create a new game and
                    you'll be asked for:
                </p>
                <ul>
                    <li><strong>Mode:</strong> Lineup (both players bring a saved lineup) or Draft (snake draft from the full pool).</li>
                    <li><strong>Series length:</strong> Single game, best-of-3, best-of-5, or best-of-7.</li>
                    <li><strong>Password</strong> (optional): keeps random opponents out.</li>
                </ul>

                <h3>2. Ready Up</h3>
                <p>
                    In lineup mode, both players pick their saved lineup and click Ready. In draft mode,
                    both players ready, then go through a 40-pick snake draft from the 1,196-card pool,
                    then set their starting positions and batting order. Once both sides confirm, the game
                    starts.
                </p>

                <h3>3. Starting Pitcher Roll</h3>
                <p>
                    A single d20 determines the starting pitcher for both teams in Game 1:
                </p>
                <ul>
                    <li>1–5 → SP1</li>
                    <li>6–10 → SP2</li>
                    <li>11–15 → SP3</li>
                    <li>16–20 → SP4</li>
                </ul>
                <p>
                    That offset is locked for the whole series — subsequent games rotate through the
                    remaining starters in order.
                </p>

                <h3>4. Each At-Bat</h3>
                <ol className="rules-ordered">
                    <li>
                        <strong>Pre-pitch options.</strong> The offense can pinch-hit (bring in a bench
                        player), pinch-run, or activate a Stolen Base icon. The defense can change pitchers,
                        activate icons (the 20 icon gives +3 Control for one pitch; the RP icon gives
                        +3 for the rest of the inning), or intentionally walk the batter.
                    </li>
                    <li>
                        <strong>Sac Bunt.</strong> If runners are on 1st or 2nd, the batter can sacrifice.
                        Rolls on the pitcher's chart — a PU result holds runners; anything else advances
                        them.
                    </li>
                    <li>
                        <strong>The pitch roll.</strong> The defending player rolls a d20 plus Control. If
                        the total exceeds the batter's On-Base, the duel goes to the pitcher's chart (good
                        for defense); otherwise the hitter's chart (good for offense). A tie goes to the
                        hitter.
                    </li>
                    <li>
                        <strong>The swing roll.</strong> The batting player rolls a d20 on whichever chart
                        was selected. The number maps to an outcome: strikeout, ground ball, fly ball,
                        walk, single, single+, double, triple, or home run.
                    </li>
                    <li>
                        <strong>Icon prompts.</strong> Some outcomes trigger icon offers. If the defense has
                        the K icon, they can convert any hit or walk to a strikeout. If the offense has HR,
                        they can upgrade a double or triple to a home run. The V icon can reroll an out —
                        but it cannot reroll a strikeout the K icon converted.
                    </li>
                    <li>
                        <strong>Baserunning.</strong> Runners advance per the outcome. If a ground ball
                        lands with runners on, the defense picks: try a double play, force at home, or
                        hold runners. Each choice has its own roll. After hits, the offense may send
                        runners for an extra base, and the defense rolls to throw them out.
                    </li>
                </ol>

                <h3>5. End of Inning / End of Game</h3>
                <p>
                    Three outs ends the half. Sides switch. After nine complete innings (or extras if tied),
                    the higher score wins. Stats save automatically, the box score is preserved, and the
                    series advances. Reliever fatigue carries forward to the next game.
                </p>
            </section>

            <section id="common-icons">
                <h2>Common Icons</h2>
                <p>
                    The full list (with exact usage limits) is in <strong>Advanced Rules → Icons Reference</strong>.
                    These are the ones you'll see most often.
                </p>

                <h3>Pitcher Icons</h3>
                <ul>
                    <li><strong>K</strong> — Convert any hit or walk to a strikeout. Once per game.</li>
                    <li><strong>20</strong> — +3 Control for one pitch. Once per inning per team.</li>
                    <li><strong>RP</strong> — +3 Control for the rest of the inning. Relievers/closers only, inning 7+.</li>
                    <li><strong>CY</strong> — Passive bonus: every 1-2-3 inning the pitcher finishes adds +1 to their effective IP, extending the start.</li>
                </ul>

                <h3>Hitter Icons</h3>
                <ul>
                    <li><strong>HR</strong> — Upgrade a double or triple to a home run. Once per game.</li>
                    <li><strong>V</strong> — Reroll an out (not a K-converted strikeout). Twice per game.</li>
                    <li><strong>S</strong> — Upgrade a single to a double. Once per game.</li>
                    <li><strong>SB</strong> — Auto-steal the next base after reaching on any play. Once per game.</li>
                    <li><strong>G</strong> — +10 fielding bonus on a double play or extra-base throw. Only when the player is on-card at their assigned position.</li>
                </ul>
            </section>

            <section id="mobile-desktop">
                <h2>Mobile vs Desktop</h2>
                <p>Same game, two layouts. The breakpoint is 900px viewport width.</p>
                <ul>
                    <li>
                        <strong>Desktop (≥900px):</strong> Classic Showdown layout — a 1400×950 SVG board
                        with the scoreboard up top, lineup panels down the sides, the diamond in the middle,
                        and the dice / action bar at the bottom.
                    </li>
                    <li>
                        <strong>Mobile (&lt;900px):</strong> Stacked vertical layout designed for portrait
                        phone use and iOS Home Screen shortcuts. Scoreboard at top, opponent's lineup strip,
                        diamond with a rolls-and-pitcher sidebar to the right, your lineup strip, action
                        button grid at the bottom. Dice rolls live in the sidebar boxes (yours on the bottom,
                        opponent's on top) instead of the bottom bar.
                    </li>
                </ul>
                <p>
                    Both layouts share the same engine, the same connection, and identical state. One player
                    can be on mobile and the other on desktop with no compatibility issues.
                </p>
            </section>

            <section id="tips">
                <h2>Tips for New Players</h2>

                <h3>1. Spend on pitching, not hitting</h3>
                <p>
                    The canonical optimal build at 5,000 points is four elite starters (each 500+ points,
                    Control 5-6, IP 7-8, with CY + 20 icons), zero bullpen, ~280-point average hitters,
                    and a cheap bench. Splitting your budget evenly across offense and defense leaves you
                    with mediocre starters that fatigue at IP 6 — a Control-3 SP gives up batting practice.
                    Spend the points where they have the highest marginal return.
                </p>

                <h3>2. OBP isn't OPS</h3>
                <p>
                    A walk-machine OB-13 hitter can have a lower OPS than an OB-12 hitter with denser hit
                    ranges. When picking between two hitters at similar on-base numbers, look at the chart
                    density: how many squares are devoted to S, DB, and HR? More is better.
                </p>

                <h3>3. Speed is undervalued</h3>
                <p>
                    Speed determines stolen-base success, makes double plays harder to turn against you,
                    and helps you take extra bases on singles. An OB-11 / Speed-15 hitter is often more
                    useful than an OB-12 / Speed-7 hitter despite costing less.
                </p>

                <h3>4. Use V icons in high-leverage spots</h3>
                <p>
                    Don't waste a V on a leadoff strikeout. Save them for runners on, two outs, late
                    innings — situations where the reroll is most likely to change the game state.
                </p>

                <h3>5. The 20 icon is once per inning, per team</h3>
                <p>
                    Not per pitcher. Changing pitchers doesn't refresh it. Plan your icon usage around the
                    inning, not the matchup.
                </p>

                <h3>6. Position penalties are no joke</h3>
                <p>
                    Putting a 2B at SS is −2 to your infield fielding for the whole game. On the rare
                    occasions a sub forces an out-of-position placement, expect more double plays to fail
                    and more extra-base attempts to succeed against you.
                </p>

                <h3>7. Stealing 3rd is harder than stealing 2nd</h3>
                <p>
                    When the defense throws to 3rd, the catcher gets a +5 arm bonus. Pick your spots —
                    speed-15 runners are still favored, but Speed-12 runners stealing 3rd is a coin flip
                    at best.
                </p>
            </section>

            <section id="glossary">
                <h2>Glossary</h2>
                <ul>
                    <li><strong>On-Base / Control:</strong> The two dueling numbers. Pitcher rolls d20 + Control; if the total exceeds the batter's On-Base, the duel uses the pitcher's chart.</li>
                    <li><strong>Chart:</strong> The d20 outcome table on each card. Pitchers have a chart of outs; hitters have a chart of hits.</li>
                    <li><strong>Effective IP:</strong> A pitcher's stamina rating, modified by runs allowed (every 3 runs = −1 IP) and CY bonuses (every 1-2-3 inning = +1 IP). Pitching past effective IP applies −1 Control per inning of fatigue.</li>
                    <li><strong>OOP:</strong> Out Of Position. A hitter playing a position not on their card. Costs −1 to −3 fielding depending on how far from their native slot.</li>
                    <li><strong>Series:</strong> Best-of-N format (3, 5, or 7). Lineups are locked; rotations cycle through SP1-SP4; reliever fatigue carries forward.</li>
                    <li><strong>Snake draft:</strong> Alternative team-building mode where the two players alternate picks from the full pool. Home picks 1st overall; 20 picks per side, 40 total.</li>
                    <li><strong>Backup:</strong> A bench player. Cannot pinch-hit before the 7th inning (home team can use one in the bottom of the 6th).</li>
                    <li><strong>Sac Bunt:</strong> A bunt offered when runners are on 1st or 2nd. Rolls on the pitcher's chart; PU holds runners, anything else advances them.</li>
                    <li><strong>S+ (Single Plus):</strong> A single where the batter auto-steals 2nd. Other runners advance the same as on a regular single.</li>
                </ul>
            </section>
        </>
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
                    streamline multiplayer play. Games are rolled by the server; both players see identical
                    outcomes. The engine covers every at-bat phase, icon activation, fielding penalty,
                    baserunning scenario, and substitution path.
                </p>
                <p className="rules-note">
                    House rules are called out inline with a <span className="rules-house">HOUSE</span> tag.
                    If you're new to the game, read the <strong>Getting Started</strong> tab first — it
                    explains the duel, the chart system, and how to build a team.
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
                    <li>Bench players are marked as backups. They cannot be placed as starters.</li>
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
                    the lineup is <strong>locked</strong> — editing it in the team builder afterwards does not
                    affect the in-progress game or any subsequent game in the same series.
                </p>

                <h3>Starting Pitcher Roll</h3>
                <p>
                    A single <strong>d20</strong> determines the starting pitcher for <em>both</em> teams at
                    the start of Game 1:
                </p>
                <ul>
                    <li>1–5 → SP1</li>
                    <li>6–10 → SP2</li>
                    <li>11–15 → SP3</li>
                    <li>16–20 → SP4</li>
                </ul>
                <p>
                    This offset is stored with the series. Subsequent games rotate through the four starters
                    in order, wrapping at SP4 → SP1. Rotation is deterministic after Game 1's roll.
                </p>
            </section>

            <section id="atbat-flow">
                <h2>At-Bat Flow</h2>
                <p>
                    Each at-bat moves through a deterministic sequence of phases. The server enforces
                    whose turn it is at each step and validates every action against a per-phase whitelist,
                    so neither player can take an out-of-sequence action.
                </p>

                <h3>Game Setup (one-time)</h3>
                <ol className="rules-ordered">
                    <li>
                        <strong>Starting Pitcher Roll.</strong> A single d20 picks both teams' Game 1 starting
                        pitcher (1-5 = SP1, 6-10 = SP2, 11-15 = SP3, 16-20 = SP4). Series Game 2+ skip this
                        and use the offset already stored on the series.
                    </li>
                    <li>
                        <strong>Defensive Setup</strong> <em>(conditional)</em>. Entered at half-inning boundaries
                        when the defense has bench players that could validly take the field. The defense drags
                        players from the bench into field/DH slots, and submits when a valid matching exists.
                        Skipped automatically when the existing alignment is already valid and matches the last
                        one acknowledged.
                    </li>
                </ol>

                <h3>Core At-Bat Sequence</h3>
                <ol className="rules-ordered">
                    <li>
                        <strong>Pre-Pitch</strong> <em>(offense, conditional)</em> — entered only if the
                        offense has at least one meaningful option: a bench player eligible to pinch-hit
                        (respecting backup / inning rules), a runner able to steal, or an SB icon available.
                        If nothing applies, the engine skips straight to the defense's pre-pitch options.
                        Actions: pinch hit, pinch run, steal, activate the SB icon, skip.
                    </li>
                    <li>
                        <strong>Defense Pre-Pitch</strong> <em>(defense, always entered)</em> — actions:
                        pitching change, activate the 20 icon (inline with the pitch), activate the RP icon
                        (inning 7+, relievers/closers only), intentionally walk the batter, skip to bunt or
                        pitch.
                    </li>
                    <li>
                        <strong>Bunt Decision</strong> <em>(offense, conditional)</em> — offered only when
                        runners are on 1st and/or 2nd, no runner on 3rd, and fewer than 2 outs. Accept rolls
                        the bunt on the pitcher's chart (PU = hold runners, any other = runners advance 1).
                        Skip proceeds to the pitch.
                    </li>
                    <li>
                        <strong>Pitch Roll</strong> <em>(defense rolls)</em> — d20 + Effective Control
                        compared to the batter's On-Base number. Chooses the pitcher's or hitter's chart.
                    </li>
                    <li>
                        <strong>Swing Roll</strong> <em>(offense rolls)</em> — d20 resolved against the
                        selected chart. Produces an outcome code: SO / GB / FB / PU / W / S / S+ / DB / TR / HR.
                    </li>
                    <li>
                        <strong>Result Icons</strong> <em>(conditional)</em> — defense icons resolve first
                        (K converts hit / walk → strikeout); then offense icons (HR, V for reroll, S for
                        single → double). An empty prompt is skipped automatically.
                        <strong> V cannot reroll a K-induced strikeout.</strong>
                    </li>
                    <li>
                        <strong>Baserunning</strong> <em>(not a user-facing phase)</em> — the engine applies
                        the outcome: moves runners, scores runs, records outs, archives any subbed-out
                        players. May trigger one of the conditional post-swing phases below.
                    </li>
                </ol>

                <h3>Conditional Post-Swing Phases</h3>
                <ol className="rules-ordered">
                    <li>
                        <strong>Ground Ball Decision</strong> <em>(defense)</em> — entered on a GB result
                        with runners on base. Defense picks Double Play, Force at Home, or Hold Runners.
                    </li>
                    <li>
                        <strong>Extra Base Offer</strong> <em>(offense)</em> — entered on a single with a
                        runner on 1st (or similar multi-base scenarios). Offense chooses whom to send.
                    </li>
                    <li>
                        <strong>Extra Base Throw</strong> <em>(defense)</em> — entered after the offense
                        sent a runner. Defense picks which eligible runner to throw at, then the d20 resolves.
                    </li>
                </ol>

                <h3>Steal Flow (branches from Pre-Pitch)</h3>
                <ol className="rules-ordered">
                    <li>
                        <strong>SB Icon Steal</strong> <em>(conditional)</em> — entered when the offense
                        activates the SB icon. Auto-resolves to success (no roll) and returns to Pre-Pitch.
                    </li>
                    <li>
                        <strong>Standard Steal</strong> <em>(conditional)</em> — entered on a standard steal
                        attempt. d20 + Catcher Arm (+5 to 3rd) vs runner Speed. Returns to Pre-Pitch
                        afterward.
                    </li>
                </ol>

                <h3>End States</h3>
                <ul>
                    <li>After baserunning (and any post-swing phases) completes, control returns to the next batter's Pre-Pitch — or to a new half-inning if three outs were recorded.</li>
                    <li><strong>Game Over</strong> — terminal state on a walk-off, regulation completion, or extra-inning conclusion. The game is marked complete and the winner is recorded.</li>
                </ul>

                <h3>Pitching Change Special Case</h3>
                <p>
                    When the defense makes a pitching change in Defense Pre-Pitch, the at-bat returns to the
                    offense's Pre-Pitch options so they get a fresh pass against the new pitcher. Skipping
                    that re-entry returns to the defense (where they can still use 20 / RP / IBB if available).
                    This is why a pitching change during an at-bat doesn't skip the at-bat.
                </p>
            </section>

            <section id="pitch">
                <h2>Pitch Resolution</h2>
                <h3>Formula</h3>
                <pre className="rules-formula">
{`Effective Control = max(0, Card Control − Fatigue + Icon Mods)
Pitch Total       = d20 + Effective Control

if Pitch Total > Batter's On-Base → use PITCHER'S chart
else                              → use HITTER'S chart`}
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
{`Effective IP = (Card IP − Series Reliever Penalty)
             − floor(Runs Allowed ÷ 3)
             + CY Bonus Innings`}
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
                        <tr><td>DB</td><td>Double</td><td>Batter to 2nd. Runners advance two bases (runner from 1st scoring is possible via extra-base roll).</td></tr>
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
{`Runner Target = Runner Speed
            +5 if the runner is going home
            +5 if there are already 2 outs

Defense Roll = d20 + Outfield Fielding Total
            +10 if the G icon is activated (on-card OF only)

if Defense Roll > Runner Target → runner OUT
else                            → runner SAFE  (ties go to the runner)`}
                </pre>
                <p>
                    The offense decides first whether to send the runner; the defense then chooses which
                    runner to throw at when multiple are eligible.
                </p>

                <h3>Ground Ball Decision</h3>
                <p>
                    With eligible base states on a GB result, the defense picks one of the options below.
                    When no option applies, the batter is simply out at 1st and runners advance normally.
                </p>
                <h4>Double Play <span className="rules-note-inline">(requires runner on 1st)</span></h4>
                <pre className="rules-formula">
{`Runner on 1st is out automatically (no roll).
Other runners advance.

d20 + IF Fielding  vs  Batter Speed

if defense > batter speed → batter OUT (double play, 2 outs total)
else                      → batter SAFE at 1st (1 out, runner on 1st gone)`}
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
{`Target = round((Batter Speed + Lead Runner Speed) / 2)

d20 + IF Fielding  vs  Target

if defense > target → batter OUT at 1st, runners held
else                → batter SAFE at 1st, runners held`}
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
                <p>Defensive rolls aggregate fielding from the positions involved:</p>
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
                    <li>A pitcher's entry inning is tracked to compute innings pitched.</li>
                </ul>

                <h3>Fatigue Penalty</h3>
                <p>
                    Every inning the pitcher is <em>in</em> past their Effective IP applies −1 to Control.
                    The penalty continues to stack each additional inning.
                </p>

                <h3>Runs-Allowed Penalty</h3>
                <p>
                    Effective IP is reduced by <code>floor(runs / 3)</code>. A pitcher who has given up 3+
                    runs effectively loses one IP; 6+ runs loses two IP.
                </p>

                <h3>CY Bonus</h3>
                <p>
                    Pitchers with the CY icon who finish a 1-2-3 inning (three outs, zero baserunners) gain
                    +1 effective IP.
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
                    During the offense's Pre-Pitch phase, the offense may pinch-hit or pinch-run. The
                    replacement comes from the bench and takes the original player's lineup position. The
                    replaced player is archived for box-score continuity and cannot return to the game.
                </p>
                <p>
                    Backups cannot pinch-hit before the 7th inning. The home team may use a backup in the
                    bottom of the 6th as an exception.
                </p>

                <h3>Pitching Change</h3>
                <ul>
                    <li>Triggered by the defense during their Pre-Pitch phase.</li>
                    <li>Only relievers or closers may enter.</li>
                    <li>Starters cannot be removed before inning 5 unless they've allowed 10+ runs.</li>
                    <li>A pitching change clears any active 20 / RP icon bonuses on the outgoing pitcher.</li>
                    <li>The new pitcher's entry inning is set to the current inning for fatigue calculation.</li>
                </ul>

                <h3>Defensive Setup / Position Swap</h3>
                <p>
                    At half-inning boundaries, the defense may enter a Defensive Setup phase to rearrange
                    their fielders — subbing players from the bench into any field slot, swapping active
                    players between positions, or moving a player to DH. The modal validates that a feasible
                    lineup exists via a bipartite-matching check before allowing submit.
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
                    <li>Only during the offense's Pre-Pitch phase (before any pitch).</li>
                    <li>One active steal per pre-at-bat (by any eligible runner).</li>
                    <li>A runner may attempt only one active steal per trip to the bases (S+ auto-steals count against this limit).</li>
                </ul>

                <h3>Formula</h3>
                <pre className="rules-formula">
{`Defense Roll = d20 + Catcher Arm
            +5 if the throw is to 3rd base

Runner Target = Runner Speed

if Defense Roll > Target → runner CAUGHT STEALING (out)
else                     → runner SAFE  (ties go to the runner)`}
                </pre>
                <p>Home plate cannot be actively stolen in this implementation.</p>
            </section>

            <section id="end-of-inning">
                <h2>End of Inning / Game</h2>

                <h3>Inning End</h3>
                <p>
                    Three outs end the half-inning. Baserunners are cleared, outs reset to 0, icon flags are
                    reset (20-icon-used, RP control modifier for the next team). If the defense's CY icon
                    holder finished 1-2-3, their CY bonus increments.
                </p>

                <h3>Game End</h3>
                <ul>
                    <li><strong>Regulation:</strong> After 9 complete innings, if scores differ, the winner is determined.</li>
                    <li><strong>Walk-off:</strong> Inning 9+ bottom, home leading at any point after a scoring play → game ends immediately.</li>
                    <li><strong>Extra innings:</strong> Tied after 9 → continue inning by inning until someone leads at the end of a full inning.</li>
                </ul>

                <h3>Game Completion</h3>
                <p>
                    At game over the result is recorded with the winner and final state. Per-card batting and
                    pitching stats are saved for the box-score and career-stats views. The game row is
                    <strong> never deleted</strong> on conclusion — it's preserved for box-score review,
                    series continuation, and career stat aggregation.
                </p>
            </section>

            <section id="series">
                <h2>Series Play</h2>

                <h3>Best-of-N Format</h3>
                <p>
                    Series are best-of-3, best-of-5, or best-of-7. A series ends when one player wins a
                    majority of games; subsequent games are not created once the outcome is decided.
                </p>

                <h3>Locked Lineups</h3>
                <p>
                    The lineup each player selects for Game 1 is <strong>frozen</strong> for the entire series.
                    Editing the underlying lineup in the team builder afterwards does not leak into in-progress
                    games — the lineup is snapshotted with each game row, and each next-game row inherits the
                    snapshot from the previous game.
                </p>

                <h3>Starting Rotation</h3>
                <p>
                    Game 1's d20 picks the starting slot (SP1-SP4), and that offset is stored with the series.
                    Every subsequent game uses the next slot in order (wrapping at SP4 → SP1). Both teams use
                    the same offset.
                </p>

                <h3>Reliever Fatigue</h3>
                <p>
                    Relievers who pitched in the previous series game(s) start with reduced IP (see the
                    Fatigue section). This carries forward automatically — no manual bookkeeping.
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
{`OBP = (H + BB + IBB) ÷ (AB + BB + IBB + SF)
SLG = TB ÷ AB
OPS = OBP + SLG`}
                </pre>

                <h3>Pitching</h3>
                <p>IP (in outs), H, R, BB, IBB, SO, HR, BF, W, L, SV</p>
                <pre className="rules-formula">
{`ERA  = (R × 9) ÷ (IP ÷ 3)
WHIP = (H + BB) ÷ (IP ÷ 3)`}
                </pre>
                <p>
                    IP is stored internally as outs (thirds of an inning). Displayed as <code>X.Y</code>{' '}
                    where Y is outs in the current inning.
                </p>

                <h3>W / L / SV</h3>
                <p>
                    Tracked during play: the "pitcher of record" for each team updates on lead changes. Save
                    rules follow standard MLB criteria (closer finishes, leading team, minimum innings / tying
                    run on deck).
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
                    The complete catalog and card images are already in the repository, ready to wire in once
                    the engine support lands.
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
                <p>The Expert layer is a non-trivial addition to the engine. At minimum it requires:</p>
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
