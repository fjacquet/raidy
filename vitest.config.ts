import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Use the automatic JSX runtime for the test transform (matches tsconfig
  // `jsx: react-jsx`). Without this, Vite's esbuild falls back to the classic
  // `React.createElement` transform and .tsx tests would need an explicit
  // `import React`. Automatic runtime keeps test files import-free of React.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/engines/**/*.ts', 'src/workers/**/*.ts', 'src/utils/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
      thresholds: {
        // Production-ready coverage thresholds
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@engines': resolve(__dirname, './src/engines'),
      '@components': resolve(__dirname, './src/components'),
      '@store': resolve(__dirname, './src/store'),
      '@types': resolve(__dirname, './src/types'),
      '@utils': resolve(__dirname, './src/utils'),
      '@data': resolve(__dirname, './src/data'),
      '@hooks': resolve(__dirname, './src/hooks'),
    },
  },
})
