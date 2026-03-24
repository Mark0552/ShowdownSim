/**
 * Sets up card images and data for the game.
 * Creates symlink for card images and copies JSON data files.
 */
const fs = require('fs');
const path = require('path');

const cardsTarget = path.resolve(__dirname, '../../cards');
const cardsLink = path.resolve(__dirname, '../public/cards');

if (!fs.existsSync(cardsLink)) {
    try {
        fs.symlinkSync(cardsTarget, cardsLink, 'junction');
        console.log('Created symlink: public/cards -> ../../cards');
    } catch (e) {
        console.log('Symlink failed, copying card directories...');
        fs.cpSync(cardsTarget, cardsLink, { recursive: true });
        console.log('Copied cards to public/cards');
    }
} else {
    console.log('public/cards already exists.');
}

// Copy JSON data files from simulation/
for (const file of ['hitters.json', 'pitchers.json']) {
    const src = path.resolve(__dirname, '../../simulation/' + file);
    const dest = path.resolve(__dirname, '../public/' + file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('Copied ' + file + ' to public/');
    } else {
        console.log('WARNING: ' + src + ' not found');
    }
}
