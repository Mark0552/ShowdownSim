# MLB Showdown

A digital recreation of the **MLB Showdown** trading card game (2004-2005), featuring a Monte Carlo simulator for card analysis and an interactive team builder for gameplay.

## Project Structure

```
MLB-Showdown/
├── simulation/          # Monte Carlo simulator
│   ├── sim.js           # Simulation engine
│   ├── config.js        # Default configuration
│   ├── test.js          # Test suite (32 tests)
│   ├── hitters.json     # 753 hitter cards (verified from showdowncards.com)
│   ├── pitchers.json    # 443 pitcher cards (verified from showdowncards.com)
│   └── package.json
├── game/                # React team builder & game UI
│   ├── src/
│   │   ├── components/  # Card catalog, roster panels, lineup bar
│   │   ├── data/        # Card loading, position parsing, filters
│   │   ├── logic/       # Team validation rules
│   │   ├── store/       # Team and drag state management
│   │   ├── types/       # TypeScript interfaces
│   │   └── pages/       # Team builder page
│   └── package.json
├── tools/               # Data collection scripts
│   ├── scrape_card_data.js   # Scrape card stats from showdowncards.com
│   └── scrape_images.js      # Download card images from TCDB
└── cards/               # Card images (not in git, 1,315 images)
```

## Quick Start

### Simulation

```bash
cd simulation
npm install
node sim.js
```

Runs 163 million at-bats (753 hitters x 443 pitchers x 500 each) and exports an interactive HTML report with sortable columns, per-column filters, stat tooltips, and card image hovers.

```bash
node sim.js --at-bats 1000     # Higher precision
node sim.js --output results.xlsx   # Excel output
node sim.js --help              # All options
```

### Team Builder

```bash
cd game
npm install
node scripts/setup-cards.cjs   # Link card images + data (run once)
npx vite                       # Start dev server
```

Opens a browser with the team builder where you can:

- **Browse** all 1,196 cards with search, filters (position, team, year, set, edition), and sorting
- **Drag and drop** cards from the catalog into roster slots
- **Build a 20-player roster**: 9 field positions, 4 starting pitchers, 7 flex (bullpen + bench)
- **Set batting order** by dragging cards in the lineup bar
- **Hover** any card to see full-size image with complete stats and chart
- **Save/Load** your lineup to the browser

Roster rules: 5,000 point salary cap, bench players cost 1/5 points.

## Card Data

**1,196 player cards** across 2004 and 2005:

| Year | Set | Editions | Cards |
|------|-----|----------|-------|
| 2004 | Base Set | UL, P | 398 |
| 2004 | Pennant Run | UL, CC | 125 |
| 2004 | Trading Deadline | UL, CC, SS | 125 |
| 2005 | Base Set | UL, P | 373 |
| 2005 | Trading Deadline | UL, CC | 175 |

Editions: UL (Unlimited), P (Promo), CC (Cooperstown Collection), SS (Super Season)

All card data scraped from [showdowncards.com](https://www.showdowncards.com). Card images downloaded from [TCDB](https://www.tcdb.com).

## How MLB Showdown Works

MLB Showdown is a card game where matchups are resolved with 20-sided dice:

1. **Pitcher rolls** d20 + Control vs hitter's On-Base number
2. If pitcher roll > On-Base: use the **pitcher's chart**
3. If pitcher roll <= On-Base: use the **hitter's chart**
4. **Hitter rolls** d20 on the active chart to determine the result

### Chart Results

| Result | Effect |
|--------|--------|
| SO | Strikeout (out) |
| GB | Ground ball (out, double play possible) |
| FB | Fly ball (out, runners can tag up) |
| PU | Popup (out, pitchers only) |
| W | Walk |
| S | Single (runners advance 1) |
| S+ | Single+ (auto-steal 2nd if open) |
| DB | Double (runners advance 2) |
| TR | Triple (all runners score) |
| HR | Home run (everyone scores) |

### Icons

**Hitter Icons** (reset per game):
- **V** (Vision): Reroll outs on hitter's chart (2x/game)
- **S** (Speed): Upgrade single to double (1x/game)
- **HR** (Power): Upgrade double/triple to HR (1x/game)
- **SB** (Stolen Base): Steal without a throw (1x/game)
- **G** (Gold Glove): +10 fielding on defense (1x/game)

**Pitcher Icons** (reset per inning/game):
- **K**: Block one HR per 9 innings (converts to strikeout)
- **20**: +3 control for one pitch per inning
- **RP**: +3 control for one full inning after the 6th
- **CY** (Cy Young): +1 IP on 1-2-3 innings

### Team Construction

- **20 players**: 9 position players, 4 starters, 7 flex (relievers/closers/bench)
- **5,000 point salary cap**
- Bench players cost **1/5** of their point value
- Must fill all field positions: C, 1B, 2B, 3B, SS, LF-RF (x2), CF, DH

## Simulation Output

The simulator exports an HTML report with:

- **Hitter stats**: AVG, OBP, SLG, OPS, wOBA, ISO, BABIP, K%, BB%, HR%, GB/FB
- **Pitcher stats**: WHIP, mWHIP, Opp AVG, Opp OPS, K%, BB%, K/BB, HR/9, GB%
- **Value ratings**: 0-100 scale based on regression deviation from expected performance at point cost
- **Icon impact**: Estimated stat boosts from V, S, HR icons; K/20/RP advantage swings
- **Raw counts**: Every outcome tracked (PA, H, 1B, 2B, 3B, HR, BB, SO, GB, FB, PU)
- **Per-column filters**: Text search and min/max ranges on every column
- **Card image hover**: Full card with stats on player name hover

## Tools

### scrape_card_data.js

Scrapes all card stats from showdowncards.com using Puppeteer stealth. Queries every year/expansion combination and parses the HTML table results.

```bash
cd tools
node scrape_card_data.js           # All 2004 + 2005
node scrape_card_data.js --year 04 # Just 2004
```

### scrape_images.js

Downloads card front images from TCDB for all sets. Uses Puppeteer stealth with in-page fetch to bypass Cloudflare.

```bash
cd tools
node scrape_images.js              # All sets
node scrape_images.js --set 8137   # Just 2004 Base
node scrape_images.js --list-only  # Preview without downloading
```

Images are saved to `cards/` (gitignored, ~34MB total).
