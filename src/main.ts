import './style.css'

const SOURCE_URL = 'https://github.com/amc-corey-cox/SwimBuddy'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app mount point is missing')

const heading = document.createElement('h1')
heading.textContent = 'Swim Buddy'
app.append(heading)

const tagline = document.createElement('p')
tagline.className = 'tagline'
tagline.textContent = 'Scaffold only — screens land in later steps.'
app.append(tagline)

// Open the real store and seed the household on first run. Rendered as a status
// line because it is the only way to confirm IndexedDB actually works in a
// browser — unit tests run against fake-indexeddb, and the e2e suite's
// no-console-errors assertion covers the rest. Scaffolding until step 6.
const storageStatus = document.createElement('p')
storageStatus.className = 'muted'
storageStatus.dataset['testid'] = 'storage-status'
storageStatus.textContent = 'Opening local database…'
app.append(storageStatus)

void (async () => {
  try {
    const { openStore, seedIfEmpty } = await import('./storage/index')
    const store = await openStore()
    await seedIfEmpty(store)
    const swimmers = await store.swimmers.list()
    storageStatus.textContent = `${String(swimmers.length)} swimmers stored locally`
  } catch (error) {
    storageStatus.textContent = `Local database unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
})()

// Preview builds seed the page from the synthetic store so a PR preview shows a
// populated app. The flag is statically replaced at build time, so production
// builds drop both imports entirely.
if (import.meta.env.VITE_SHOW_FIXTURES === 'true') {
  void (async () => {
    const [{ demoStore }, { renderDemoPanel }] = await Promise.all([
      import('./fixtures/index'),
      import('./ui/demoPanel'),
    ])
    const now = Date.now()
    app.append(renderDemoPanel(demoStore(now), now))
  })()
}

// AGPL section 13: every page links back to the source.
const footer = document.createElement('footer')
footer.className = 'source-footer'
const sourceLink = document.createElement('a')
sourceLink.href = SOURCE_URL
sourceLink.rel = 'noopener'
sourceLink.dataset['testid'] = 'source-link'
sourceLink.textContent = 'Source code (AGPLv3)'
footer.append(sourceLink)
document.body.append(footer)
