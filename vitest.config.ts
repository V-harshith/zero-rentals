import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'tests/'],
        },
        exclude: [
            '**/node_modules/**',
            '**/tests/bulk-import/components.test.tsx', // Requires jsdom environment
        ],
        // Use forks pool to avoid ES module issues with jsdom
        pool: 'forks',
        // Increase timeout for slower machines
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
})
