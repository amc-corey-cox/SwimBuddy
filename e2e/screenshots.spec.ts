import { test } from '@playwright/test'

/**
 * Captures what the build actually looks like, so a PR can be reviewed visually
 * from a phone. These are artifacts, not assertions — they never fail a build.
 * The preview workflow publishes them next to the preview site and links them
 * from the PR comment.
 */
test('capture home screen', async ({ page }, testInfo) => {
  await page.goto('/SwimBuddy/')
  await page.getByTestId('screen-home').waitFor()

  await page.screenshot({
    path: `screenshots/${testInfo.project.name}-home.png`,
    fullPage: true,
  })
})
