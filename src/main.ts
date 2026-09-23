import './style.css'

const SOURCE_URL = 'https://github.com/amc-corey-cox/SwimBuddy'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app mount point is missing')

const status = document.createElement('p')
status.className = 'muted'
status.dataset['testid'] = 'storage-status'
status.textContent = 'Opening local database…'
app.append(status)

/**
 * Held so the reset control can close the store before deleting the database.
 * IndexedDB will not delete one with an open connection, and a blocked delete
 * hangs rather than failing.
 */
let openedStore: { close: () => void } | undefined

void (async () => {
  try {
    const [{ openStore, seedIfEmpty }, { startApp }] = await Promise.all([
      import('./storage/index'),
      import('./ui/app'),
    ])

    const store = await openStore()
    openedStore = store
    await seedIfEmpty(store)

    status.remove()
    await startApp({ store, mount: app })
  } catch (error) {
    // The whole app is local-first, so a database that will not open is the one
    // failure there is no working around. Say so plainly rather than showing an
    // empty screen.
    status.textContent = `Local database unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
})()

// Offline is the default, not a feature: the pool has no signal. Registration is
// best effort — a browser without service workers still gets a working app, it
// just needs to have been online recently.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Unsupported, blocked, or served from a context that forbids it.
    })
  })
}

// AGPL section 13: every page links back to the source.
const footer = document.createElement('footer')
footer.className = 'source-footer'
const sourceLink = document.createElement('a')
sourceLink.href = SOURCE_URL
sourceLink.rel = 'noopener'
sourceLink.dataset['testid'] = 'source-link'
sourceLink.textContent = 'Source'
footer.append(sourceLink, resetControl())
document.body.append(footer)

/**
 * Erase everything and start over.
 *
 * This belongs in Settings and will move there. It is in the footer now because
 * there is no Settings screen and no export, and testing the app on a real
 * phone otherwise means living with whatever state the last session left —
 * including anything written by a PR preview, which shares this origin.
 *
 * Two taps rather than a confirm dialog: the second tap is the confirmation, it
 * reads the same at arm's length on a wet screen, and it is one element to
 * drive from a browser test. The armed state disarms itself, so a stray tap in
 * a pocket cannot be completed by a second stray tap a minute later.
 */
function resetControl(): HTMLButtonElement {
  const IDLE = 'Reset data'
  const ARMED = 'Tap again to erase'
  const DISARM_AFTER_MS = 5000

  let armed = false
  let disarm: ReturnType<typeof setTimeout> | undefined

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'reset'
  button.dataset['testid'] = 'reset'
  button.textContent = IDLE

  button.addEventListener('click', () => {
    if (!armed) {
      armed = true
      button.textContent = ARMED
      button.classList.add('armed')
      disarm = setTimeout(() => {
        armed = false
        button.textContent = IDLE
        button.classList.remove('armed')
      }, DISARM_AFTER_MS)
      return
    }

    clearTimeout(disarm)
    button.disabled = true
    button.textContent = 'Erasing…'

    void (async () => {
      const { deleteDatabase } = await import('./storage/index')
      openedStore?.close()
      await deleteDatabase()
      // Reload rather than re-seed in place: every screen already holds records
      // read from the store that is now gone, and starting the app again is
      // both simpler and exactly what the swimmer will do next anyway.
      location.reload()
    })()
  })

  return button
}
