# MLB Showdown

A digital recreation of the **MLB Showdown** trading card game (2004-2005). Features a Monte Carlo simulator for card analysis, an interactive team builder, and a fully playable multiplayer game engine implementing the complete Advanced ruleset.

**Live App:** [https://mark0552.github.io/ShowdownSim/](https://mark0552.github.io/ShowdownSim/)

## Features

### Multiplayer Game
- Real-time 1v1 multiplayer via WebSocket server
- Full Advanced ruleset game engine (server-authoritative):
  - Pitch resolution (d20 + Control vs On-Base) with pitcher/hitter chart routing
  - Complete baserunning: singles, doubles, triples, HRs, walks, force advancement
  - Extra base attempts: offense sends runners, defense chooses who to throw at (d20 + OF fielding vs runner speed)
  - Double play attempts (d20 + IF fielding vs batter speed) with Gold Glove option
  - Fly ball tag-ups (d20 + OF fielding vs runner speed)
  - All 9 player icons as interactive decisions (V, S, HR, K, 20, RP, SB, G, CY)
  - Pitcher fatigue (IP tracking with CY bonus), substitutions, sacrifice bunts, intentional walks
  - 9 innings + extra innings, walk-off detection
- SVG d20 number spinner with accurate roll display for both clients
- Dice animation for all d20 rolls (pitch, swing, fielding, steal, bunt)
- Side-by-side pitch + swing display with linear equation breakdown
- User-perspective color coding (green = good for you, red = bad)
- Pitcher/Hitter advantage indicator
- Action buttons with full numerical breakdowns (fielding values, speed, bonuses)
- Phase-specific waiting messages ("Pitcher rolling...", "Batter swinging...", etc.)
- Live scoreboard with gold current-inning highlighting
- Full box score with batting stats (AVG, OBP, SLG, OPS) and pitching stats (ERA, WHIP, W/L/SV)
- Game log overlay
- Card tooltips with full metadata (team, year, edition, points, card number, chart)
- Reconnection handling with exponential backoff, disconnect detection, action blocking
- Game stats saved to Supabase with card metadata for career tracking
- Password-protected games

### Team Builder
- Browse all 1,196 player cards with search, filters (position, team, year, set, edition), and sorting
- Drag and drop cards into roster slots with eligible slot highlighting
- 20-player rosters: 9 field positions (C, 1B, 2B, 3B, SS, LF-RF x2, CF, DH), 4 starting pitchers, 7 flex (bullpen + bench)
- 5,000 point salary cap with bench players at 1/5 cost
- Drag to reorder batting order and starting rotation
- Hover any card to see full-size image with complete stats and chart
- Save/load multiple lineups per account

### Stats & History
- Career batting and pitching stats aggregated across all games
- Game history with results, opponents, and lineup details
- Player names include card metadata (year, edition, card number)

### Simulation
- Monte Carlo simulator: every hitter vs every pitcher for N at-bats
- Icons ON / Icons OFF comparison in the same report
- Interactive HTML output with sortable columns, per-column filters, card image hovers
- Stat tooltips with formulas on every column header

### User Accounts
- Username/password authentication via Supabase
- Multiple saved lineups per account
- Persistent across sessions

## Project Structure

```
ShowdownSim/
+-- simulation/              # Monte Carlo simulator (standalone Node.js)
|   +-- sim.js               # Simulation engine (icons on/off)
|   +-- config.js            # Default configuration
|   +-- test.js              # Test suite (32 tests)
|   +-- hitters.json         # 753 hitter cards
|   +-- pitchers.json        # 443 pitcher cards
|   +-- strategy_cards.json  # 175 strategy cards
+-- game/                    # React/TypeScript web app (Vite)
|   +-- src/
|   |   +-- engine/          # Client-side types + helpers (gameEngine.ts)
|   |   +-- components/
|   |   |   +-- cards/       # Card display, tooltips
|   |   |   +-- catalog/     # Card catalog, filters
|   |   |   +-- roster/      # Lineup bar, bench, batting order
|   |   |   +-- game/        # GameBoard, ActionButtons, DiceSpinner,
|   |   |                    # BoxScore, BullpenPanel, CardSlot, GameLogOverlay
|   |   +-- pages/           # Login, MainMenu, Lineups, Lobby, TeamBuilder, Game, Stats
|   |   +-- lib/             # Supabase client, auth, lineups, games, stats
|   |   +-- store/           # Team store, drag store
|   |   +-- types/           # TypeScript interfaces (cards, team, game)
|   |   +-- data/            # Card loading, position parsing, filters
|   +-- supabase-*.sql       # Database schema files
+-- server/                  # WebSocket game server (Node.js + Express)
|   +-- index.js             # WebSocket server, room management, action dispatch
|   +-- engine/
|   |   +-- init.js          # Game initialization, starting pitcher selection
|   |   +-- dice.js          # d20 roll, roll sequence tracking
|   |   +-- icons.js         # Icon usage tracking and validation
|   |   +-- fielding.js      # Fielding value extraction from positions
|   |   +-- stats.js         # Per-game batter/pitcher stat tracking
|   |   +-- phases/          # Phase handlers:
|   |       +-- pitch.js     # Pitch + swing resolution, chart routing
|   |       +-- baserunning.js # Runner advancement, half-inning transitions
|   |       +-- groundball.js  # GB decision, DP attempts, fielder's choice
|   |       +-- extrabase.js   # Extra base offers + throws
|   |       +-- steal.js       # Steal attempts, SB icon, catcher arm
|   |       +-- bunt.js        # Sacrifice bunt on pitcher chart
|   |       +-- ibb.js         # Intentional walks
+-- tools/                   # Data collection scripts (Puppeteer)
|   +-- scrape_card_data.js      # Scrape card stats from showdowncards.com
|   +-- scrape_images.js         # Download card images from TCDB
|   +-- scrape_strategy_cards.js # Scrape strategy card data
+-- cards/                   # Card images (1,390 total across 12 directories)
+-- .github/workflows/       # GitHub Actions deploy game to Pages
```

## Quick Start

### Game (web app)

```bash
cd game
npm install
node scripts/setup-cards.cjs   # Link card images + data (run once)
npx vite                       # Start dev server at localhost:5173
```

### Server (for multiplayer)

```bash
cd server
npm install
node index.js                  # Start WebSocket server at localhost:3001
```

### Simulation

```bash
cd simulation
npm install
node sim.js                    # Full sim with icons on/off comparison
node sim.js --at-bats 1000     # Higher precision
npm test                       # 32 tests
```

## Deployment

- **Game client:** Auto-deploys to GitHub Pages on push to main (`.github/workflows/deploy.yml`)
- **WebSocket server:** Deployed to Railway (`wss://showdownsim-production.up.railway.app`)
- **Database:** Supabase (auth, lineups, games, game_player_stats tables)

## Card Data

**1,196 player cards** across 2004-2005 (all verified from showdowncards.com):

| Year | Set | Editions | Cards |
|------|-----|----------|-------|
| 2004 | Base Set | UL, P | 398 |
| 2004 | Pennant Run | UL, CC | 125 |
| 2004 | Trading Deadline | UL, CC, SS | 125 |
| 2005 | Base Set | UL, P | 373 |
| 2005 | Trading Deadline | UL, CC | 175 |

**175 strategy cards** across all expansions with full text and images.

Editions: UL (Unlimited), P (Promo), CC (Cooperstown Collection), SS (Super Season)

## How MLB Showdown Works

1. **Pitcher rolls** d20 + Control vs hitter's On-Base number
2. If pitcher roll > On-Base: use pitcher's chart (pitcher advantage)
3. If tied or lower: use hitter's chart (hitter advantage)
4. **Hitter rolls** d20 on the active chart to determine the outcome

### Icons (Advanced Rules)

| Icon | Name | Effect |
|------|------|--------|
| V | Vision | Reroll outs on hitter's chart (2x/game) |
| S | Silver Slugger | Upgrade single to double (1x/game) |
| HR | Power | Upgrade double/triple to HR (1x/game) |
| K | Strikeout | Change any hit result to SO (1x/game) |
| 20 | +3 Control | +3 to pitch roll (1x/inning) |
| RP | Relief Ace | +3 control for 1 inning after 6th (1x/game) |
| SB | Stolen Base | Steal without throw (1x/game) |
| G | Gold Glove | +10 fielding on checks (1x/game) |
| CY | Cy Young | +1 effective IP on 1-2-3 innings |

### Team Construction
- 20 players: 9 position players, 4 starters, 7 flex (relievers/closers/bench)
- 5,000 point salary cap
- Bench players cost 1/5 of their point value

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Game Server:** Node.js + Express + WebSocket (ws)
- **Database:** Supabase (auth, PostgreSQL, real-time)
- **Client Hosting:** GitHub Pages (auto-deploy via GitHub Actions)
- **Server Hosting:** Railway
- **Simulation:** Node.js

## Planned Features

- **Sound effects** -- dice rolling, bat crack on hits, crowd roar on home runs, umpire calls, turn notifications
- **Base runner animations** -- cards slide along the base paths when runners advance instead of teleporting
- **Expert rules (Strategy cards)** -- 175 strategy cards already have data + images; would add hand management, play timing, and card effects to the game engine

## Database Setup

If setting up fresh, run these SQL files in the Supabase SQL Editor:
1. `game/supabase-setup.sql` -- lineups table
2. `game/supabase-game-tables.sql` -- games table + real-time
3. `game/supabase-stats.sql` -- game_player_stats table
