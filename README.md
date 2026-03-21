# ShowdownSim

Monte Carlo simulator for the **MLB Showdown** card game. Pits every hitter against every pitcher for N simulated at-bats, then exports stats with regression analysis and value ratings.

## Setup

```
npm install
node sim.js
```

## CLI Options

```
node sim.js [options]

--at-bats <n>      At-bats per matchup (default: 500)
--seed <string>     RNG seed for reproducibility (default: 'showdown-sim-2024')
--output <file>     Output filename (default: 'results.html')
--format <type>     Output format: 'html' or 'xlsx' (default: based on extension)
--help              Show help
```

Examples:
```bash
node sim.js                                    # Default: 500 ABs, HTML output
node sim.js --at-bats 1000                     # More at-bats for higher precision
node sim.js --output results.xlsx              # Excel output (auto-detects format)
node sim.js --format xlsx --output my_data.xlsx
node sim.js --seed my-custom-seed              # Different RNG seed
```

Or use npm scripts:
```bash
npm start          # Default simulation
npm run sim:xlsx   # Excel output
npm test           # Run tests
```

## How It Works

### Game Mechanics

MLB Showdown is a card game where matchups are resolved with 20-sided dice:

1. **Pitcher rolls** d20 + Control vs hitter's On-Base number
2. If pitcher roll > On-Base: use **pitcher's chart** for the outcome
3. If pitcher roll <= On-Base: use **hitter's chart** for the outcome
4. **Hitter rolls** d20 to determine the result on whichever chart is active

### Chart Fields

Each player card has a chart mapping die roll ranges to outcomes:

| Field | Meaning | Example |
|-------|---------|---------|
| SO | Strikeout | `1-3` |
| GB | Groundball (out) | `4-5` |
| FB | Flyball (out) | `6` |
| PU | Popup (out, pitchers only) | `1` |
| W | Walk | `7-8` |
| S | Single | `9-14` |
| SPlus | Single+ (1.5 bases) | `15-17` |
| DB | Double | `18-19` |
| TR | Triple | `20` |
| HR | Home Run | `21+` |

### Icons (Special Abilities)

Icons are special abilities on cards that activate under certain conditions:

**Hitter Icons** (reset every 5 at-bats / "game"):
- **V** (Vision): Reroll outs on hitter's chart (max 2 per game)
- **S** (Speed): Upgrade single/single+ to double (once per game)
- **HR** (Power): Upgrade double/triple to home run (once per game)

**Pitcher Icons** (reset on inning/game boundaries):
- **K** (Strikeout): Block one home run per 9 innings (converts HR to K)
- **20** (+3 Control): Add +3 to control roll, once per inning (resets every 3 outs)
- **RP** (Relief Ace): Add +3 to control for the first inning of each game (resets every 27 outs)

### Output Stats

**Hitters:**
- AVG, OBP, SLG, OPS, wOBA
- Value Rating (0-100 scale based on regression deviation)
- Icon impact metrics (V outs avoided, S upgrades, HR upgrades)

**Pitchers:**
- WHIP, mWHIP (modified WHIP using weighted hit values)
- Value Rating
- Icon impact (K HRs blocked, 20/RP advantage swings)

### wOBA Weights

| Outcome | Weight |
|---------|--------|
| Walk | 0.69 |
| Single | 0.88 |
| Single+ | 1.08 |
| Double | 1.24 |
| Triple | 1.56 |
| Home Run | 1.95 |

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

- **Points**: Card cost for team building (higher = better card)
- **onBase**: Hitter's on-base number (pitcher roll must beat this)
- **Control**: Pitcher's control bonus added to their d20 roll
- **Position**: Fielding position(s), `+N` is fielding bonus
- **Ed**: Card edition (CC = Cooperstown Collection, UL = Ultimate Legends, etc.)
- **Icons**: Space-separated icon codes (V, S, HR, K, 20, RP, SB, etc.)
- **H**: Batting hand (L/R/S)

## Data Collection

Card data can be scraped from [showdowncards.com](https://www.showdowncards.com) using `scrape_2003.js` — see the instructions at the top of that file.

## Configuration

Edit `config.js` to change default simulation parameters without touching the main code.
