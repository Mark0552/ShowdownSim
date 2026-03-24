/**
 * MLB Showdown Strategy Card Scraper
 *
 * Scrapes strategy card data from showdowncards.com for 2004 and 2005.
 *
 * Usage:
 *   node scrape_strategy_cards.js              # All years/sets
 *   node scrape_strategy_cards.js --year 04    # Just 2004
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

const BASE_URL = 'https://www.showdowncards.com/mlb';
const DELAY_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const QUERIES = [
    { year: '04', expansion: 'Base Set', label: '2004 Base Set' },
    { year: '04', expansion: 'Pennant Run', label: '2004 Pennant Run' },
    { year: '04', expansion: 'Trading Deadline', label: '2004 Trading Deadline' },
    { year: '05', expansion: 'Base Set', label: '2005 Base Set' },
    { year: '05', expansion: 'Trading Deadline', label: '2005 Trading Deadline' },
];

async function submitSearch(page, query) {
    await page.goto(`${BASE_URL}/mlb.php`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);

    await page.evaluate((q) => {
        const form = document.getElementById('Strategy');
        if (!form) throw new Error('Strategy form not found');
        form.querySelector('select[name=year]').value = q.year;
        form.querySelector('select[name=expansion]').value = q.expansion;
        form.querySelector('input[name=submit]').click();
    }, query);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(1500);
}

function parseStrategyCard(block) {
    // Block format: #\tName\tType\tYear\tWhen Played\tDescription
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return null;

    // Join into one line and split by tabs
    const text = lines.join('\t');
    const parts = text.split(/\t+/).map(s => s.trim()).filter(s => s);

    if (parts.length < 5) return null;

    const cardNum = parseInt(parts[0]);
    if (isNaN(cardNum)) return null;

    const name = parts[1];
    const type = parts[2]; // Off, Def, Util
    const year = parts[3];

    // "When Played" and "Description" may run together
    // The format is: "Play on/before/after..." then the description
    let whenPlayed = '';
    let description = '';

    // Find the "when played" part — starts with "Play "
    const remaining = parts.slice(4).join(' ');
    const descMatch = remaining.match(/^(Play .+?\.)\s*(.*)/s);
    if (descMatch) {
        whenPlayed = descMatch[1].trim();
        description = descMatch[2].trim();
    } else {
        // Some cards have different formats
        whenPlayed = parts[4] || '';
        description = parts.slice(5).join(' ').trim();
    }

    return {
        '#': cardNum,
        Name: name,
        Type: type,
        'Yr.': year,
        WhenPlayed: whenPlayed,
        Description: description,
    };
}

async function scrapeAllPages(page, query) {
    const allCards = [];
    let pageNum = 1;
    let totalPages = 1;

    while (pageNum <= totalPages) {
        if (pageNum > 1) {
            const clicked = await page.evaluate((pn) => {
                const links = Array.from(document.querySelectorAll('a'));
                const pageLink = links.find(a => a.textContent.trim() === String(pn) && a.href.includes('mlbsearch'));
                if (pageLink) { pageLink.click(); return true; }
                const next = links.find(a => a.textContent.includes('Next'));
                if (next) { next.click(); return true; }
                return false;
            }, pageNum);
            if (!clicked) break;
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            await sleep(DELAY_MS);
        }

        if (pageNum === 1) {
            totalPages = await page.evaluate(() => {
                const m = document.body.innerText.match(/on (\d+) pages/);
                return m ? parseInt(m[1]) : 1;
            });
        }

        // Extract card blocks from the table
        const rawCards = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            const cards = [];
            let current = [];

            for (const row of rows) {
                const text = row.innerText.trim();
                // A new card starts with a number followed by a tab and a card name
                if (/^\d+\t/.test(text) && text.includes("'0")) {
                    if (current.length > 0) cards.push(current.join('\n'));
                    current = [text];
                } else if (current.length > 0 && text && !text.startsWith('#') && !text.startsWith('New Search')) {
                    current.push(text);
                }
            }
            if (current.length > 0) cards.push(current.join('\n'));
            return cards;
        });

        for (const block of rawCards) {
            const card = parseStrategyCard(block);
            if (card) {
                card.expansion = query.expansion;
                allCards.push(card);
            }
        }

        process.stdout.write(`\r  Page ${pageNum}/${totalPages} (${allCards.length} cards)`);
        pageNum++;
    }

    return allCards;
}

async function main() {
    const args = process.argv.slice(2);
    const yearFilter = args.includes('--year') ? args[args.indexOf('--year') + 1] : null;

    const queries = yearFilter ? QUERIES.filter(q => q.year === yearFilter) : QUERIES;

    console.log('MLB Showdown Strategy Card Scraper');
    console.log(`Queries: ${queries.length}\n`);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    const allCards = [];

    for (const query of queries) {
        console.log(`${query.label}:`);
        await submitSearch(page, query);

        const count = await page.evaluate(() => {
            const m = document.body.innerText.match(/returned ([\d,]+) results/);
            return m ? m[0] : 'no results';
        });
        console.log(`  ${count}`);

        const cards = await scrapeAllPages(page, query);
        console.log(`\n  Parsed: ${cards.length} cards\n`);
        allCards.push(...cards);

        await sleep(DELAY_MS);
    }

    await browser.close();

    // Deduplicate
    const seen = new Set();
    const unique = allCards.filter(c => {
        const key = `${c['#']}|${c['Yr.']}|${c.Name}|${c.expansion}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`Total unique: ${unique.length} strategy cards`);

    // Save
    const outPath = '../simulation/strategy_cards.json';
    fs.writeFileSync(outPath, JSON.stringify(unique, null, 4));
    console.log(`Saved to ${outPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
