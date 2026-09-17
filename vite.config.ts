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
  },
}))
