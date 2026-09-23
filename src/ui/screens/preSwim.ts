import { el, button } from '../dom'
import type { Selection } from '../../core/selection'
import type { Swimmer } from '../../core/types'

/** The session lengths the spec offers. */
export const SESSION_LENGTHS = [30, 45, 60, 75] as const

export interface PreSwimHandlers {
  onLengthChange: (minutes: number) => void
  onStart: () => void
  onBack: () => void
}

/**
 * Pick a length, see what that gets you, start.
 *
 * The chosen workout is named and explained before anybody gets in the water,
 * because "why this one?" is the question a rule-based picker has to be able to
 * answer — that is the whole reason selection returns its reasons.
 */
export function preSwimScreen(
  swimmer: Swimmer,
  minutes: number,
  selection: Selection | undefined,
  adaptationReasons: readonly string[],
  handlers: PreSwimHandlers,
): HTMLElement {
  const lengths = SESSION_LENGTHS.map((option) =>
    button(
      `${String(option)} min`,
      () => {
        handlers.onLengthChange(option)
      },
      {
        class: option === minutes ? 'chip chip-on' : 'chip',
        'data-testid': `length-${String(option)}`,
        'aria-pressed': option === minutes ? 'true' : 'false',
      },
    ),
  )

  const preview =
    selection === undefined
      ? [
          el('p', { class: 'muted', 'data-testid': 'no-workout' }, [
            'Nothing fits that length today. Try a different one.',
          ]),
        ]
      : [
          el('h2', { 'data-testid': 'chosen-template' }, [selection.template.name]),
          el(
            'ul',
            { class: 'reasons', 'data-testid': 'reasons' },
            [...selection.reasons, ...adaptationReasons].map((reason) => el('li', {}, [reason])),
          ),
          button('Start', handlers.onStart, { class: 'primary', 'data-testid': 'start' }),
        ]

  return el('section', { class: 'screen', 'data-testid': 'screen-pre-swim' }, [
    button('‹ Back', handlers.onBack, { class: 'link', 'data-testid': 'back' }),
    el('h1', {}, [`${swimmer.name}'s swim`]),
    el('div', { class: 'chips' }, lengths),
    ...preview,
  ])
}
