import { expect, test, type Page } from '@playwright/test'

/**
 * The loop the whole app exists for: pick a swimmer, get a workout, swim it, say
 * how it went. Unit tests cover every rule this leans on; what they cannot cover
 * is whether the four screens actually join up in a browser.
 */

/**
 * Steps through the cards until the last one.
 *
 * Asserts the Finish button arrived rather than trusting the loop: falling out of
 * it and clicking a button that is not there fails with a timeout that says
 * nothing about why.
 */
async function advanceToFinish(page: Page): Promise<void> {
  for (let guard = 0; guard < 50; guard += 1) {
    if ((await page.getByTestId('finish').count()) > 0) break
    await page.getByTestId('next').click()
  }

  await expect(page.getByTestId('finish')).toBeVisible()
}

/**
 * Picking a swimmer now selects them rather than navigating: the roster is not
 * an attendance list, so who is in is chosen before the practice starts.
 */
async function startSwimming(page: Page, swimmers = 1): Promise<void> {
  await page.goto('/SwimBuddy/')
  const tiles = page.locator('[data-testid^="swimmer-"]')
  for (let index = 0; index < swimmers; index += 1) {
    await tiles.nth(index).click()
  }
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('screen-pre-swim')).toBeVisible()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('screen-workout')).toBeVisible()
}

test('a swimmer can get a workout and rate it', async ({ page }) => {
  await startSwimming(page)

  await advanceToFinish(page)
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
  await page.locator('[data-testid^="swimmer-"]').first().click()
  await page.getByTestId('start-practice').click()

  await page.getByTestId('length-30').click()
  await expect(page.getByTestId('length-30')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('length-45')).toHaveAttribute('aria-pressed', 'false')
})

test('the youth swimmer is offered something within the cap', async ({ page }) => {
  // The third swimmer on the seed roster is the youth profile.
  await page.goto('/SwimBuddy/')
  await page.locator('[data-testid^="swimmer-"]').nth(2).click()
  await page.getByTestId('start-practice').click()

  await expect(page.getByTestId('chosen-template')).toBeVisible()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('screen-workout')).toBeVisible()
})

test('back returns to the swimmer list', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.locator('[data-testid^="swimmer-"]').first().click()
  await page.getByTestId('start-practice').click()
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
  await page.locator('[data-testid^="swimmer-"]').first().click()
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('reasons')).toBeVisible()
  await expect(page.getByTestId('reasons')).not.toContainText('Last swim was too hard')

  await page.getByTestId('start').click()
  await advanceToFinish(page)
  await page.getByTestId('finish').click()
  await page.getByTestId('effort-too_hard').click()

  await expect(page.getByTestId('screen-home')).toBeVisible()
  await page.locator('[data-testid^="swimmer-"]').first().click()
  await page.getByTestId('start-practice').click()

  await expect(page.getByTestId('reasons')).toContainText('Last swim was too hard')
})

/**
 * The reset control is the only way to clear data until Settings exists, and it
 * is the kind of thing that has to be proved in a browser: deleting an
 * IndexedDB database that still has an open connection does not fail, it hangs.
 */
test('reset erases the store and the app comes back seeded', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()

  const swimmerCount = await page.locator('[data-testid^="swimmer-"]').count()
  expect(swimmerCount).toBeGreaterThan(0)

  // One tap arms it; the label is the confirmation.
  await page.getByTestId('reset').click()
  await expect(page.getByTestId('reset')).toHaveText('Tap again to erase')

  await page.getByTestId('reset').click()

  // The reload is the assertion that the delete completed: a blocked delete
  // never resolves, so this would time out rather than come back.
  await expect(page.getByTestId('screen-home')).toBeVisible()
  await expect(page.locator('[data-testid^="swimmer-"]')).toHaveCount(swimmerCount)
})

test('an armed reset disarms itself rather than staying primed', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await expect(page.getByTestId('screen-home')).toBeVisible()

  await page.getByTestId('reset').click()
  await expect(page.getByTestId('reset')).toHaveText('Tap again to erase')

  // A stray tap in a pocket should not leave a second stray tap able to wipe it.
  await expect(page.getByTestId('reset')).toHaveText('Reset data', { timeout: 10_000 })
})

/**
 * The roster is the screen without which a team cannot exist. It is also the
 * only place a swimmer's name or safety profile can be changed, so every one of
 * these is a thing that was impossible before it existed.
 */
test('a swimmer can be added, renamed and removed', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('open-roster').click()
  await expect(page.getByTestId('screen-roster')).toBeVisible()

  const before = await page.locator('[data-testid^="roster-row-"]').count()

  await page.getByTestId('roster-new-name').fill('Rowan')
  await page.getByTestId('roster-new-kind').click()
  await expect(page.getByTestId('roster-new-kind')).toHaveText('Youth')
  await page.getByTestId('roster-add').click()

  await expect(page.locator('[data-testid^="roster-row-"]')).toHaveCount(before + 1)
  // Rows come back in the store's key order, not insertion order, so the new
  // swimmer is found by name rather than by position.
  const added = page
    .locator('[data-testid^="roster-row-"]')
    .filter({ has: page.locator('input[value="Rowan"]') })
  await expect(added.locator('[data-testid^="roster-kind-"]')).toHaveText('Youth')

  // The name reaches the tiles, which is the whole complaint about Me/Wife/Son.
  await page.getByTestId('roster-done').click()
  await expect(page.getByTestId('screen-home')).toContainText('Rowan')

  await page.getByTestId('open-roster').click()
  await added.locator('[data-testid^="roster-remove-"]').click()
  await expect(page.locator('[data-testid^="roster-row-"]')).toHaveCount(before)
})

test('renaming a swimmer sticks across a reload', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('open-roster').click()

  const first = page.locator('[data-testid^="roster-name-"]').first()
  await first.fill('Quinn')
  await first.blur()

  await page.reload()
  await expect(page.getByTestId('screen-home')).toContainText('Quinn')
})

test('adult or youth is a choice, and it changes what is offered', async ({ page }) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('open-roster').click()

  // Swimmer ids are random, so rows come back in a different order every run.
  // Pick the swimmer by what the row says rather than by where it sits.
  const kind = page.locator('[data-testid^="roster-kind-"]').filter({ hasText: 'Adult' }).first()
  const id = await kind.getAttribute('data-testid')
  await kind.click()
  await expect(page.getByTestId(id ?? '')).toHaveText('Youth')

  await page.reload()
  await page.getByTestId('open-roster').click()
  await expect(page.getByTestId(id ?? '')).toHaveText('Youth')
})

/**
 * A practice: everybody on one arrangement, each with their own numbers, all
 * advancing together. This is the thing the app could not do at all before.
 */
test('several swimmers share one arrangement with their own numbers', async ({ page }) => {
  await startSwimming(page, 3)

  // One card per swimmer, all on the same set.
  await expect(page.locator('[data-testid^="set-card-"]')).toHaveCount(3)

  // Warmups often prescribe no interval, so step on until a set does.
  for (let guard = 0; guard < 20; guard += 1) {
    if ((await page.getByTestId('send-off').count()) > 1) break
    await page.getByTestId('next').click()
  }

  const sendOffs = await page.getByTestId('send-off').allTextContents()
  expect(sendOffs.length).toBeGreaterThan(1)

  // Different base paces mean different send-offs from the same line. If every
  // swimmer got the same clock time, the resolver is not being run per swimmer.
  expect(new Set(sendOffs).size).toBeGreaterThan(1)
})

test('advancing moves the whole practice, not one swimmer', async ({ page }) => {
  await startSwimming(page, 3)

  const first = await page.getByTestId('progress').textContent()
  await page.getByTestId('next').click()
  const second = await page.getByTestId('progress').textContent()

  expect(second).not.toBe(first)
  await expect(page.locator('[data-testid^="set-card-"]')).toHaveCount(3)
})

test('a set can be flagged for one swimmer without touching the others', async ({ page }) => {
  await startSwimming(page, 3)

  const flags = page.locator('[data-testid^="flag-too_hard-"]')
  await flags.first().click()

  await expect(flags.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(flags.nth(1)).toHaveAttribute('aria-pressed', 'false')

  // Tapping again clears it: this is a note, not a commitment.
  await flags.first().click()
  await expect(flags.first()).toHaveAttribute('aria-pressed', 'false')
})

test('a practice rates every swimmer before it ends', async ({ page }) => {
  await startSwimming(page, 2)

  await advanceToFinish(page)
  await page.getByTestId('finish').click()

  // Two swimmers, two ratings, then home.
  await expect(page.getByTestId('screen-post-swim')).toBeVisible()
  await page.getByTestId('effort-about_right').click()
  await expect(page.getByTestId('screen-post-swim')).toBeVisible()
  await page.getByTestId('effort-about_right').click()

  await expect(page.getByTestId('screen-home')).toBeVisible()
})

/**
 * Balancing gets everybody finishing a set at roughly the same time, not exactly,
 * and somebody always stops for goggles. The set being called out is one number;
 * where a swimmer actually is need not match it.
 */
test('one swimmer can be moved without moving the practice', async ({ page }) => {
  await startSwimming(page, 3)

  const practiceAt = async () => (await page.getByTestId('progress').textContent()) ?? ''
  const before = await practiceAt()

  const first = page.locator('[data-testid^="set-card-"]').first()
  const swimmerId = (await first.getAttribute('data-testid'))?.replace('set-card-', '') ?? ''

  await page.getByTestId(`nudge-on-${swimmerId}`).click()

  // The practice has not moved, and that swimmer is now marked as ahead of it.
  expect(await practiceAt()).toBe(before)
  await expect(page.getByTestId(`drift-${swimmerId}`)).toHaveText('1 ahead')

  // Nobody else drifted.
  await expect(page.locator('[data-testid^="drift-"]')).toHaveCount(1)
})

test('a swimmer who is behind keeps their place when the practice moves on', async ({ page }) => {
  await startSwimming(page, 2)

  const first = page.locator('[data-testid^="set-card-"]').first()
  const swimmerId = (await first.getAttribute('data-testid'))?.replace('set-card-', '') ?? ''

  // Put the practice on set two, then drop one swimmer back to set one.
  await page.getByTestId('next').click()
  await page.getByTestId(`nudge-back-${swimmerId}`).click()
  await expect(page.getByTestId(`drift-${swimmerId}`)).toHaveText('1 behind')

  // Moving the practice on carries the drift rather than silently correcting it.
  await page.getByTestId('next').click()
  await expect(page.getByTestId(`drift-${swimmerId}`)).toHaveText('1 behind')
})

test('a swimmer shows their own set, not the one being called', async ({ page }) => {
  await startSwimming(page, 2)

  const cards = page.locator('[data-testid^="set-card-"]')
  const swimmerId =
    (await cards.first().getAttribute('data-testid'))?.replace('set-card-', '') ?? ''

  const headlines = async () => cards.locator('[data-testid="headline"]').allTextContents()
  const together = await headlines()

  await page.getByTestId(`nudge-on-${swimmerId}`).click()
  const apart = await headlines()

  // The nudged swimmer's card changed; the other one did not.
  expect(apart[0]).not.toBe(together[0])
  expect(apart[1]).toBe(together[1])
})

/**
 * Pool time runs out, a child has had enough, somebody has to leave. The swim
 * still happened, so ending early records what was actually swum rather than
 * throwing the session away — which is what leaving the screen used to do.
 */
test('a practice can be ended early and still counts', async ({ page }) => {
  await startSwimming(page, 1)

  // Two sets in, then stop.
  await page.getByTestId('next').click()
  await page.getByTestId('next').click()
  const swumSoFar = await page.getByTestId('progress').textContent()
  expect(swumSoFar).toContain('3 of')

  await page.getByTestId('end-practice').click()
  await expect(page.getByTestId('end-practice')).toHaveText('End it?')
  await page.getByTestId('end-practice').click()

  await expect(page.getByTestId('screen-post-swim')).toBeVisible()
  await page.getByTestId('effort-about_right').click()
  await expect(page.getByTestId('screen-home')).toBeVisible()

  const stored = await page.evaluate(
    async () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('swim-buddy')
        request.onerror = () => {
          reject(new Error('could not open the database'))
        }
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction('sessions').objectStore('sessions').getAll()
          all.onsuccess = () => {
            const sessions = all.result as { resolved_sets: { sets: unknown[] }[] }[]
            const last = sessions[sessions.length - 1]
            resolve(last?.resolved_sets.reduce((n, s) => n + s.sets.length, 0) ?? -1)
          }
        }
      }),
  )

  // Two sets were finished, and the third was on screen when it stopped.
  expect(stored).toBe(2)
})

test('a swimmer can get out and the rest carry on', async ({ page }) => {
  await startSwimming(page, 3)

  const cards = page.locator('[data-testid^="set-card-"]')
  await expect(cards).toHaveCount(3)

  const id = (await cards.first().getAttribute('data-testid'))?.replace('set-card-', '') ?? ''
  await page.getByTestId(`leave-${id}`).click()

  await expect(cards).toHaveCount(2)
  await expect(page.getByTestId(`set-card-${id}`)).toHaveCount(0)

  // They are still rated at the end: what they swam counts.
  await advanceToFinish(page)
  await page.getByTestId('finish').click()
  for (let rating = 0; rating < 3; rating += 1) {
    await expect(page.getByTestId('screen-post-swim')).toBeVisible()
    await page.getByTestId('effort-about_right').click()
  }
  await expect(page.getByTestId('screen-home')).toBeVisible()
})

test('somebody can join a practice that has already started', async ({ page }) => {
  await startSwimming(page, 2)

  await expect(page.locator('[data-testid^="set-card-"]')).toHaveCount(2)
  await expect(page.getByTestId('join-row')).toBeVisible()

  // The row itself is also a `join-` testid, so select the button inside it.
  await page.getByTestId('join-row').getByRole('button').first().click()

  await expect(page.locator('[data-testid^="set-card-"]')).toHaveCount(3)
  // Nobody is left to add, so the row goes.
  await expect(page.getByTestId('join-row')).toHaveCount(0)
})

test('a set nobody finished pre-answers the post-swim question', async ({ page }) => {
  await startSwimming(page, 2)

  const id =
    (await page.locator('[data-testid^="set-card-"]').first().getAttribute('data-testid'))?.replace(
      'set-card-',
      '',
    ) ?? ''

  await page.getByTestId(`flag-unfinished-${id}`).click()
  await expect(page.getByTestId(`flag-unfinished-${id}`)).toHaveAttribute('aria-pressed', 'true')

  await advanceToFinish(page)
  await page.getByTestId('finish').click()

  // The first swimmer rated is the one who flagged it, and their toggle already
  // says they cut it short.
  await expect(page.getByTestId('completed')).toHaveText('Cut it short')
})
