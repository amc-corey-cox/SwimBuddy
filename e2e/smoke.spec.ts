import { expect, test } from '@playwright/test'

/**
 * These tests exist because development happens in a sandbox with no device: if
 * the built page does not actually run in a browser, nothing else catches it.
 * The MIME-type regression that made the preview render blank passed every unit
 * test — a check like the console/network one below is what catches that class
 * of failure.
 */

test('the built page renders without console or network errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${String(response.status())} ${response.url()}`)
    }
  })

  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()

  // Asserted first: these name the offending URL, so a failure is diagnosable.
  expect(failedRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('scripts execute, rather than being served as HTML', async ({ page }) => {
  // The home screen only exists if the module actually ran. A page served with the
  // wrong base path still returns 200 and renders the empty shell, so this is the
  // assertion that distinguishes a working build from a blank one.
  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()
})

test('every page links to the source, as AGPL section 13 requires', async ({ page }) => {
  await page.goto('/SwimBuddy/')

  const sourceLink = page.getByTestId('source-link')
  await expect(sourceLink).toBeVisible()
  await expect(sourceLink).toHaveAttribute('href', 'https://github.com/amc-corey-cox/SwimBuddy')
})

test('opens IndexedDB and seeds the household on first run', async ({ page }) => {
  // Unit tests use fake-indexeddb; this is the only check that the storage layer
  // works in a real browser engine.
  await page.goto('/SwimBuddy/')

  await expect(page.getByTestId('screen-home').getByRole('button')).toHaveCount(3)
})

test('seeding does not duplicate when the app is reloaded', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home').getByRole('button')).toHaveCount(3)

  await page.reload()
  await expect(page.getByTestId('screen-home').getByRole('button')).toHaveCount(3)
})

test('content stays inside the viewport on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone viewport only')

  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
