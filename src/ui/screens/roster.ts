import { el, button } from '../dom'
import type { Swimmer } from '../../core/types'

export interface RosterDraft {
  readonly name: string
  readonly is_youth: boolean
  readonly base_pace_seconds: number
}

export interface RosterHandlers {
  onAdd: (draft: RosterDraft) => void
  onRename: (swimmer: Swimmer, name: string) => void
  onSetYouth: (swimmer: Swimmer, isYouth: boolean) => void
  onSetBasePace: (swimmer: Swimmer, seconds: number) => void
  onRemove: (swimmer: Swimmer) => void
  onDone: () => void
}

/** A sane starting pace for somebody who has not done a test set yet. */
const DEFAULT_BASE_PACE_SECONDS = 120

/**
 * Who is on the roster, and the only place their details can be changed.
 *
 * Reachable from the first screen rather than buried behind settings, because
 * the roster changes at the pool: somebody turns up who has never swum with you
 * before, and adding them has to take seconds while everyone else is warming up.
 *
 * Adult or youth is a plain choice rather than something inferred, because it
 * decides which safety caps apply and a wrong guess is the kind that hands an
 * eleven-year-old an adult's session.
 */
export function rosterScreen(swimmers: readonly Swimmer[], handlers: RosterHandlers): HTMLElement {
  return el('section', { class: 'screen', 'data-testid': 'screen-roster' }, [
    button('‹ Done', handlers.onDone, { class: 'link', 'data-testid': 'roster-done' }),
    el('h1', {}, ['Roster']),
    el(
      'div',
      { class: 'roster' },
      swimmers.map((swimmer) => swimmerRow(swimmer, handlers)),
    ),
    ...(swimmers.length === 0
      ? [el('p', { class: 'muted' }, ['Nobody on the roster yet. Add the first swimmer below.'])]
      : []),
    addForm(handlers),
  ])
}

function swimmerRow(swimmer: Swimmer, handlers: RosterHandlers): HTMLElement {
  const name = el('input', {
    class: 'roster-name',
    type: 'text',
    value: swimmer.name,
    'aria-label': `Name for ${swimmer.name}`,
    'data-testid': `roster-name-${swimmer.id}`,
  })
  name.value = swimmer.name
  name.addEventListener('change', () => {
    const next = name.value.trim()
    // An empty name would leave a tile nobody can identify, so it reverts
    // rather than saving. Removing a swimmer is a separate, deliberate action.
    if (next.length === 0) name.value = swimmer.name
    else handlers.onRename(swimmer, next)
  })

  const pace = el('input', {
    class: 'roster-pace',
    type: 'number',
    min: '30',
    max: '600',
    step: '1',
    inputmode: 'numeric',
    'aria-label': `Base pace in seconds for ${swimmer.name}`,
    'data-testid': `roster-pace-${swimmer.id}`,
  })
  pace.value = String(swimmer.base_pace_by_stroke.free)
  pace.addEventListener('change', () => {
    const seconds = Number(pace.value)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      pace.value = String(swimmer.base_pace_by_stroke.free)
      return
    }
    handlers.onSetBasePace(swimmer, Math.round(seconds))
  })

  return el('div', { class: 'roster-row', 'data-testid': `roster-row-${swimmer.id}` }, [
    name,
    el('div', { class: 'roster-controls' }, [
      kindToggle(swimmer, handlers),
      el('label', { class: 'roster-pace-label' }, [
        pace,
        el('span', { class: 'muted' }, ['s/100']),
      ]),
      button(
        'Remove',
        () => {
          handlers.onRemove(swimmer)
        },
        { class: 'link danger', 'data-testid': `roster-remove-${swimmer.id}` },
      ),
    ]),
  ])
}

function kindToggle(swimmer: Swimmer, handlers: RosterHandlers): HTMLElement {
  const label = () => (swimmer.is_youth ? 'Youth' : 'Adult')

  return button(
    label(),
    () => {
      handlers.onSetYouth(swimmer, !swimmer.is_youth)
    },
    {
      class: swimmer.is_youth ? 'chip chip-on' : 'chip',
      'data-testid': `roster-kind-${swimmer.id}`,
      'aria-pressed': swimmer.is_youth ? 'true' : 'false',
    },
  )
}

function addForm(handlers: RosterHandlers): HTMLElement {
  let isYouth = false

  const name = el('input', {
    class: 'roster-name',
    type: 'text',
    placeholder: 'New swimmer',
    'aria-label': 'Name for the new swimmer',
    'data-testid': 'roster-new-name',
  })

  const kind = button(
    'Adult',
    () => {
      isYouth = !isYouth
      kind.textContent = isYouth ? 'Youth' : 'Adult'
      kind.className = isYouth ? 'chip chip-on' : 'chip'
      kind.setAttribute('aria-pressed', isYouth ? 'true' : 'false')
    },
    { class: 'chip', 'data-testid': 'roster-new-kind', 'aria-pressed': 'false' },
  )

  const add = button(
    'Add swimmer',
    () => {
      const trimmed = name.value.trim()
      if (trimmed.length === 0) return
      handlers.onAdd({
        name: trimmed,
        is_youth: isYouth,
        base_pace_seconds: DEFAULT_BASE_PACE_SECONDS,
      })
      name.value = ''
      isYouth = false
      kind.textContent = 'Adult'
      kind.className = 'chip'
      kind.setAttribute('aria-pressed', 'false')
    },
    { class: 'primary', 'data-testid': 'roster-add' },
  )

  return el('div', { class: 'roster-add' }, [
    name,
    el('div', { class: 'roster-controls' }, [kind, add]),
    el('p', { class: 'muted' }, [
      'A new swimmer starts on a provisional pace until a test set measures one.',
    ]),
  ])
}
