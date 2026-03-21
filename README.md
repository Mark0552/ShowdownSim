# ShowdownSim

Monte Carlo simulator for the **MLB Showdown** card game. Runs every hitter against every pitcher for hundreds of simulated at-bats, then exports a fully interactive HTML report with sortable columns, per-column filters, rich hover tooltips, and value ratings based on regression analysis.

## Quick Start

```bash
npm install
node sim.js
```

Opens `results.html` in your browser when done.

## CLI Options

```
node sim.js [options]

--at-bats <n>      At-bats per hitter-pitcher matchup (default: 500)
--seed <string>     RNG seed for reproducibility (default: 'showdown-sim-2024')
--output <file>     Output filename (default: 'results.html')
--format <type>     Output format: 'html' or 'xlsx' (default: auto from extension)
--help              Show help
```

**Examples:**

```bash
node sim.js                                    # 500 ABs per matchup, HTML output
node sim.js --at-bats 1000                     # Higher precision (slower)
node sim.js --at-bats 100                      # Quick preview
node sim.js --output results.xlsx              # Excel output (auto-detects format)
node sim.js --seed my-seed-2025                # Different RNG seed
```

**npm scripts:**

```bash
npm start          # Default simulation
npm run sim:xlsx   # Excel output
npm test           # Run test suite (32 tests)
```

## What It Does

The simulator runs a full combinatorial matchup: every hitter faces every pitcher for N at-bats. With the default dataset (749 hitters, 436 pitchers), that's **326,564 matchups** and **163 million at-bats** at the default 500 per matchup.

For each at-bat, the sim rolls dice, resolves the chart, applies icon abilities, and tracks the outcome. After all matchups finish, it computes stats, runs regression analysis within position groups, and exports results.

The output is an interactive HTML page where you can:

- **Sort** any column by clicking its header
- **Filter** every column — text search for names/positions/icons, min/max ranges for all numeric stats
- **Hover** over any player name to see a rich tooltip with their full card: position, speed, hand, team, edition, chart ranges, and icon impact breakdown
- **Tab** between position groups (C, 1B, 2B, SS, etc.) for hitters, and Starters vs Relievers+Closers for pitchers
- **Clear filters** with one click per section

## How MLB Showdown Works

MLB Showdown is a card game where matchups are resolved with 20-sided dice:

1. **Pitcher rolls** d20 + Control vs hitter's On-Base number
2. If pitcher roll > On-Base: use the **pitcher's chart** for the outcome
3. If pitcher roll <= On-Base: use the **hitter's chart** for the outcome
4. **Hitter rolls** d20 and looks up the result on whichever chart is active

### Chart Fields

Each card has a chart mapping die roll ranges to outcomes:

| Field | Meaning | Example | Notes |
|-------|---------|---------|-------|
| SO | Strikeout | `1-3` | Out |
| GB | Groundball | `4-5` | Out |
| FB | Flyball | `6` | Out |
| PU | Popup | `1` | Out (pitchers only) |
| W | Walk | `7-8` | On base |
| S | Single | `9-14` | Hit |
| SPlus | Single+ | `15-17` | Hit, worth ~1.5 bases |
| DB | Double | `18-19` | Hit |
| TR | Triple | `20` | Hit |
| HR | Home Run | `21+` | Hit, all rolls >= threshold |

### Icons (Special Abilities)

Icons are special abilities that activate under specific conditions.

**Hitter Icons** (reset every 5 at-bats, i.e. once per "game"):

| Icon | Name | Effect |
|------|------|--------|
| V | Vision | Reroll outs when on hitter's chart (max 2 per game) |
| S | Speed | Upgrade single or single+ to double (once per game) |
| HR | Power | Upgrade double or triple to home run (once per game) |

**Pitcher Icons** (reset on inning/game boundaries):

| Icon | Name | Effect |
|------|------|--------|
| K | Strikeout | Block one home run per 9 innings (converts HR to strikeout) |
| 20 | +3 Control | Add +3 to the control roll once per inning (resets every 3 outs) |
| RP | Relief Ace | Add +3 to control for the first inning of each game (resets every 27 outs) |

## Output Stats

### Hitter Columns

**Card Info:**
| Column | Description |
|--------|-------------|
| Value | 0-100 rating based on combined OPS and wOBA regression deviation |
| Name | Player name, year, edition, card number, team |
| Pts | Card point cost for team building |
| OB | On-Base number (pitcher must beat this) |
| Spd | Speed rating |
| Pos | Position(s) with fielding bonus |
| Hand | Batting hand (L/R/S) |
| Icons | Icon abilities on the card |

**Core Stats:**
| Column | Description |
|--------|-------------|
| AVG | Batting average (H / AB) |
| OBP | On-base percentage ((H + BB) / PA) |
| SLG | Slugging percentage (Total Bases / AB) |
| OPS | On-base plus slugging (OBP + SLG) |
| wOBA | Weighted on-base average (uses linear weights) |

**Advanced Stats:**
| Column | Description |
|--------|-------------|
| ISO | Isolated power (SLG - AVG), pure extra-base power |
| BABIP | Batting average on balls in play |
| K% | Strikeout rate (SO / PA) |
| BB% | Walk rate (BB / PA) |
| HR% | Home run rate (HR / AB) |
| GB/FB | Ground ball to fly ball ratio |

**Regression & Percentiles:**
| Column | Description |
|--------|-------------|
| OPS% | OPS percentile within position group (0-100) |
| wOBA% | wOBA percentile within position group (0-100) |
| OPS Dev | OPS deviation from expected (linear regression vs points) |
| wOBA Dev | wOBA deviation from expected (green = overperformer, red = underperformer) |

**Raw Counts:**
PA, H, 1B, 1B+, 2B, 3B, HR, BB, SO, GB, FB, PU — every outcome tracked

**Icon Impact:**
| Column | Description |
|--------|-------------|
| V Used | Times the V icon triggered a reroll |
| S Used | Times the S icon upgraded a single to double |
| HR Used | Times the HR icon upgraded to home run |
| Icon SLG+ | Estimated SLG boost from S and HR icons |
| Icon wOBA+ | Estimated wOBA boost from all icons |

### Pitcher Columns

**Card Info:** Value, Name, Pts, Ctrl (Control), IP, Hand, Icons

**Core Stats:**
| Column | Description |
|--------|-------------|
| WHIP | Walks + hits per inning pitched |
| mWHIP | Modified WHIP using linear weights (penalizes extra-base hits more) |
| Opp AVG | Batting average against |
| Opp OPS | OPS against |

**Advanced Stats:**
| Column | Description |
|--------|-------------|
| K% | Strikeout rate |
| BB% | Walk rate |
| K/BB | Strikeout-to-walk ratio |
| HR/9 | Home runs per 9 innings |
| GB% | Ground ball percentage |

**Regression:** WHIP%, mWHIP%, WHIP Dev, mWHIP Dev

**Raw Counts:** BF, Outs, SO, BB, 1B, 1B+, 2B, 3B, HR, GB, FB, PU

**Icon Impact:** K HRs blocked, K SLG reduction, 20 advantage swings, RP advantage swings

### wOBA Weights

| Outcome | Weight |
|---------|--------|
| Walk | 0.69 |
| Single | 0.88 |
| Single+ | 1.08 |
| Double | 1.24 |
| Triple | 1.56 |
| Home Run | 1.95 |

### Value Rating

Each player gets a **Value** rating from 0 to 100 based on how they perform relative to their point cost:

1. Linear regression is run within each position group (OPS and wOBA vs Points for hitters, WHIP and mWHIP vs Points for pitchers)
2. Each player's deviation from the regression line is computed (positive = better than expected for their cost)
3. Deviations are converted to z-scores and combined into a single score
4. Mapped to a 0-100 scale centered at 50

A player with Value 65 is performing well above what their point cost predicts. A player with Value 35 is underperforming relative to their cost.

## Filtering

Every column in the HTML output is filterable:

- **Text columns** (Name, Position, Icons, Hand): type to search — matches anywhere in the cell, case-insensitive
- **Numeric columns** (everything else): min and max inputs — set either or both to filter a range

Filter examples:
- Name contains "Bonds" → see all Barry Bonds cards
- Icons contains "V" → find all hitters with the Vision icon
- OPS min 0.900 → only elite hitters
- Points max 200, Value min 60 → find underpriced value picks
- Hand = "L" → left-handed batters only

Each section (Hitters / Pitchers) has a **Clear Filters** button to reset.

## Player Data Format

Player data lives in `hitters.json` and `pitchers.json`.

### Hitter Schema

```json
{
  "Name": "Phil Rizzuto",
  "Team": "Yankees",
  "#": 121,
  "Ed": "CC",
  "Points": 440,
  "Yr.": "'04",
  "onBase": 11,
  "Speed": 18,
  "Position": "SS+4",
  "H": "R",
  "Icons": "V SB",
  "SO": "1-3",
  "GB": "4-5",
  "FB": "6",
  "W": "7-8",
  "S": "9-16",
  "SPlus": "17-19",
  "DB": "20",
  "TR": "21",
  "HR": "22+"
}
```

### Pitcher Schema

```json
{
  "Name": "Eric Gagne",
  "Team": "Dodgers",
  "#": 167,
  "Ed": "UL",
  "Points": 310,
  "Yr.": "'05",
  "Control": 6,
  "IP": 1,
  "Position": "Closer",
  "H": "R",
  "Icons": "RP",
  "PU": "1",
  "SO": "2-9",
  "GB": "10-14",
  "FB": "15-17",
  "W": "18",
  "S": "19-22",
  "DB": "23-25",
  "HR": "26+"
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| Points | Card cost for team building (higher = better card) |
| onBase | Hitter's on-base number (pitcher roll must beat this) |
| Control | Pitcher's control bonus added to their d20 roll |
| IP | Innings pitched capacity |
| Position | Fielding position(s); `+N` is the fielding bonus |
| Ed | Card edition (CC = Cooperstown Collection, UL = Ultimate Legends, P = Pennant, etc.) |
| Icons | Space-separated icon codes (V, S, HR, K, 20, RP, SB, etc.) |
| H | Batting/throwing hand (L = Left, R = Right, S = Switch) |

Range fields use three formats:
- `"1-3"` — rolls 1 through 3
- `"6"` — only roll 6
- `"22+"` — roll 22 and above (used for HR)

## Project Structure

```
sim.js          Main simulator — simulation engine, stats, HTML/XLSX export
config.js       Default configuration (at-bats, seed, weights)
test.js         Test suite (32 tests)
hitters.json    Hitter card data (749 players)
pitchers.json   Pitcher card data (436 players)
scrape_2003.js  Browser console script for scraping card data from showdowncards.com
package.json    Dependencies and npm scripts
```

## Configuration

Edit `config.js` to change default simulation parameters without touching the main code:

```js
const CONFIG = {
    AT_BATS_PER_MATCHUP: 500,    // More = higher precision, slower
    SEED: 'showdown-sim-2024',    // Change for different random outcomes
    OUTPUT: 'results.html',       // Default output file
    FORMAT: 'html',               // 'html' or 'xlsx'
    WEIGHTS: { ... }              // wOBA linear weights
};
```

CLI arguments override these defaults.

## Data Collection

Card data can be scraped from [showdowncards.com](https://www.showdowncards.com) using `scrape_2003.js`. See the instructions at the top of that file — it's a browser console script that extracts table data into JSON format.
