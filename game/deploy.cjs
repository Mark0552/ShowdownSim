/**
 * Deploys the game to GitHub Pages with card images included.
 * Run from the game/ directory: node deploy.cjs
 *
 * This builds the app, copies card images into dist/, and pushes
 * the dist/ folder to the gh-pages branch.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd, opts = {}) => {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', ...opts });
};

// 1. Copy data files
console.log('\n=== Copying data files ===');
const simDir = path.resolve(__dirname, '../simulation');
fs.copyFileSync(path.join(simDir, 'hitters.json'), path.join(__dirname, 'public/hitters.json'));
fs.copyFileSync(path.join(simDir, 'pitchers.json'), path.join(__dirname, 'public/pitchers.json'));
console.log('Copied hitters.json and pitchers.json');

// 2. Build
console.log('\n=== Building ===');
run('npx vite build');

// 3. Check card images are in dist
const cardsDir = path.join(__dirname, 'dist/cards');
if (fs.existsSync(cardsDir)) {
    const sets = fs.readdirSync(cardsDir).filter(d => fs.statSync(path.join(cardsDir, d)).isDirectory());
    let total = 0;
    sets.forEach(s => {
        const count = fs.readdirSync(path.join(cardsDir, s)).filter(f => f.endsWith('.jpg')).length;
        total += count;
    });
    console.log(`\nCard images in build: ${total} across ${sets.length} sets`);
} else {
    console.log('\nWARNING: No card images in dist/. Make sure public/cards symlink exists.');
    console.log('Run: node scripts/setup-cards.cjs');
    process.exit(1);
}

// 4. Deploy to gh-pages
console.log('\n=== Deploying to gh-pages ===');
const distDir = path.join(__dirname, 'dist');
process.chdir(distDir);
run('git init');
run('git checkout -b gh-pages');
run('git add -A');
run('git commit -m "Deploy game to GitHub Pages"');

// Get the remote URL from the parent repo
process.chdir(path.resolve(__dirname, '..'));
const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
process.chdir(distDir);
run(`git push -f ${remote} gh-pages`);

// Clean up
fs.rmSync(path.join(distDir, '.git'), { recursive: true, force: true });

console.log('\n=== Done! ===');
console.log('Enable GitHub Pages in repo settings:');
console.log('  Settings > Pages > Source: Deploy from branch > gh-pages > / (root)');
