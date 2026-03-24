/**
 * Sets up card images for the game by creating a symlink
 * from public/cards to the parent directory's cards folder.
 */
const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../../cards');
const link = path.resolve(__dirname, '../public/cards');

if (fs.existsSync(link)) {
    console.log('public/cards already exists, skipping.');
    process.exit(0);
}

try {
    fs.symlinkSync(target, link, 'junction');
    console.log('Created symlink: public/cards -> ../cards');
} catch (e) {
    console.log('Symlink failed, copying card directories...');
    fs.cpSync(target, link, { recursive: true });
    console.log('Copied cards to public/cards');
}

// Also copy the JSON data files
for (const file of ['hitters.json', 'pitchers.json']) {
    const src = path.resolve(__dirname, '../../' + file);
    const dest = path.resolve(__dirname, '../public/' + file);
    if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        console.log('Copied ' + file + ' to public/');
    }
}
