import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        // Pick up your existing .test.ts files. simulation/ uses node assert
        // which Vitest re-exports, so existing tests run unchanged. Add
        // .test.tsx for RTL component tests.
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
});