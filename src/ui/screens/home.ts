import { el, button } from '../dom'
import type { Swimmer } from '../../core/types'

export interface HomeHandlers {
  onStart: (swimmers: readonly Swimmer[]) => void
  onRoster: () => void
}

/**
 * Who is swimming today.
 *
 * Tiles toggle rather than navigate, because the roster is not an attendance
 * list: some of it is here and some is not, and which is which changes every
 * session. One selected is a practice of one and four is a practice of four —
 * there is no separate solo path, just a smaller practice.
 */
export function homeScreen(
  swimmers: readonly Swimmer[],
  selected: ReadonlySet<string>,
  onToggle: (swimmer: Swimmer) => void,
  handlers: HomeHandlers,
): HTMLElement {
  const chosen = swimmers.filter((swimmer) => selected.has(swimmer.id))

  const tiles = swimmers.map((swimmer) => {
    const on = selected.has(swimmer.id)
    return button(
      swimmer.name,
      () => {
        onToggle(swimmer)
      },
      {
        class: on ? 'tile tile-on' : 'tile',
        'data-testid': `swimmer-${swimmer.id}`,
        'aria-pressed': on ? 'true' : 'false',
      },
    )
  })

  return el('section', { class: 'screen', 'data-testid': 'screen-home' }, [
    el('h1', {}, ['Who is swimming?']),
    el('div', { class: 'tiles' }, tiles),
    ...(swimmers.length === 0
      ? [el('p', { class: 'muted' }, ['Nobody on the roster yet. Add someone to get started.'])]
      : []),
    el('div', { class: 'row' }, [
      button('Roster', handlers.onRoster, { class: 'link', 'data-testid': 'open-roster' }),
      button(
        chosen.length <= 1 ? 'Start' : `Start practice (${String(chosen.length)})`,
        () => {
          if (chosen.length > 0) handlers.onStart(chosen)
        },
        {
          class: 'primary',
          'data-testid': 'start-practice',
          ...(chosen.length === 0 ? { disabled: 'true' } : {}),
        },
      ),
    ]),
  ])
}
