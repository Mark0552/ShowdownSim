/**
 * MLB Showdown Card Image Scraper
 *
 * Downloads front card images from TCDB for 2004 and 2005 MLB Showdown sets.
 *
 * Step 1: Build card list from TCDB checklists (via curl)
 * Step 2: Download front images (via stealth Puppeteer + in-page fetch)
 *
 * Setup:
 *   npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
 *
 * Usage:
 *   node scrape_images.js              # Download all sets
 *   node scrape_images.js --set 8137   # Download only one set
 *   node scrape_images.js --list-only  # Just build card lists, skip images
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SETS = [
    { sid: 8137, name: '2004-Base', slug: '2004-MLB-Showdown', pages: 4 },
    { sid: 8139, name: '2004-Pennant-Run', slug: '2004-MLB-Showdown-Pennant-Run', pages: 2 },
    { sid: 8142, name: '2004-Trading-Deadline', slug: '2004-MLB-Showdown-Trading-Deadline', pages: 2 },
    { sid: 8138, name: '2004-Strategy', slug: '2004-MLB-Showdown---Strategy', pages: 1 },
    { sid: 254672, name: '2004-Promos', slug: '2004-MLB-Showdown---Showdown-League-Promos', pages: 1 },
    { sid: 8147, name: '2005-Base', slug: '2005-MLB-Showdown', pages: 4 },
    { sid: 8149, name: '2005-Trading-Deadline', slug: '2005-MLB-Showdown-Trading-Deadline', pages: 2 },
    { sid: 8148, name: '2005-Strategy', slug: '2005-MLB-Showdown---Strategy', pages: 1 },
    { sid: 254755, name: '2005-Promos', slug: '2005-MLB-Showdown---Showdown-League-Promos', pages: 1 },
];

const BASE_URL = 'https://www.tcdb.com';
const DELAY_MS = 1500;          // ms between each card
const BATCH_PAUSE_MS = 10000;   // longer pause every N cards
const BATCH_SIZE = 40;          // pause after this many downloads

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// STEP 1: Build card lists via curl
// ============================================================================

function buildCardList(set) {
    const allCards = [];
    const seen = new Set();

    for (let p = 1; p <= set.pages; p++) {
        process.stdout.write(`  Page ${p}/${set.pages}...`);
        const url = `${BASE_URL}/Checklist.cfm/sid/${set.sid}/${set.slug}?PageIndex=${p}`;
        const html = execSync(
            `curl -s -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`,
            { encoding: 'utf8', timeout: 15000 }
        );

        const regex = new RegExp(
            `ViewCard\\.cfm/sid/${set.sid}/cid/(\\d+)/([^"?]+?)\\?`, 'g'
        );
        let match;
        let newCount = 0;
        while ((match = regex.exec(html)) !== null) {
            const cid = match[1];
            if (seen.has(cid)) continue;
            seen.add(cid);
            const slug = match[2]; // e.g. "2004-MLB-Showdown-001-Garret-Anderson"
            const numMatch = slug.match(/-(\d+)-([^\/]+)$/);
            const cardNum = numMatch ? numMatch[1] : '?';
            const playerName = numMatch ? numMatch[2].replace(/-/g, ' ') : slug;
            allCards.push({ cid, cardNum, playerName, slug });
            newCount++;
        }
        console.log(` ${newCount} cards`);
    }
    return allCards;
}

// ============================================================================
// STEP 2: Download images via stealth Puppeteer + in-page fetch
// ============================================================================

async function downloadSetImages(browser, set, cards) {
    const outDir = path.join(__dirname, 'cards', set.name);
    fs.mkdirSync(outDir, { recursive: true });

    // Save manifest
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(
        cards.map(c => ({ cid: c.cid, cardNum: c.cardNum, playerName: c.playerName, slug: c.slug, set: set.name, sid: set.sid, imageFile: `${c.cid}.jpg` })),
        null, 2
    ));

    const page = await browser.newPage();

    let downloaded = 0, skipped = 0, failed = 0;

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const outPath = path.join(outDir, `${card.cid}.jpg`);

        // Skip existing
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
            skipped++;
            if (i % 25 === 0) process.stdout.write(`\r  [${i + 1}/${cards.length}] ${skipped} skipped...`);
            continue;
        }

        try {
            // Visit the card page with full slug (required by TCDB)
            const cardUrl = `${BASE_URL}/ViewCard.cfm/sid/${set.sid}/cid/${card.cid}/${card.slug}`;
            await page.goto(cardUrl, { waitUntil: 'networkidle2', timeout: 20000 });

            // Find the front image src and fetch it in-page (same-origin, cookies work)
            const imageBase64 = await page.evaluate(async () => {
                const img = Array.from(document.querySelectorAll('img'))
                    .find(i => i.src.includes('/Images/Cards/') && i.src.includes('Fr.'));
                if (!img) return null;

                const resp = await fetch(new URL(img.src).pathname);
                if (!resp.ok) return null;
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                if (bytes.length < 500) return null;
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            });

            if (imageBase64) {
                fs.writeFileSync(outPath, Buffer.from(imageBase64, 'base64'));
                downloaded++;
                process.stdout.write(`\r  [${i + 1}/${cards.length}] #${card.cardNum} ${card.playerName}                    `);
            } else {
                failed++;
                process.stdout.write(`\r  [${i + 1}/${cards.length}] FAILED #${card.cardNum} ${card.playerName}              `);
            }
        } catch (e) {
            failed++;
            process.stdout.write(`\r  [${i + 1}/${cards.length}] ERROR #${card.cardNum} ${card.playerName}               `);
        }

        await sleep(DELAY_MS);

        // Longer pause every BATCH_SIZE downloads to avoid throttling
        if (downloaded > 0 && downloaded % BATCH_SIZE === 0) {
            process.stdout.write(`\n  Pausing ${BATCH_PAUSE_MS / 1000}s to avoid throttling...`);
            await sleep(BATCH_PAUSE_MS);
        }
    }

    console.log(`\n  Done: ${downloaded} downloaded, ${skipped} existed, ${failed} failed`);
    await page.close();
    return { total: cards.length, downloaded, skipped, failed };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const listOnly = args.includes('--list-only');
    const setFilter = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;

    const setsToProcess = setFilter
        ? SETS.filter(s => s.sid.toString() === setFilter)
        : SETS;

    if (setsToProcess.length === 0) {
        console.error(`Unknown set sid "${setFilter}". Available:`);
        SETS.forEach(s => console.error(`  ${s.sid}: ${s.name}`));
        process.exit(1);
    }

    console.log('MLB Showdown Card Image Scraper');
    console.log(`Sets: ${setsToProcess.map(s => s.name).join(', ')}\n`);

    // Step 1: Build card lists
    console.log('STEP 1: Building card lists...');
    const cardLists = {};
    for (const set of setsToProcess) {
        console.log(`\n${set.name} (sid ${set.sid}):`);
        cardLists[set.name] = buildCardList(set);
        console.log(`  Total: ${cardLists[set.name].length} cards`);
    }

    const totalCards = Object.values(cardLists).reduce((s, c) => s + c.length, 0);
    console.log(`\nTotal: ${totalCards} cards across ${setsToProcess.length} sets`);

    if (listOnly) {
        for (const [name, cards] of Object.entries(cardLists)) {
            console.log(`\n--- ${name} ---`);
            cards.forEach(c => console.log(`  #${c.cardNum} ${c.playerName} (cid: ${c.cid})`));
        }
        return;
    }

    // Step 2: Download images
    console.log('\nSTEP 2: Downloading images (this will take a while)...');
    const browser = await puppeteer.launch({ headless: false });

    const results = {};
    for (const set of setsToProcess) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`${set.name} (${cardLists[set.name].length} cards)`);
        console.log('='.repeat(50));
        results[set.name] = await downloadSetImages(browser, set, cardLists[set.name]);
    }

    await browser.close();

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('COMPLETE');
    console.log('='.repeat(50));
    let totalDl = 0, totalFail = 0;
    for (const [name, r] of Object.entries(results)) {
        console.log(`  ${name}: ${r.downloaded} new, ${r.skipped} existed, ${r.failed} failed (${r.total} total)`);
        totalDl += r.downloaded;
        totalFail += r.failed;
    }
    console.log(`\n  ${totalCards} cards | ${totalDl} downloaded | ${totalFail} failed`);
    console.log(`  Images saved to ./cards/`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
