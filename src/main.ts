import './style.css'

const SOURCE_URL = 'https://github.com/amc-corey-cox/SwimBuddy'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app mount point is missing')

const status = document.createElement('p')
status.className = 'muted'
status.dataset['testid'] = 'storage-status'
status.textContent = 'Opening local database…'
app.append(status)

void (async () => {
  try {
    const [{ openStore, seedIfEmpty }, { startApp }] = await Promise.all([
      import('./storage/index'),
      import('./ui/app'),
    ])

    const store = await openStore()
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
footer.append(sourceLink)
document.body.append(footer)
