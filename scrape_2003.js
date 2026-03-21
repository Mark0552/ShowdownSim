/**
 * MLB Showdown 2003 Card Scraper
 *
 * HOW TO USE:
 * 1. Go to https://www.showdowncards.com/mlb/mlb.php
 * 2. Open browser DevTools (F12 or right-click -> Inspect)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 * 5. Wait for it to complete (may take a few minutes)
 * 6. It will download hitters_2003.json and pitchers_2003.json
 */

(async function scrape2003Cards() {
    console.log('Starting 2003 MLB Showdown scraper...');

    const hitters = [];
    const pitchers = [];

    // Helper to parse the results table
    function parseResultsTable() {
        const rows = document.querySelectorAll('table tr');
        const cards = [];

        rows.forEach((row, idx) => {
            if (idx === 0) return; // Skip header
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return;

            // Try to extract card data from cells
            const cardData = {};
            cells.forEach((cell, i) => {
                cardData[`col${i}`] = cell.textContent.trim();
            });
            cards.push(cardData);
        });

        return cards;
    }

    // Since we can't easily automate form submission from console,
    // let's provide instructions for manual collection

    const instructions = `
╔════════════════════════════════════════════════════════════════╗
║  MLB Showdown 2003 Card Data Collection Instructions           ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  The showdowncards.com site requires form submissions.         ║
║  Here's how to manually collect the data:                      ║
║                                                                ║
║  FOR HITTERS:                                                  ║
║  1. On the "Hitting" tab, set Year = 2003                      ║
║  2. Click "Scouting Report"                                    ║
║  3. When results appear, run in console:                       ║
║     copy(extractHitterData())                                  ║
║  4. Paste into a text file                                     ║
║                                                                ║
║  FOR PITCHERS:                                                 ║
║  1. On the "Pitching" tab, set Year = 2003                     ║
║  2. Click "Scouting Report"                                    ║
║  3. When results appear, run in console:                       ║
║     copy(extractPitcherData())                                 ║
║  4. Paste into a text file                                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `;

    console.log(instructions);

    // Define extraction functions globally so user can call them
    window.extractHitterData = function() {
        const tables = document.querySelectorAll('table');
        const hitters = [];

        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, idx) => {
                if (idx === 0) return; // Skip header

                const cells = row.querySelectorAll('td');
                if (cells.length < 10) return;

                // Parse based on typical showdown card table structure
                const text = Array.from(cells).map(c => c.textContent.trim());

                // Try to identify hitter cards (look for position indicators)
                if (text.some(t => /\b(C|1B|2B|3B|SS|LF|CF|RF|OF|DH|IF)\b/.test(t))) {
                    hitters.push({
                        raw: text,
                        // Will need to map these to correct fields after seeing actual structure
                    });
                }
            });
        });

        console.log(`Found ${hitters.length} potential hitter cards`);
        return JSON.stringify(hitters, null, 2);
    };

    window.extractPitcherData = function() {
        const tables = document.querySelectorAll('table');
        const pitchers = [];

        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, idx) => {
                if (idx === 0) return; // Skip header

                const cells = row.querySelectorAll('td');
                if (cells.length < 10) return;

                const text = Array.from(cells).map(c => c.textContent.trim());

                // Try to identify pitcher cards (look for Starter/Reliever/Closer)
                if (text.some(t => /\b(Starter|Reliever|Closer|SP|RP|CL)\b/.test(t))) {
                    pitchers.push({
                        raw: text,
                    });
                }
            });
        });

        console.log(`Found ${pitchers.length} potential pitcher cards`);
        return JSON.stringify(pitchers, null, 2);
    };

    // Also provide a function to extract all visible data
    window.extractAllData = function() {
        const tables = document.querySelectorAll('table');
        const allData = [];

        tables.forEach((table, tableIdx) => {
            const rows = table.querySelectorAll('tr');
            const headers = [];

            rows.forEach((row, rowIdx) => {
                const cells = row.querySelectorAll('th, td');
                const rowData = Array.from(cells).map(c => c.textContent.trim());

                if (rowIdx === 0) {
                    headers.push(...rowData);
                } else if (rowData.length > 3 && rowData.some(r => r.length > 0)) {
                    const obj = {};
                    rowData.forEach((val, i) => {
                        const key = headers[i] || `col${i}`;
                        obj[key] = val;
                    });
                    allData.push(obj);
                }
            });
        });

        console.log(`Extracted ${allData.length} rows of data`);
        return JSON.stringify(allData, null, 2);
    };

    console.log('Functions loaded! After searching, use:');
    console.log('  copy(extractAllData())     - Extract all visible table data');
    console.log('  copy(extractHitterData())  - Extract hitter cards');
    console.log('  copy(extractPitcherData()) - Extract pitcher cards');

})();
