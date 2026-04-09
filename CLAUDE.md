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
- `GameBoard.tsx` — Primary SVG game board (1400x950). Bottom row: Actions (59%) | Dice (26%) | Result (16%). Shows scoreboard with live inning tracking, lineup panels (away/home), diamond with card slots, base runners with speed labels, action buttons for all phases with full numerical breakdowns, user-perspective color coding (green=my action, red=opponent), pitcher/hitter advantage indicator, player icon indicators. Handles all Advanced rule UI interactions.
- `GamePage.tsx` — WebSocket connection handler with reconnection logic (exponential backoff, max 10 attempts). Sends typed `GameAction` to server, receives `GameState` broadcasts. Blocks actions during opponent disconnect. Saves stats on game over.
- `DiceSpinner.tsx` — SVG d20 number spinner. Dual pitch+swing side-by-side layout after swing. Linear equation display for pitch modifiers. User-perspective colors. Advantage bar.
- `ActionButtons.tsx` — Phase-specific action buttons with full math breakdowns (fielding values, speed, bonuses). Phase-aware waiting messages.
- `BoxScore.tsx` — Full baseball-reference batting/pitching stats (AVG, OBP, SLG, OPS, ERA, WHIP).
- `BullpenPanel.tsx` — Bullpen/bench expansion panel with starting rotation display.
- `CardSlot.tsx` — Card image slots for field positions.
- `GameLogOverlay.tsx` — Scrollable game log overlay.

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

## Recently Completed

- Reconnection handling: exponential backoff, opponent disconnect popup, action blocking during disconnect, player_joined broadcast on reconnect
- GameLog overlay rendered in GameBoard (toggle via top-right button)
- Box score with full batting/pitching stats (AVG, OBP, SLG, OPS, ERA, WHIP, W/L/SV)
- SVG d20 number spinner replacing 3D dice-box library (accurate rolls for both clients)
- Dice animation for all d20 rolls (pitch, swing, fielding/DP, extra base, steal, bunt)
- User-perspective colors throughout (green=good for me, red=bad)
- Live scoreboard with gold current-inning highlighting
- Card metadata in tooltips (team, year, edition, points, hand, card number)
- Stats saved to Supabase with card metadata in player names
