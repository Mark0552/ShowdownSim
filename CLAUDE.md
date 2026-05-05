# MLB Showdown — Project State

This document describes the exact current state of the application for Claude Code context.

## Working with Mark

Mark is a senior developer building a complete digital recreation of the MLB Showdown 2004-2005 trading card game. Deep knowledge of the game rules, strong UX opinions, prefers concise responses and practical implementations.

**Workflow rules — do not violate:**
- **Do NOT auto-push.** Present proposed changes and wait for explicit approval. Past incidents involved untested or misunderstood code being pushed.
- **Understand each requirement before implementing.** When given a list of requirements, confirm understanding of each before writing code; ask clarifying questions if unsure.
- **Never show a dead-end UI with only a skip option.** If the only available action is "skip", auto-skip to the next phase — every phase entry should check whether there are meaningful options before rendering UI.
- **Check the data, don't make up numbers.** Card costs / onBase distributions / chart densities are all in `simulation/hitters.json` + `simulation/pitchers.json`. When discussing strategy or balance, query the actual data rather than guessing.

## Architecture Overview

The project has three main parts:

1. **`simulation/`** — Node.js Monte Carlo simulator (standalone, no UI framework)
2. **`game/`** — React/TypeScript web app (team builder + multiplayer game)
3. **`tools/`** — Puppeteer scrapers for card data and images

## Simulation (`simulation/`)

- `sim.js` — Main simulator. Runs every hitter (753) vs every pitcher (443) for N at-bats.
  Runs TWICE per execution: once with icons ON, once with icons OFF.
  Outputs an HTML report with a top-level "With Icons / Without Icons" toggle.
- `config.js` — Default config. `SEED: null` (random), 500 ABs per matchup.
- `test.js` — 32 tests covering parseRange, rollInRange, determineOutcome, applyHitterIcons, validateData.
- `hitters.json` — 753 hitter cards. Each has: #, Ed, Name, Team, Points, Yr., onBase, Speed, Position, H, Icons, chart fields (SO/GB/FB/W/S/SPlus/DB/TR/HR), expansion, imagePath.
- `pitchers.json` — 443 pitcher cards. Each has: #, Ed, Name, Team, Points, Yr., Control, IP, Position, H, Icons, chart fields (PU/SO/GB/FB/W/S/DB/HR), expansion, imagePath.
- `strategy_cards.json` — 175 strategy cards with #, Name, Type (Off/Def/Util), Yr., WhenPlayed, Description, expansion, imagePath.

### Data sources
- Player card stats scraped from showdowncards.com via `tools/scrape_card_data.js`
- Card images downloaded from TCDB (tcdb.com) via `tools/scrape_images.js`
- Strategy card data from showdowncards.com via `tools/scrape_strategy_cards.js`

## Game (`game/`)

React 19 + TypeScript + Vite SPA. No react-router — uses manual `useState<Page>` routing in `App.tsx`.

### Backend: Supabase
- **URL:** `https://jdvgjiklswargnqrqiet.supabase.co`
- **Auth:** Email/password (emails are fake: `username@showdown.game`). No email confirmation. See "Usernames vs Emails" below — the user always thinks in terms of usernames; the email is an internal artifact.
- **Tables:**
  - `lineups` — id, user_id, name, data (JSONB), created_at, updated_at. RLS: users see only their own.
  - `games` — id, status, mode, home/away user IDs and emails, lineup IDs/names, ready flags, ready-next flags, state (JSONB), password, winner, series_id, game_number. RLS: anyone can see waiting games, participants see their games, anyone can join a waiting game.
  - `series` — id, mode, home/away user IDs and emails, best_of, home_wins/away_wins, lineup IDs/names, status, winner, starter_offset, reliever_history (JSONB).
  - `game_player_stats` — per-card per-game batting + pitching stats, used for the StatsPage. Unique on (game_id, user_id, card_id).
- `games.status` values: `waiting` → `lineup_select` (lineup mode) OR `drafting` → `setting_lineup` (draft mode) → `in_progress` → `finished`.
- `games.mode` / `series.mode` values: `'lineup'` (existing flow, players pick saved lineups) or `'draft'` (snake-draft flow added April 2026).
- **Realtime:** Enabled on `games` table for live updates.

### Page Flow
`LoginPage` → `MainMenu` → `LineupsPage` / `LobbyPage`
- From LineupsPage: New/Edit → `TeamBuilder` → save to Supabase → back to LineupsPage
- From LobbyPage (lineup mode): Create/Join → lineup select → both ready → `GamePage`
- From LobbyPage (draft mode): Create/Join → both "Ready for Draft" → `DraftPage` (snake draft) → set-lineup screen → both submit → `GamePage`

**Routing rule (`targetForGame()` in LobbyPage):** drafted games go to `DraftPage` only during pre-play phases (`drafting` / `setting_lineup`, plus `lineup_select` once both ready). Once a drafted game reaches `in_progress` or `finished`, it always routes to `GamePage` — DraftPage doesn't carry lineup data and would hang the play-state restore.

### Team Builder
- `TeamBuilder.tsx` — Main page. Left: card catalog with filters. Bottom: lineup bar (9 positions). Right sidebar: starters, bullpen, bench.
- `CardCatalog.tsx` — Browsable card grid with search, combined position/type filter, sort. Cards are draggable.
- `LineupBar.tsx` — 9 lineup slots displayed horizontally. Drag to reorder batting order. Cards stored in `cardOrder` state for visual position.
- `RosterPanel.tsx` — Right sidebar: 4 starter slots, bullpen (RP/CL, multiple), rendered as card-sized images.
- `BenchPanel.tsx` — Bench players at 1/5 cost.
- `CardTooltip.tsx` — Fixed-center tooltip showing card at native size (251x350) with full stats. Appears on hover (400ms delay), `pointer-events: none`.
- `DragStore` — Tracks what card is being dragged and which slots are eligible.
- Card sizes computed dynamically via CSS custom properties: `--card-w = (100vw - chrome) / 11`.

### Slot Keys
Field positions use unique slot keys: `C`, `1B`, `2B`, `3B`, `SS`, `LF-RF-1`, `LF-RF-2`, `CF`, `DH`.
Starters use: `Starter-1` through `Starter-4`.
Bullpen cards use: `Reliever` or `Closer` (not unique — multiple allowed).
Bench uses: `bench`.

### Draft Mode (added April 2026)
Snake-draft alternative to picking pre-built lineups. 20 picks per side, 40 picks total, home picks 1st overall.

- `game/src/types/draft.ts` — DraftState / DraftTeamState / buildSnakeOrder.
- `game/src/logic/draftConstraints.ts` — pure constraint engine: bipartite matching for the 9-hitter slate (Hall's theorem), budget lower bound for completing the roster. 24 unit tests in `draftConstraints.test.ts` (run with `npx tsx`).
- `game/src/pages/DraftPage.tsx` — draft picking UI (FilterBar, pool grid with ineligible cards hidden, hover tooltips, always-confirm modal). Also hosts the post-draft `SetLineupScreen` (3 drag-drop rows: position assignment, batting order, SP rotation; bullpen + bench read-only — starter/bench distinction is locked at draft time).
- `server/cards.js` — loads the 1196-card pool from `server/data/*.json` (kept in sync with `game/public/*.json`). Required for draft mode; lineup mode doesn't need it.
- `server/engine/draft.js` + `server/engine/draftConstraints.js` — server-side port of the engine. New WS actions: `READY_FOR_DRAFT`, `DRAFT_PICK`, `SUBMIT_LINEUP`. The server is authoritative — every pick is re-validated.
- `supabase-migration-draft-mode.sql` — `games.mode` + `series.mode` columns plus the `drafting` / `setting_lineup` status values.

**Draft → play handoff:** server's `startPlayFromSubmittedLineups()` calls `initializeGame()` and writes `state.homeLineup` / `state.awayLineup` into the play state so series games 2+ can copy the drafted teams forward via the existing `ensureNextSeriesGame` path. Drafted teams are *not* saved to the lineups table.

**Lineup data on play state — always stamped:** `handleJoinGame()`'s init path also writes `state.homeLineup` / `state.awayLineup` after `initializeGame()`, mirroring the draft handoff. This means **every** play state in the DB carries the raw lineup data, regardless of mode or whether the lineups-table row still exists. Required because:
- Drafts have no lineups-table row at all (so `home_lineup_id` / `away_lineup_id` are null).
- Non-draft users can edit/delete the lineups-table row mid-series.
- After a server restart (Railway redeploy), reconnecting clients source `lineupData` from `state.homeLineup` first — without it, both clients hang on "Waiting for opponent..." because the server's join gate can't be satisfied.

`handleJoinGame()` also tries the Supabase state-load **before** checking `room.homeLineup` / `room.awayLineup`. A loaded state restores everything needed; lineup data is only required when falling through to `initializeGame()` for a fresh game.

**Draft fork in `handleJoinGame`:** routes to `handleDraftJoin` only for `mode='draft'` games in pre-play phases (`waiting / lineup_select / drafting / setting_lineup`). In-progress and finished drafted games fall through to lineup-mode logic, which restores the play state from `gameRow.state` and pulls the lineup from `state.homeLineup`.

### Game Engine Architecture
- **Server (`server/engine.js`)** — Single source of truth. All game logic lives here.
- **Client (`game/src/engine/gameEngine.ts`)** — Types-only file. No game logic, only interfaces and two pure read-only helpers (`getCurrentBatter`, `getCurrentPitcher`).
- **Server (`server/index.js`)** — Express + WebSocket. Validates turns, validates actions per phase, broadcasts state.

**Server engine implements full MLB Showdown Advanced rules:**
- Chart resolution (`parseRange`, `resolveChart`)
- Fielding data extracted from card positions via `getFieldingFromSlot()`
- Ground Ball Double Play: d20 + IF fielding vs batter Speed
- Extra Base Attempts: d20 + OF fielding vs runner Speed (+5 home, +5 two outs)
- S+ (Single Plus): runners advance one extra base
- Pitcher Fatigue: -1 control per inning past IP rating
- Substitutions: pinch hitting, pitching changes, offense→defense→offense ordering
- Icons: K, G, HR, V, SB, 20, CY, RP, S with proper usage limits
- Sac Bunt: rolls on pitcher chart, PU = runners hold, else = runners advance

**Phase flow:**
```
pre_atbat (offense: pinch hit / sac bunt / SB icon / skip)
  → defense_sub (defense: change pitcher / 20/RP icon / skip)
    → [offense_re if defense changed pitcher]
      → pitch (defense rolls)
        → swing (offense rolls)
          → [result_icons if icons available]
            → applyResult (baserunning + DP auto-resolution)
              → [extra_base if eligible runners]
                → next batter (back to pre_atbat)
  ↓ (3 outs)
  endHalfInning → switch sides or end game
```

**`whoseTurn()` by phase:**
- `pre_atbat` → offense, `defense_sub` → defense, `pitch` → defense, `swing` → offense
- `result_icons` → from `iconPrompt.team`, `extra_base` → defense

**Key implementation details:**
- `enterPreAtBat()` auto-skips sub phases if no bench/bullpen available
- DP auto-resolves during `applyResult()` — stores result in `pendingDpResult` for UI display
- G (Gold Glove) icon auto-applies during DP/extra base rolls (+10 fielding)
- CY icon passively checked at `endHalfInning()` — reduces `inningsPitched` by 1 for 1-2-3 innings
- V (Veteran) icon re-enters swing phase for a reroll
- Starter can't be removed before inning 5 unless 10+ runs scored
- `icon20UsedThisInning` and `rpActiveInning` track per-inning icon state

**Multiplayer sync:**
- WebSocket server on Railway (`wss://showdownsim-production.up.railway.app`)
- Server rolls all dice, validates turns via `whoseTurn()`, validates actions per phase via `VALID_ACTIONS` map
- Both players receive identical `game_state` broadcasts
- State persisted to Supabase on phase transitions and game over

### Game UI Components
- `GameBoard.tsx` — Top-level board, dual-render. Above 900px viewport it renders the original 1400×950 SVG (scoreboard, lineup panels, diamond, action+dice strip, log footer all in one SVG). At/below 900px it returns a stacked HTML/grid layout for iOS Home Screen / phone-portrait use. Owns the `useState` + `matchMedia` switch.
- `Scoreboard.tsx` / `LineupPanel.tsx` / `TopBarControls.tsx` / `GameLogFooter.tsx` — Sub-components extracted from GameBoard. Each takes a `layout?: 'svg' | 'html'` prop (default `'svg'`). SVG mode emits `<g>`/`<text>`/etc. inside the parent board SVG; HTML mode emits semantic markup styled by `gameBoardMobile.css`. Both modes share helpers like `LineupPanel.buildIconItems` so used/unused icon logic lives in one place.
- `Diamond.tsx` — Decorative field paths + base/mound/home `CardSlot`s + runner-speed labels + pitcher IP/fatigue indicator. Always SVG. Exports `BASE_COORDS` so runner-animation overlays in GameBoard reference the same geometry. On mobile it's wrapped in its own `<svg viewBox="385 215 510 545">` (tightened to the bases + card-slot bounding box) and lives in a flex row alongside a vertical sidebar.
- `gameBoardLayout.ts` — Shared SVG layout constants (PW, DX, DW, HX, MAIN_TOP, MAIN_BOT, BOT_Y, etc).
- `gameBoardMobile.css` — All mobile-mode styles. Classes prefixed `gb-m-` so they're easy to grep/delete as a group. Only applied when `layout="html"` is active in the corresponding component (or for the mobile-only sidebar / action / dice / scoreboard rules).
- `GamePage.tsx` — WebSocket connection handler with reconnection logic (exponential backoff, max 10 attempts). Sends typed `GameAction` to server, receives `GameState` broadcasts. Blocks actions during opponent disconnect. Saves stats on game over.
- `DiceSpinner.tsx` — d20 number spinner with dual SVG/HTML modes via `layout?: 'svg' | 'html'`. SVG mode (default, desktop) renders inside the parent board SVG with hex die + linear equation + advantage bar. HTML mode (mobile) renders a compact flex row: round die badge + (optional) pitch equation + dual-roll layout when both rolls present + advantage stripe. Spin animation logic (`triggerKey`, `setInterval` number flip, `SPIN_DURATION` / `SETTLE_PAUSE`) and sound calls are shared between modes.
- `ActionButtons.tsx` — Phase-specific action buttons with full math breakdowns. Dual SVG/HTML modes via `layout?: 'svg' | 'html'`. SVG mode (desktop) renders inside the parent board SVG with hardcoded x/y. HTML mode (mobile) emits native `<button>` elements via a `<MobileBtn>` helper and a phase switch covering every game phase the SVG branch handles (sp_roll, pre_atbat, defense_sub, ibb_decision, bunt_decision, pitch, swing, result_icons, extra_base_offer, gb_decision, steal_*, extra_base + opponent waiting messages + game-over card). HTML container uses `flex-wrap: wrap` so 4+ buttons reflow rather than crop.
- `BoxScore.tsx` — Full baseball-reference batting/pitching stats (AVG, OBP, SLG, OPS, ERA, WHIP).
- `BullpenPanel.tsx` — Bullpen/bench expansion panel with starting rotation display.
- `CardSlot.tsx` — Card image slots for field positions.
- `GameLogOverlay.tsx` — Scrollable game log overlay.

**Mobile target:** iOS Home Screen shortcut (Safari standalone), portrait. Breakpoint is `(max-width: 899px)`.

**Mobile structural layout** (top to bottom; the strips, diamond row, and bottom action bar do NOT shift when phase / dice content changes):
1. Scoreboard (HTML table; TEAM column 76px with `…` truncation, R col 22px, inning cols 20px each via `width: auto` table sizing — explicit pixel widths, not percentages, so the table actually shrinks. OUTS is stacked label-above-value `OUTS / N`, menu button (☰) sits in the top-right of the same row via `grid-template-columns: 1fr auto auto` — opens a popup with BOX SCORE / GAME LOG / DICE ROLLS / EXIT GAME, and a small × in the popup's corner. The desktop top bar (`TopBarControls`) is not rendered on mobile.
2. Opponent strip (9 batter cells full-width, batting order)
3. **Diamond row** — flex row containing the diamond SVG and a 2-column × 3-row grid on the right:
   - Diamond viewBox `360 145 545 620` (cropped to remove the empty grass area to the right of B1/B2; bases retain ~7px clearance from the new viewBox right edge). Wrapped in `.gb-m-diamond-svg-wrap` div with `aspect-ratio: 545/620` + `align-self: flex-start` — `aspect-ratio` is reliable on a regular div in iOS Safari (it's not on an SVG flex item), and `flex-start` prevents the row's stretch from triggering preserveAspectRatio letterboxing.
   - **`.gb-m-side`** (`flex: 0 0 calc(3.5 * (100vw - 12px) / 9)` — 3.5 × strip-cell width, ~148px on a 393vw viewport). Three rows:
     - **Top row** (`.gb-m-side-top`, `flex: 1 1 0`): two cells — `.gb-m-sb-roll` (opponent's most recent roll, left) | `.gb-m-side-pcol` (BENCH/PEN button + opp pitcher card stacked, right). The pcol is pinned at 1 strip-cell so the pitcher card image equals a hitter strip card.
     - **Middle row** (`.gb-m-sb-result`, `flex: 0 0 auto`): pitch/swing advantage indicator. Spans both columns of `.gb-m-side`. Tints green when the result favors me, red when it doesn't (`pitcherAdv === !iAmBatting`).
     - **Bottom row** (`.gb-m-side-bot`): mirror of top row — my roll on the left, my pitcher column on the right.
   - **Per-side roll routing** (`oppRoll` / `myRoll` `useState` in GameBoard.tsx): `state.lastRollType` + `state.halfInning` decides which side the latest roll belongs to. `pitch` / `fielding` / `extra_base` / `steal_*` go to the fielding team; `swing` / `bunt` go to the batting team. Each side's box persists until that side rolls again — opp's pitch stays visible while I'm swinging.
   - **`MobileRollBox`** component (defined inline in GameBoard.tsx) handles its own spin animation — 600ms flicker through random d20 values before settling on the real value, then calls `onSpinComplete` (= `handleDiceComplete`) so the parent's `diceAnimating` flag clears (the role the SVG-mode `DiceSpinner` plays on desktop).
   - **Pitcher card `.active` indicator**: gold-tinted background (`#2a1f0c`) on whichever pitcher is currently fielding. The other pitcher has transparent bg so the sidebar's navy shows through. Both cards have a solid gold accent line (`border-bottom` on the top pitcher pointing into the result row, `border-top` on the bottom pitcher pointing up to the result row).
4. My strip (9 batter cells)
5. **Bottom action bar** (`.gb-m-action-bar`) — full-width, fixed `height: 150px`, buttons-only. The DiceSpinner has been removed from the mobile bottom bar (rolls now live in the sidebar boxes); only `ActionButtons` renders here. Phase content scrolls inside the bar if it exceeds 150px.

Series info (`Game N/M — opp X–Y me`) lives at the top of the menu sheet popup (`.gb-m-menu-series`), not in the sidebar middle. The sidebar middle is now the result indicator.

The `DiceSpinner` HTML-mode render is still defined but unused on mobile; the SVG-mode render is what desktop uses, untouched.

Modals (`SubstitutionModal`, `DefenseSetupModal`, `CardTooltip`, `BoxScore` overlay, `GameLogOverlay`, `DiceRollsOverlay`, mobile menu sheet) all stay `position: fixed` full-viewport on both desktop and mobile, with `@media (max-width: 899px)` rules that tighten panel widths / fonts / grid columns so they fit a portrait phone. The shared `.overlay-panel` wrapper (BoxScore + GameLogOverlay + DiceRollsOverlay) is `display: flex; flex-direction: column; overflow: hidden` so the `.overlay-panel-header` (with CLOSE button) stays put while only the new `.overlay-panel-body` div scrolls. On mobile, `.overlay-close` and `.sm-close` become × icons via `font-size: 0` + `::before content: '✕'`. `BullpenPanel` was restructured into header (with × close) + scrolling `.bp-body`. `DefenseSetupModal` keeps no close (forced action) but `.ae-actions` (the ACCEPT button row) is `position: sticky; bottom: 0` on mobile so ACCEPT is always reachable. `CardTooltip` is centered with a tap backdrop + × close on mobile (was bottom-sheet, hover-only — broken on touch).

## Card Images (`cards/`)

1,390 total images across 12 directories:
- `2004-Base/` (348), `2004-Pennant-Run/` (125), `2004-Trading-Deadline/` (125), `2004-Promos/` (70)
- `2004-Strategy/` (50), `2004-Pennant-Run-Strategy/` (25), `2004-Trading-Deadline-Strategy/` (25)
- `2005-Base/` (348), `2005-Trading-Deadline/` (175), `2005-Promos/` (24)
- `2005-Strategy/` (50), `2005-Trading-Deadline-Strategy/` (25)

Images are 251x350px JPEGs from TCDB. Referenced via `imagePath` field on each card in the JSON files.

## Deployment

- GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys on push to main
- Builds the game with Vite, copies simulation data + card images, deploys to GitHub Pages
- Vite base path: `/ShowdownSim/`
- Live at: `https://mark0552.github.io/ShowdownSim/`

## Known Issues / TODO

- Strategy cards have data + images but are not used in the game yet (Expert rules use them)
- Server rolls all dice (away player can't verify) — fine for casual play
- R and RY icons exist on some cards but are not implemented (informational only — Rookie/Rookie Year)
- Icons `K` on hitters — K icon is currently only checked on the pitcher; if hitters can also have K, that needs review
- Game password validation is client-side only (functional for casual play, not cryptographically secure)
- Position parsing uses regex that handles: `1B+1`, `LF-RF+2`, `OF+0`, `IF+1`, `C+9, 1B+0`, `DH`, etc.
- `parseRange()` handles bad data like `"3-0"` (high < low) by treating as single number

## Desired Features

- **Sound effects** — dice rolling, bat crack on hits, crowd roar on HRs, umpire calls on strikeouts/steals, "your turn" chime, victory/loss fanfare. Use Web Audio API or `new Audio()` with MP3s in `game/public/sounds/`. Hook into DiceSpinner (spin start/settle), GameBoard (outcome changes), GamePage (turn changes).
- **Base runner animations** — cards visually slide along base paths when runners advance. Currently cards teleport to new positions after dice animation completes. Implementation: animate the CardSlot x/y positions using CSS transitions or SVG `<animateTransform>` when `displayBases` changes. Track previous base positions in a ref, compute the path (e.g., 1st→2nd→3rd→home along the diamond), and interpolate over ~500ms. The delayed display state (`frozenRef`) already provides the before/after snapshots needed.
- **Expert rules (Strategy cards)** — 175 strategy cards already have data + images scraped. Would add a strategy card hand, play timing rules, and card effects to the game engine. Major feature requiring new server phases and UI for card selection.

## Rule Clarifications (do NOT "fix" these)

These are user-confirmed interpretations of MLB Showdown Advanced rules and house rules. Past sessions have tried to "fix" them as bugs — don't.

- **Pitch chart selection:** pitch total (d20 + control) must be **strictly greater than** (`>`, not `>=`) batter onBase to use the pitcher's chart. Current `>` operator is correct.
- **S+ (Single Plus):** regular single advancement + batter auto-steals 2nd. Other runners do NOT get an extra base — they advance the same as on a regular single.
- **GB hold/force-home placing batter on base:** by design. Defensive options (DP roll, force home, hold) represent different fielding plays. The batter out is already counted; this gives the defensive user strategic options.
- **20 icon:** +3 to a single pitch roll, once per half-inning. No pitcher has both 20 and RP, so the combo edge case is moot.
- **RP icon:** +3 control for the current pitcher for the remainder of the inning. Team-scoped, not game-level.
- **K icon:** pitchers only. Hitters don't have K icons.
- **Steal third:** catcher gets +5 bonus when throwing to 3rd. Intended.
- **V after K:** V (Veteran) **CANNOT** reroll a K-induced strikeout. The K conversion is final. Matches community/tournament ruling, prevents infinite reroll loops. If you re-encounter the K handler in `server/engine/phases/resultIcons.js`, do NOT re-add a V prompt after K.
- **Extra base attempts:** +5 bonuses (going home, 2 outs) go on the **runner target** (making them harder to throw out), not on the defense roll. Defense must BEAT (`>`) the target; ties go to the runner. See `server/engine/phases/extrabase.js` — `targetWithBonuses = speed + 5 + (2outs ? 5 : 0)`.
- **GB Double Play:** the DP roll is vs **batter speed**, not the lead forced runner. Runner on 1st is out automatically (no roll); the d20 + IF roll determines whether the batter is thrown out at 1st.
- **GB Hold Runners:** a real roll — d20 + IF vs `round((batter speed + lead runner speed) / 2)`. Lead runner = furthest along (3rd > 2nd > 1st priority).
- **Runner animation attribution (`computeRunnerMovements`):** iterate **lead runner first** (third → second → first) when assigning who scored. Runners can't pass each other in baseball, so the furthest-along missing runner is always the scorer. Iterating first-to-third misattributes DP-failed bases-loaded scenarios.

## Usernames vs Emails

The app uses **usernames**, not emails. Auth uses a synthetic email (`username@showdown.game`) under the hood, but users only see and think in terms of usernames. `getUsername(user)` strips the `@showdown.game` suffix.

- `home_user_email` and `away_user_email` columns on the `games` and `series` tables are **misnamed** — they actually store usernames (populated via `getUsername(user)`). When reading them for display, treat as a username.
- Do **not** say "email" in any UI label, toast, error, or comment a user might read. Use "username".
- Renaming the DB columns is a bigger migration; leave the schema alone unless explicitly asked. New code should use `username`-style variable names so the intent is clear.
- `series.home_user_email` / `away_user_email` can stay null even after the opponent joins (only the `games` row gets updated on join). For series-level username display, fall back to scanning child game rows for a non-null value.

## Lineup Strategy Notes (for design discussions)

These were validated against the actual card data via `simulation/*.json`. When discussing balance or build strategy, defer to these and verify with the simulator if challenged.

- **Optimal team construction is heavy on elite SPs.** 4 elite SPs (500+ pts, control 5-6, IP 7-8, CY + 20 icons) + 0 bullpen + ~280-pt average hitters + cheap bench is the canonical optimal build at the 5000-pt cap. Example rotation: Santana '05 (640) + Ford '04 CC (600) + Palmer '04 CC (610) + Halladay '04 (500) = 2350.
- **Why no bullpen:** elite SPs with CY refunds (every 1-2-3 inning extends IP by 1) routinely go 9 with high control. Bullpen is mostly insurance against tail risk that's already minimised by the rotation quality.
- **Why not "balanced":** going from 4-elite to 2-elite + 2-mid + bullpen only frees ~160 pts for hitting (the bullpen cost eats most of the SP-downgrade savings). 160 pts buys a single ~+1 onBase upgrade. The cost is ~3.5 starts of batting-practice innings vs control-3 SPs that fatigue at IP 6. Trade is decisively bad.
- **OnBase ≠ OPS.** Walks contribute only to OBP; chart-density of singles/doubles/HRs drives SLG. A "walk-machine" OB-13 hitter can have lower OPS than an OB-12 hitter with denser hit ranges. **For lineup-order calls, trust the simulator OPS over my OB-based heuristics.**
- **Hitter onBase distribution (median pts):** OB 9 = 110, OB 10 = 210, OB 11 = 320, OB 12 = 390, OB 13 = 480, OB 14 = 610. Source: `node` against `simulation/hitters.json`.

## Recently Completed

- **Mobile sidebar redesign — rolls/result column + cropped diamond (May 2026)** — Right side of the diamond row is now a 2-column × 3-row grid (`.gb-m-side`, ~3.5 strip-cells wide). Roll boxes (left half) replace the bottom DiceSpinner; result indicator (middle row, spans both columns) shows PITCHER ADV / BATTER ADV in user-perspective green/red. Per-side roll routing in GameBoard.tsx — `state.lastRollType` + `halfInning` decides which side's box updates. Diamond viewBox cropped from `360 145 680 620` → `360 145 545 620` to remove the empty grass area to the right of B1/B2 (no SidebarPitcher shrinkage; bases stay roughly the same on-screen size). Bottom action bar simplified to buttons-only, fixed 150px height. Series info moved from sidebar middle to the menu sheet's header (`.gb-m-menu-series`).
- **Modal mobile UX pass (May 2026)** — All in-game popups optimized for portrait phones with always-visible close buttons. `.overlay-panel` (BoxScore + GameLog + DiceRolls) restructured to flex column + sticky header + scrollable `.overlay-panel-body`. CardTooltip rewritten for touch — centered (was bottom-sheet), tap backdrop, × in corner, `pointer-events: auto`. BullpenPanel restructured with sticky header + × close + `.bp-body` scroll container. SubstitutionModal already had a sticky header; mobile CLOSE text replaced with × icon via `font-size: 0` + `::before '✕'`. DefenseSetupModal has no close (forced action), but `.ae-actions` becomes `position: sticky; bottom: 0` on mobile so the ACCEPT button is always reachable. Mobile menu sheet got an × in the corner alongside tap-outside-to-dismiss.
- **Mobile portrait layout for GameBoard (April 2026)** — `GameBoard.tsx` branches on `(max-width: 899px)` to render a stacked HTML/grid layout instead of the 1400×950 SVG. Sub-components (Scoreboard, LineupPanel, TopBarControls, GameLogFooter) each grew a `layout?: 'svg' | 'html'` prop; Diamond was extracted into its own component with the original SVG coordinate system, wrapped in a cropped-viewBox `<svg>` on mobile. Desktop rendering is unchanged. ActionButtons/DiceSpinner stay SVG even on mobile (wrapped in their own scaled viewBox cells). Polish/tab UX still pending.
- **Draft mode (April 2026)** — full snake-draft alternative to picking lineups. 20 picks per side, constraint engine with bipartite matching + budget LB, dedicated DraftPage with FilterBar and hover tooltips, drag-drop set-lineup screen, server-authoritative validation. Drafted lineups preserved in `state.homeLineup` so series games 2+ inherit them. Migration: `supabase-migration-draft-mode.sql`.
- Reconnection handling: exponential backoff, opponent disconnect popup, action blocking during disconnect, player_joined broadcast on reconnect
- GameLog overlay rendered in GameBoard (toggle via top-right button)
- Box score with full batting/pitching stats (AVG, OBP, SLG, OPS, ERA, WHIP, W/L/SV)
- SVG d20 number spinner replacing 3D dice-box library (accurate rolls for both clients)
- Dice animation for all d20 rolls (pitch, swing, fielding/DP, extra base, steal, bunt)
- User-perspective colors throughout (green=good for me, red=bad)
- Live scoreboard with gold current-inning highlighting
- Card metadata in tooltips (team, year, edition, points, hand, card number)
- Stats saved to Supabase with card metadata in player names
