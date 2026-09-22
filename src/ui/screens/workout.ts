import { el, button } from '../dom'
import { clock, extent, repetitions } from '../format'
import type { ResolvedSet, ResolvedWorkout, Settings } from '../../core/types'

export interface WorkoutHandlers {
  onStep: (index: number) => void
  onFinish: () => void
}

/**
 * The screen that matters: one set per card, at arm's length, on a wet phone.
 *
 * Everything here is already a number. The spec is explicit that resolved
 * distances and send-off times are what appear, never the formula they came
 * from, so nothing on this screen knows what a base pace is.
 */
export function workoutScreen(
  workout: ResolvedWorkout,
  settings: Settings,
  index: number,
  handlers: WorkoutHandlers,
): HTMLElement {
  const cards = workout.sections.flatMap((section) =>
    section.sets.map((set) => ({ section: section.name, set })),
  )
  const current = cards[index]

  if (current === undefined) {
    return el('section', { class: 'screen', 'data-testid': 'screen-workout' }, [
      el('p', {}, ['This workout has no sets.']),
      button('Done', handlers.onFinish, { class: 'primary', 'data-testid': 'finish' }),
    ])
  }

  const last = index === cards.length - 1

  return el('section', { class: 'screen workout', 'data-testid': 'screen-workout' }, [
    el('p', { class: 'progress', 'data-testid': 'progress' }, [
      `${current.section} · ${String(index + 1)} of ${String(cards.length)}`,
    ]),
    setCard(current.set, settings),
    el('div', { class: 'row' }, [
      button(
        '‹ Prev',
        () => {
          handlers.onStep(index - 1)
        },
        { class: 'link', 'data-testid': 'prev', ...(index === 0 ? { disabled: 'true' } : {}) },
      ),
      last
        ? button('Finish', handlers.onFinish, { class: 'primary', 'data-testid': 'finish' })
        : button(
            'Next ›',
            () => {
              handlers.onStep(index + 1)
            },
            { class: 'primary', 'data-testid': 'next' },
          ),
    ]),
  ])
}

function setCard(set: ResolvedSet, settings: Settings): HTMLElement {
  const first = set.parts[0]
  const headline = repetitions(set.reps, extent(first))

  const descriptors = set.parts
    .map((part) => part.descriptor)
    .filter((text) => text.length > 0)
    .join(' / ')

  return el('article', { class: 'card', 'data-testid': 'set-card' }, [
    el('p', { class: 'headline', 'data-testid': 'headline' }, [headline]),
    ...(descriptors.length > 0
      ? [el('p', { class: 'descriptor', 'data-testid': 'descriptor' }, [descriptors])]
      : []),
    ...(set.send_off_seconds === undefined
      ? []
      : [
          el('p', { class: 'sendoff', 'data-testid': 'send-off' }, [
            `Leave on ${clock(set.send_off_seconds)}`,
          ]),
        ]),
    ...(set.pace_seconds === undefined
      ? []
      : [el('p', { class: 'pace', 'data-testid': 'pace' }, [`Hold ${clock(set.pace_seconds)}`])]),
    ...(set.note === undefined ? [] : [el('p', { class: 'note' }, [set.note])]),
    el('p', { class: 'muted unit' }, [settings.pool_unit]),
  ])
}
