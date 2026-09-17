import { formatSendOff } from '../core/units'
import { basePaceFor } from '../core/pace'
import type { Session, StoreSnapshot, Swimmer } from '../core/types'

/**
 * Renders the synthetic store so PR previews and screenshots show a populated
 * app instead of an empty shell.
 *
 * This is scaffolding for the preview build only — the real Home screen arrives
 * in build order step 6. It is behind the VITE_SHOW_FIXTURES flag and is
 * tree-shaken out of production builds.
 */
export function renderDemoPanel(store: StoreSnapshot, now: number): HTMLElement {
  const section = document.createElement('section')
  section.className = 'demo'
  section.dataset['testid'] = 'demo-panel'

  const banner = document.createElement('p')
  banner.className = 'demo-banner'
  banner.dataset['testid'] = 'demo-banner'
  banner.textContent = 'Preview build — synthetic data, not real swimmers.'
  section.append(banner)

  const tiles = document.createElement('ul')
  tiles.className = 'swimmer-tiles'
  tiles.dataset['testid'] = 'swimmer-tiles'
  for (const swimmer of store.swimmers) {
    tiles.append(swimmerTile(swimmer, store.sessions, now))
  }
  section.append(tiles)

  section.append(recentSessions(store, now))
  return section
}

function swimmerTile(swimmer: Swimmer, sessions: readonly Session[], now: number): HTMLLIElement {
  const tile = document.createElement('li')
  tile.className = 'swimmer-tile'
  tile.dataset['testid'] = 'swimmer-tile'

  const name = document.createElement('h2')
  name.textContent = swimmer.name
  tile.append(name)

  const pace = document.createElement('p')
  pace.className = 'stat'
  pace.textContent = `${formatSendOff(basePaceFor(swimmer.base_pace_by_stroke, 'free'))} base pace`
  tile.append(pace)

  const own = sessions.filter((session) => session.swimmer_id === swimmer.id)
  const lastSwim = own.reduce<number | null>(
    (latest, session) => (latest === null || session.date > latest ? session.date : latest),
    null,
  )

  const summary = document.createElement('p')
  summary.className = 'muted'
  const total = own.reduce((sum, session) => sum + session.total_distance, 0)
  summary.textContent =
    lastSwim === null
      ? 'No swims yet'
      : `${String(own.length)} swims · ${total.toLocaleString('en-US')} total · last ${describeGap(now - lastSwim)}`
  tile.append(summary)

  return tile
}

function recentSessions(store: StoreSnapshot, now: number): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'recent'

  const heading = document.createElement('h2')
  heading.textContent = 'Recent swims'
  wrapper.append(heading)

  const list = document.createElement('ol')
  list.className = 'session-list'
  list.dataset['testid'] = 'session-list'

  const byName = new Map(store.swimmers.map((swimmer) => [swimmer.id, swimmer.name]))
  const recent = [...store.sessions].sort((a, b) => b.date - a.date).slice(0, 5)

  for (const session of recent) {
    const item = document.createElement('li')
    item.dataset['testid'] = 'session-row'
    const unit = store.settings.pool_unit === 'yards' ? 'yd' : 'm'
    item.textContent = `${byName.get(session.swimmer_id) ?? 'Unknown'} · ${session.total_distance.toLocaleString('en-US')} ${unit} · ${describeGap(now - session.date)}`
    list.append(item)
  }

  wrapper.append(list)
  return wrapper
}

function describeGap(elapsedMs: number): string {
  const days = Math.round(elapsedMs / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${String(days)} days ago`
}
