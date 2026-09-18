/// <reference types="node" />
import { defineConfig } from 'vitest/config'

// Deployed to https://amc-corey-cox.github.io/SwimBuddy/, so built asset URLs
// need the repo name as a base. Override with BASE_PATH for a custom domain.
const basePath = process.env.BASE_PATH ?? '/SwimBuddy/'

// Keyed on mode, not command: `vite preview` runs command 'serve' but serves the
// production build, so it needs the same base the built HTML references.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? basePath : '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      // The spec requires every rule-based behavior to be unit tested, and
      // src/core/ is where those rules live. UI is covered by e2e instead.
      include: ['src/core/**/*.ts', 'src/fixtures/**/*.ts', 'src/storage/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/core/types.ts'],
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
}))
