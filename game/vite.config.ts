import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    // Base path for GitHub Pages — must match repo name
    base: '/ShowdownSim/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        // Emit source maps so production stack traces map back to TS source.
        // Needed to root-cause the long-standing "Cannot read properties of
        // undefined (reading 'x')" TypeError that only shows up in the
        // minified bundle.
        sourcemap: true,
    },
    server: {
        open: true,
        fs: {
            allow: ['..'],
        },
    },
});
