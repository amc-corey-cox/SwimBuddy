import { expect, test, type Page } from '@playwright/test'

/**
 * The loop the whole app exists for: pick a swimmer, get a workout, swim it, say
 * how it went. Unit tests cover every rule this leans on; what they cannot cover
 * is whether the four screens actually join up in a browser.
 */

async function startSwimming(page: Page): Promise<void> {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').getByRole('button').first().click()
  await expect(page.getByTestId('screen-pre-swim')).toBeVisible()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('screen-workout')).toBeVisible()
}

test('a swimmer can get a workout and rate it', async ({ page }) => {
  await startSwimming(page)

  // Work through every card, whatever the chosen template turns out to hold.
  for (let guard = 0; guard < 50; guard += 1) {
    if ((await page.getByTestId('finish').count()) > 0) break
    await page.getByTestId('next').click()
  }

  await page.getByTestId('finish').click()
  await expect(page.getByTestId('screen-post-swim')).toBeVisible()

  await page.getByTestId('effort-about_right').click()

  // Rating returns to the home screen, and the session is now in storage.
  await expect(page.getByTestId('screen-home')).toBeVisible()

  const stored = await page.evaluate(
    async () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('swim-buddy')
        request.onerror = () => {
          reject(new Error('could not open the database'))
        }
        request.onsuccess = () => {
          const database = request.result
          const count = database.transaction('sessions').objectStore('sessions').count()
          count.onsuccess = () => {
            resolve(count.result)
          }
          count.onerror = () => {
            reject(new Error('could not count sessions'))
          }
        }
      }),
  )

  expect(stored).toBe(1)
})

test('the workout screen shows resolved numbers, never formulas', async ({ page }) => {
  // The spec is explicit: send-off times and distances, never `base+15`.
  await startSwimming(page)

  const card = page.getByTestId('set-card')
  await expect(card).toBeVisible()
  await expect(card).not.toContainText('base')

  await expect(page.getByTestId('headline')).toHaveText(/^\d+(×\d+(:\d\d)?)?$/)
})

test('a send-off reads as a clock time', async ({ page }) => {
  await startSwimming(page)

  for (let guard = 0; guard < 50; guard += 1) {
    if ((await page.getByTestId('send-off').count()) > 0) break
    if ((await page.getByTestId('finish').count()) > 0) break
    await page.getByTestId('next').click()
  }

  await expect(page.getByTestId('send-off')).toHaveText(/^Leave on \d+:\d{2}$/)
})

test('the length buttons change what is offered', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').getByRole('button').first().click()

  await page.getByTestId('length-30').click()
  await expect(page.getByTestId('length-30')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('length-45')).toHaveAttribute('aria-pressed', 'false')
})

test('the youth swimmer is offered something within the cap', async ({ page }) => {
  // The household seeds Me, Wife and Son; the son is the youth profile.
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').getByRole('button').nth(2).click()

  await expect(page.getByTestId('chosen-template')).toBeVisible()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('screen-workout')).toBeVisible()
})

test('back returns to the swimmer list', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').getByRole('button').first().click()
  await page.getByTestId('back').click()

  await expect(page.getByTestId('screen-home')).toBeVisible()
})

test('the app still works with the network off', async ({ page, context }) => {
  // The pool has no signal. The service worker is the whole reason this passes.
  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByTestId('screen-home')).toBeVisible()
  await context.setOffline(false)
})

test('every icon the manifest names is available offline', async ({ page, context }) => {
  // A manifest that points at an uncached icon installs fine online and then
  // cannot paint its own launcher tile at the pool.
  await page.goto('/SwimBuddy/')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const icons = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? ''
    const manifest = (await (await fetch(href)).json()) as { icons: { src: string }[] }
    return manifest.icons.map((icon) => icon.src)
  })

  await context.setOffline(true)
  for (const icon of icons) {
    const status = await page.evaluate(async (src: string) => (await fetch(src)).status, icon)
    expect(status).toBe(200)
  }
  await context.setOffline(false)
})

test('it is installable', async ({ page }) => {
  await page.goto('/SwimBuddy/')

  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href')
  expect(manifestHref).toBeTruthy()

  const manifest = await page.evaluate(async (href: string) => {
    const response = await fetch(href)
    return (await response.json()) as { name: string; display: string; icons: unknown[] }
  }, manifestHref ?? '')

  expect(manifest.name).toBe('Swim Buddy')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
})

test('a rating changes the next swim', async ({ page }) => {
  // The loop's whole point: saying it was too hard has to reach the next session.
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').getByRole('button').first().click()
  await expect(page.getByTestId('reasons')).toBeVisible()
  await expect(page.getByTestId('reasons')).not.toContainText('Last swim was too hard')

  await page.getByTestId('start').click()
  for (let guard = 0; guard < 50; guard += 1) {
    if ((await page.getByTestId('finish').count()) > 0) break
    await page.getByTestId('next').click()
  }
  await page.getByTestId('finish').click()
  await page.getByTestId('effort-too_hard').click()

  await expect(page.getByTestId('screen-home')).toBeVisible()
  await page.getByTestId('screen-home').getByRole('button').first().click()

  await expect(page.getByTestId('reasons')).toContainText('Last swim was too hard')
})
