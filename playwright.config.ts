import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Preview and production builds are served under the Pages base path.
const BASE_URL = `http://localhost:${String(PORT)}/SwimBuddy/`

/**
 * Escape hatch for sandboxes that ship a preinstalled Chromium whose revision
 * does not match this Playwright version. CI installs the matching browser and
 * leaves this unset.
 */
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_PATH']
const launchOptions = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  projects: [
    // The author reviews on an Android phone, so that viewport is the one that
    // has to be right. Desktop is a secondary check.
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], ...launchOptions },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...launchOptions },
    },
  ],

  // Build with fixtures so the preview under test is populated, then serve the
  // real production output rather than the dev server.
  webServer: {
    command: 'VITE_SHOW_FIXTURES=true npm run build && npm run preview -- --port ' + String(PORT),
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
