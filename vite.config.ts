import { defineConfig } from 'vitest/config'

// Deployed to https://amc-corey-cox.github.io/SwimBuddy/, so built asset URLs
// need the repo name as a base. Override with BASE_PATH for a custom domain.
const basePath = process.env.BASE_PATH ?? '/SwimBuddy/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? basePath : '/',
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
