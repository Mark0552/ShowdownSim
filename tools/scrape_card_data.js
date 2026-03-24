/**
 * MLB Showdown Card Data Scraper
 *
 * Scrapes complete card data from showdowncards.com for 2004 and 2005.
 * This is the source of truth for all card stats, chart data, editions, etc.
 *
 * Usage:
 *   node scrape_card_data.js                # Scrape all 2004 + 2005 cards
 *   node scrape_card_data.js --year 04      # Just 2004
 *   node scrape_card_data.js --test         # Quick test (1 query only)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

const BASE_URL = 'https://www.showdowncards.com/mlb';
const DELAY_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// QUERIES: Every combo of year × expansion × type (hitter/pitcher)
// ============================================================================

function buildQueries(years) {
    const expansions = ['Base Set', 'Pennant Run', 'Trading Deadline'];
    const queries = [];

    for (const year of years) {
        for (const expansion of expansions) {
            // Hitters query
            queries.push({
                type: 'hitter',
                year,
                expansion,
                formId: 'Hitting',
                label: `${year} ${expansion} Hitters`
            });
            // Pitchers query
            queries.push({
                type: 'pitcher',
                year,
                expansion,
                formId: 'Pitching',
                label: `${year} ${expansion} Pitchers`
            });
        }
    }
    return queries;
}

// ============================================================================
// FORM SUBMISSION
// ============================================================================

async function submitSearch(page, query) {
    // Go to search page
    await page.goto(`${BASE_URL}/mlb.php`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);

    // Fill and submit the appropriate form
    await page.evaluate((q) => {
        const form = document.getElementById(q.formId);
        if (!form) throw new Error('Form not found: ' + q.formId);

        const yearSel = form.querySelector('select[name=year]');
        const expSel = form.querySelector('select[name=expansion]');
        const pts1 = form.querySelector('input[name=points_1]');
        const pts2 = form.querySelector('input[name=points_2]');

        if (yearSel) yearSel.value = q.year;
        if (expSel) expSel.value = q.expansion;
        if (pts1) pts1.value = '0';
        if (pts2) pts2.value = '1000';

        const btn = form.querySelector('input[name=submit]');
        if (btn) btn.click();
    }, query);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(1500);
}

// ============================================================================
// RESULT PARSING
// ============================================================================

function cleanRange(value) {
    if (!value || value === '-') return null;
    // Fix trailing dash: "1-" -> "1", "18-" -> "18"
    let v = value.replace(/-$/, '');
    // Fix leading dash: "-5" shouldn't happen but handle it
    v = v.replace(/^-/, '');
    if (!v) return null;
    return v;
}

function parseHitterFromText(block) {
    // Block format:
    // #  Ed  Name\nTeam  Pts  Yr  OB  Spd  Pos\n[Pos2]  H  Icons
    // SO GB FB W S S+ DB TR HR
    // ranges...
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);

    // Find the chart header line
    const chartHeaderIdx = lines.findIndex(l => l.includes('SO') && l.includes('GB') && l.includes('HR'));
    if (chartHeaderIdx === -1) return null;

    const chartHeaders = lines[chartHeaderIdx].split(/\t+/).map(s => s.trim()).filter(s => s);
    const chartValues = (lines[chartHeaderIdx + 1] || '').split(/\t+/).map(s => s.trim()).filter(s => s);

    // Everything before chart header is player info
    const infoText = lines.slice(0, chartHeaderIdx).join('\t');
    const infoParts = infoText.split(/\t+/).map(s => s.trim()).filter(s => s);

    // Parse info: #, Ed, Name, Team, Pts, Yr, OB, Spd, Pos, H, Icons...
    // This is tricky because Position can span multiple parts
    if (infoParts.length < 8) return null;

    const cardNum = parseInt(infoParts[0]);
    const edition = infoParts[1];
    const name = infoParts[2];
    const team = infoParts[3];
    const points = parseInt(infoParts[4]);
    const year = infoParts[5];
    const onBase = parseInt(infoParts[6]);
    const speed = parseInt(infoParts[7]);

    // Remaining parts: position(s), hand, icons
    const remaining = infoParts.slice(8);
    let position = '';
    let hand = '';
    let icons = null;

    for (let i = 0; i < remaining.length; i++) {
        const part = remaining[i];
        if (/^[LRS]$/.test(part)) {
            hand = part;
            // Everything after hand is icons
            const iconParts = remaining.slice(i + 1).filter(p => p);
            if (iconParts.length > 0) icons = iconParts.join(' ');
            break;
        } else {
            position += (position ? ', ' : '') + part;
        }
    }

    // Build chart
    const chart = {};
    const fieldMap = { 'SO': 'SO', 'GB': 'GB', 'FB': 'FB', 'W': 'W', 'BB': 'W', 'S': 'S', 'S+': 'SPlus', 'DB': 'DB', 'TR': 'TR', 'HR': 'HR' };

    for (let i = 0; i < chartHeaders.length && i < chartValues.length; i++) {
        const header = chartHeaders[i];
        const value = cleanRange(chartValues[i]);
        const key = fieldMap[header];
        if (key && value) {
            chart[key] = value;
        }
    }

    return {
        type: 'hitter',
        '#': cardNum,
        Ed: edition,
        Name: name,
        Team: team,
        Points: points,
        'Yr.': year,
        onBase,
        Speed: speed,
        Position: position,
        H: hand,
        Icons: icons,
        SO: chart.SO || null,
        GB: chart.GB || null,
        FB: chart.FB || null,
        W: chart.W || null,
        S: chart.S || null,
        SPlus: chart.SPlus || null,
        DB: chart.DB || null,
        TR: chart.TR || null,
        HR: chart.HR || null
    };
}

function parsePitcherFromText(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    const chartHeaderIdx = lines.findIndex(l => l.includes('SO') && l.includes('GB'));
    if (chartHeaderIdx === -1) return null;

    const chartHeaders = lines[chartHeaderIdx].split(/\t+/).map(s => s.trim()).filter(s => s);
    const chartValues = (lines[chartHeaderIdx + 1] || '').split(/\t+/).map(s => s.trim()).filter(s => s);

    const infoText = lines.slice(0, chartHeaderIdx).join('\t');
    const infoParts = infoText.split(/\t+/).map(s => s.trim()).filter(s => s);

    if (infoParts.length < 8) return null;

    const cardNum = parseInt(infoParts[0]);
    const edition = infoParts[1];
    const name = infoParts[2];
    const team = infoParts[3];
    const points = parseInt(infoParts[4]);
    const year = infoParts[5];
    const control = parseInt(infoParts[6]);
    const ip = parseInt(infoParts[7]);

    const remaining = infoParts.slice(8);
    let position = '';
    let hand = '';
    let icons = null;

    for (let i = 0; i < remaining.length; i++) {
        const part = remaining[i];
        if (/^[LR]$/.test(part)) {
            hand = part;
            const iconParts = remaining.slice(i + 1).filter(p => p);
            if (iconParts.length > 0) icons = iconParts.join(' ');
            break;
        } else {
            position += (position ? ', ' : '') + part;
        }
    }

    const chart = {};
    const fieldMap = { 'PU': 'PU', 'SO': 'SO', 'GB': 'GB', 'FB': 'FB', 'W': 'W', 'BB': 'W', 'S': 'S', 'DB': 'DB', 'HR': 'HR' };

    for (let i = 0; i < chartHeaders.length && i < chartValues.length; i++) {
        const header = chartHeaders[i];
        const value = cleanRange(chartValues[i]);
        const key = fieldMap[header];
        if (key && value) {
            chart[key] = value;
        }
    }

    return {
        type: 'pitcher',
        '#': cardNum,
        Ed: edition,
        Name: name,
        Team: team,
        Points: points,
        'Yr.': year,
        Control: control,
        IP: ip,
        Position: position,
        H: hand,
        Icons: icons,
        PU: chart.PU || null,
        SO: chart.SO || null,
        GB: chart.GB || null,
        FB: chart.FB || null,
        W: chart.W || null,
        S: chart.S || null,
        DB: chart.DB || null,
        HR: chart.HR || null
    };
}

// ============================================================================
// PAGE SCRAPING
// ============================================================================

async function scrapeAllPages(page, query) {
    const allCards = [];
    let pageNum = 1;
    let totalPages = 1;

    while (pageNum <= totalPages) {
        if (pageNum > 1) {
            // Navigate to next page
            const clicked = await page.evaluate((pn) => {
                const links = Array.from(document.querySelectorAll('a'));
                // Find the link for page number pn
                const pageLink = links.find(a => {
                    const text = a.textContent.trim();
                    return text === String(pn) && a.href.includes('mlbsearch');
                });
                if (pageLink) { pageLink.click(); return true; }
                // Try [Next] link
                const next = links.find(a => a.textContent.includes('Next'));
                if (next) { next.click(); return true; }
                return false;
            }, pageNum);

            if (!clicked) break;
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            await sleep(DELAY_MS);
        }

        // Get total pages on first load
        if (pageNum === 1) {
            totalPages = await page.evaluate(() => {
                const m = document.body.innerText.match(/on (\d+) pages/);
                return m ? parseInt(m[1]) : 1;
            });
        }

        // Extract text blocks for each card on this page
        const pageText = await page.evaluate(() => document.body.innerText);

        // Split into card blocks — each card starts with a line matching: \d+\t(UL|P|CC|SS|ASG|1st|RS|AP)\t
        const cardPattern = /(?:^|\n)(\t*\d+\t(?:UL|P|CC|SS|ASG|1st|RS|AP)\t)/;

        // Simpler approach: get the structured text between chart sections
        const chartSections = pageText.split(/\nSO\tGB\tFB\t/);

        // Actually, let me get the raw tab-separated text more carefully
        const rawCards = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            const cards = [];
            let current = [];

            for (const row of rows) {
                const text = row.innerText.trim();
                // A new card starts with a number + edition code
                if (/^\d+\t(UL|P|CC|SS|ASG|1st|RS|AP)\t/.test(text)) {
                    if (current.length > 0) cards.push(current.join('\n'));
                    current = [text];
                } else if (current.length > 0 && text) {
                    current.push(text);
                }
            }
            if (current.length > 0) cards.push(current.join('\n'));
            return cards;
        });

        for (const block of rawCards) {
            const parser = query.type === 'pitcher' ? parsePitcherFromText : parseHitterFromText;
            const card = parser(block);
            if (card) {
                card.expansion = query.expansion;
                allCards.push(card);
            }
        }

        process.stdout.write(`\r  Page ${pageNum}/${totalPages} (${allCards.length} cards so far)`);
        pageNum++;
    }

    return allCards;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const yearFilter = args.includes('--year') ? args[args.indexOf('--year') + 1] : null;
    const testMode = args.includes('--test');

    const years = yearFilter ? [yearFilter] : ['04', '05'];
    const queries = buildQueries(years);

    console.log('MLB Showdown Card Data Scraper (showdowncards.com)');
    console.log(`Queries: ${queries.length} (${years.map(y => '20' + y).join(', ')})`);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    const allHitters = [];
    const allPitchers = [];

    const queriesToRun = testMode ? queries.slice(0, 1) : queries;

    for (const query of queriesToRun) {
        console.log(`\n${query.label}:`);
        await submitSearch(page, query);

        const totalText = await page.evaluate(() => {
            const m = document.body.innerText.match(/returned ([\d,]+) results on (\d+) pages/);
            return m ? m[0] : 'no results';
        });
        console.log(`  ${totalText}`);

        const cards = await scrapeAllPages(page, query);
        console.log(`\n  Parsed: ${cards.length} cards`);

        if (query.type === 'hitter') allHitters.push(...cards);
        else allPitchers.push(...cards);

        await sleep(DELAY_MS);
    }

    await browser.close();

    // Deduplicate (same card # + edition + year + name)
    function dedup(cards) {
        const seen = new Set();
        return cards.filter(c => {
            const key = `${c['#']}|${c.Ed}|${c['Yr.']}|${c.Name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const hitters = dedup(allHitters);
    const pitchers = dedup(allPitchers);

    console.log(`\nTotal unique: ${hitters.length} hitters, ${pitchers.length} pitchers`);

    fs.writeFileSync('hitters_scraped.json', JSON.stringify(hitters, null, 4));
    fs.writeFileSync('pitchers_scraped.json', JSON.stringify(pitchers, null, 4));
    console.log('Saved hitters_scraped.json and pitchers_scraped.json');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
