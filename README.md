# MLB Showdown

A digital recreation of the **MLB Showdown** trading card game (2004-2005). Features a Monte Carlo simulator for card analysis, an interactive team builder, and a multiplayer game engine with the full Advanced ruleset.

**Live App:** [https://mark0552.github.io/ShowdownSim/](https://mark0552.github.io/ShowdownSim/)

## Features

### Team Builder
- Browse all 1,196 player cards with search, filters (position, team, year, set, edition), and sorting
- Drag and drop cards into roster slots — eligible slots highlight when dragging
- 20-player rosters: 9 field positions (C, 1B, 2B, 3B, SS, LF-RF x2, CF, DH), 4 starting pitchers, 7 flex (bullpen + bench)
- 5,000 point salary cap with bench players at 1/5 cost
- Drag to reorder batting order and starting rotation
- Hover any card to see full-size image with complete stats and chart
- Save/load multiple lineups per account via Supabase

### Multiplayer Game (Under Construction)
- Game lobby with real-time list of open games
- Create or join games, select from saved lineups
- Full Advanced ruleset game engine:
  - Pitch resolution (d20 + Control vs On-Base)
  - Complete baserunning (singles, doubles, triples, HRs, walks, force advancement, extra base attempts)
  - Double play attempts (d20 + infield fielding vs batter speed)
  - Fly ball tag-ups (d20 + outfield fielding vs runner speed)
  - All 9 player icons as interactive decisions (V, S, HR, K, 20, RP, SB, G, CY)
  - Pitcher fatigue, substitutions, sacrifice bunts, intentional walks
  - 9 innings + extra innings, walk-off detection
- Host-authoritative via Supabase Realtime

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
├── simulation/              # Monte Carlo simulator
│   ├── sim.js               # Simulation engine (icons on/off)
│   ├── config.js            # Default configuration
│   ├── test.js              # Test suite (32 tests)
│   ├── hitters.json         # 753 hitter cards
│   ├── pitchers.json        # 443 pitcher cards
│   └── strategy_cards.json  # 175 strategy cards
├── game/                    # React/TypeScript web app
│   ├── src/
│   │   ├── engine/          # Game engine (state machine)
│   │   │   ├── gameEngine.ts    # Main engine + action dispatch
│   │   │   ├── charts.ts       # Chart resolution (from sim.js)
│   │   │   ├── baserunning.ts  # Runner advancement, DP, tag-ups
│   │   │   ├── icons.ts        # All 9 icon types
│   │   │   ├── fatigue.ts      # IP tracking, pitch penalties
│   │   │   ├── substitutions.ts # Pinch hitters, pitching changes
│   │   │   └── dice.ts         # d20 roll
│   │   ├── components/
│   │   │   ├── cards/       # Card display, tooltips
│   │   │   ├── catalog/     # Card catalog, filters
│   │   │   ├── roster/      # Lineup, bench, bullpen panels
│   │   │   └── game/        # Diamond, scoreboard, action bar, game log
│   │   ├── pages/           # Login, main menu, lineups, lobby, team builder, game
│   │   ├── lib/             # Supabase client, auth, lineups, games, game sync
│   │   ├── store/           # Team store, drag store
│   │   ├── types/           # TypeScript interfaces
│   │   └── data/            # Card loading, position parsing, filters
│   └── supabase-*.sql       # Database schema files
├── tools/                   # Data collection scripts
│   ├── scrape_card_data.js      # Scrape card stats from showdowncards.com
│   ├── scrape_images.js         # Download card images from TCDB
│   └── scrape_strategy_cards.js # Scrape strategy card data
├── cards/                   # Card images (1,390 total)
└── .github/workflows/       # GitHub Actions deploy to Pages
```

## Quick Start

### Team Builder / Game (web app)

```bash
cd game
npm install
node scripts/setup-cards.cjs   # Link card images + data (run once)
npx vite                       # Start dev server
```

### Simulation

```bash
cd simulation
npm install
node sim.js                    # Full sim with icons on/off comparison
node sim.js --at-bats 1000     # Higher precision
npm test                       # 32 tests
```

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
2. If pitcher roll > On-Base → use pitcher's chart
3. If tied or lower → use hitter's chart
4. **Hitter rolls** d20 on the active chart

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
| CY | Cy Young | +1 IP on 1-2-3 innings |

### Team Construction
- 20 players: 9 position players, 4 starters, 7 flex (relievers/closers/bench)
- 5,000 point salary cap
- Bench players cost 1/5 of their point value

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Supabase (auth, database, real-time)
- **Hosting:** GitHub Pages (auto-deploy via GitHub Actions)
- **Simulation:** Node.js

## Database Setup

If setting up fresh, run these SQL files in the Supabase SQL Editor:
1. `game/supabase-setup.sql` — lineups table
2. `game/supabase-game-tables.sql` — games table + real-time
