import './style.css'

const SOURCE_URL = 'https://github.com/amc-corey-cox/SwimBuddy'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app mount point is missing')

app.innerHTML = `
  <h1>Swim Buddy</h1>
  <p class="tagline">Scaffold only — screens land in later steps.</p>
`

// AGPL section 13: every page links back to the source.
const footer = document.createElement('footer')
footer.className = 'source-footer'
footer.innerHTML = `
  <a href="${SOURCE_URL}" rel="noopener">Source code (AGPLv3)</a>
`
document.body.append(footer)
