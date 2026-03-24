import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    // Base path for GitHub Pages — repo name becomes the path prefix
    base: '/MLB-Showdown/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        open: true,
        fs: {
            allow: ['..'],
        },
    },
});
