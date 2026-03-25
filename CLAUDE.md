# MLB Showdown — Project State

This document describes the exact current state of the application for Claude Code context.

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
- **Auth:** Email/password (emails are fake: `username@showdown.game`). No email confirmation.
- **Tables:**
  - `lineups` — id, user_id, name, data (JSONB), created_at, updated_at. RLS: users see only their own.
  - `games` — id, status, home/away user IDs and emails, lineup IDs/names, ready flags, state (JSONB), pending_action (JSONB for away player moves), winner. RLS: anyone can see waiting games, participants see their games, anyone can join a waiting game.
- **Realtime:** Enabled on `games` table for live updates.

### Page Flow
`LoginPage` → `MainMenu` → `LineupsPage` / `LobbyPage`
- From LineupsPage: New/Edit → `TeamBuilder` → save to Supabase → back to LineupsPage
- From LobbyPage: Create/Join → lineup select → both ready → `GamePage`

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

### Game Engine (`game/src/engine/`)
Pure state machine: `processAction(state: GameState, action: GameAction) => GameState`

**Modules:**
- `gameEngine.ts` — Main dispatcher + all action handlers. Manages full at-bat sequence, half-inning transitions, extra innings, walk-offs.
- `charts.ts` — Chart resolution ported from sim.js. `parseRange()`, `resolveHitterChart()`, `resolvePitcherChart()`, `resolvePitch()`.
- `baserunning.ts` — `advanceRunners()` handles all outcomes (W, S, SPlus, DB, TR, HR, SO, GB, FB, PU). `resolveDoublePlay()`, `resolveExtraBase()`.
- `icons.ts` — `getOffensiveIcons()`, `getDefensiveIcons()`, `getPrePitchOffenseIcons()`, `getDefensePrePitchIcons()`, `getPitchModifiers()`.
- `fatigue.ts` — `getFatiguePenalty()`, `canRemoveStarter()`.
- `substitutions.ts` — `getAvailablePinchHitters()`, `getAvailableRelievers()`, `applyPinchHit()`, `applyPitchingChange()`, `getTotalInfieldFielding()`, `getTotalOutfieldFielding()`.
- `dice.ts` — `rollD20()`.

**Phase flow:**
```
pre_atbat → defense_sub → [offense_pre if runners] → pitch → swing → result_pending
  ↓ (if icons)              ↓ (if no icons, auto-apply result)
  icon decisions → apply result → baserunning → [fielding_check] → [extra_base_decision] → next batter
  ↓ (3 outs)
  endHalfInning → switch sides or end game
```

**Key implementation details:**
- `shouldShowOffensePre()` — skips offense_pre when no runners (no bunt/steal options)
- After swing, auto-applies result if no icons available (no "Apply Result" button)
- After using S/HR/K icons, re-checks remaining icons before applying
- K icon only offered on hits (not walks or existing outs)
- `whoseTurn()` for result_pending checks which team has icons
- `endHalfInning()` advances batting team's batter index before switching sides
- `goldGloveBonus` stored on GameState, applied to DP and extra base rolls, reset per at-bat
- Sac bunt: `SAC_BUNT_ROLL` rolls on pitcher chart, PU = out + runners stay, else = out + runners advance 1

**Multiplayer sync (`gameSync.ts`):**
- Home team is "host" — runs engine locally, writes state to Supabase.
- Away team reads state via polling (3s) + Realtime subscription.
- Away submits actions via `pending_action` JSONB column. Host reads, processes, clears.
- Both lineups stored as `homeLineup`/`awayLineup` in `state` JSONB during lineup selection (avoids cross-user RLS issues).

### Game UI Components
- `Diamond.tsx` — SVG baseball diamond with colored bases, runner names, outs display.
- `Scoreboard.tsx` — Line score table by inning with R totals.
- `AtBatPanel.tsx` — Pitcher and batter card images, stats, roll results, outcome display.
- `ActionBar.tsx` — Context-sensitive buttons based on current phase and whose turn.
- `GameLog.tsx` — Scrolling play-by-play with inning breaks and color coding.

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

- Game multiplayer is "Under Construction" — engine works but needs more testing and polish
- Strategy cards have data + images but are not used in the game yet (Advanced rules don't use them — Expert rules do)
- Host rolls all dice (away player can't verify) — fine for casual play
- Polling-based sync (3s interval) — Realtime subscription exists as primary but polling is fallback
- No reconnection handling if a player disconnects mid-game
- Position parsing uses regex that handles: `1B+1`, `LF-RF+2`, `OF+0`, `IF+1`, `C+9, 1B+0`, `DH`, etc.
- `parseRange()` handles bad data like `"3-0"` (high < low) by treating as single number
