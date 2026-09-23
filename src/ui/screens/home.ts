import { el, button } from '../dom'
import type { Swimmer } from '../../core/types'

/**
 * Three big swimmer tiles, as the spec asks for.
 *
 * Whose phone this is does not change: it is a family of three sharing one
 * device, so picking a swimmer is the first thing every session does.
 */
export function homeScreen(
  swimmers: readonly Swimmer[],
  onPick: (swimmer: Swimmer) => void,
): HTMLElement {
  const tiles = swimmers.map((swimmer) =>
    button(
      swimmer.name,
      () => {
        onPick(swimmer)
      },
      { class: 'tile', 'data-testid': `swimmer-${swimmer.id}` },
    ),
  )

  return el('section', { class: 'screen', 'data-testid': 'screen-home' }, [
    el('h1', {}, ['Who is swimming?']),
    el('div', { class: 'tiles' }, tiles),
    ...(swimmers.length === 0
      ? [el('p', { class: 'muted' }, ['No swimmers yet. The first run adds the household.'])]
      : []),
  ])
}
