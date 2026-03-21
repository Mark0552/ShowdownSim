/**
 * MLB Showdown Simulator Configuration
 *
 * Edit these values to customize simulation behavior,
 * or override them via CLI arguments (run `node sim.js --help`).
 */

const CONFIG = {
    AT_BATS_PER_MATCHUP: 500,
    ICON_CHARGE_THRESHOLD: 3,
    SEED: 'showdown-sim-2024',
    OUTPUT: 'results.html',
    FORMAT: 'html', // 'html' or 'xlsx'
    WEIGHTS: {
        walk: 0.69,
        single: 0.88,
        singlePlus: 1.08,
        double: 1.24,
        triple: 1.56,
        hr: 1.95
    }
};

module.exports = CONFIG;
