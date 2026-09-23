import { el, button } from '../dom'
import type { EffortRating, FunRating, Swimmer } from '../../core/types'

export interface PostSwimAnswers {
  readonly effort: EffortRating
  readonly completed: boolean
  readonly fun?: FunRating
}

/**
 * Three big buttons and out, in under ten seconds.
 *
 * Effort is the only required answer, because it is the one the adaptation rules
 * run off. Everything else has a sensible default so that tapping once and
 * putting the phone down records something true.
 */
export interface PostSwimDefaults {
  /**
   * Where the completed toggle starts.
   *
   * A swimmer who flagged a set as unfinished during the practice has already
   * said they cut it short, so the screen opens on that answer rather than
   * asking again and letting the two records disagree.
   */
  readonly completed?: boolean
}

export function postSwimScreen(
  swimmer: Swimmer,
  onDone: (answers: PostSwimAnswers) => void,
  defaults: PostSwimDefaults = {},
): HTMLElement {
  let completed = defaults.completed ?? true
  let fun: FunRating | undefined

  const completedToggle = button(
    completed ? 'Finished the main set' : 'Cut it short',
    () => {
      completed = !completed
      completedToggle.textContent = completed ? 'Finished the main set' : 'Cut it short'
      completedToggle.className = completed ? 'chip chip-on' : 'chip'
      completedToggle.setAttribute('aria-pressed', completed ? 'true' : 'false')
    },
    {
      class: completed ? 'chip chip-on' : 'chip',
      'data-testid': 'completed',
      'aria-pressed': completed ? 'true' : 'false',
    },
  )

  const funRow = swimmer.is_youth
    ? [el('div', { class: 'chips' }, [funChip('Fun 👍', 'up'), funChip('Not fun 👎', 'down')])]
    : []

  function funChip(label: string, value: FunRating): HTMLButtonElement {
    const chip = button(
      label,
      () => {
        fun = fun === value ? undefined : value
        for (const other of chip.parentElement?.children ?? []) {
          other.className = 'chip'
          other.setAttribute('aria-pressed', 'false')
        }
        chip.className = fun === value ? 'chip chip-on' : 'chip'
        chip.setAttribute('aria-pressed', fun === value ? 'true' : 'false')
      },
      { class: 'chip', 'data-testid': `fun-${value}`, 'aria-pressed': 'false' },
    )
    return chip
  }

  const efforts: readonly [EffortRating, string][] = [
    ['too_easy', 'Too easy'],
    ['about_right', 'About right'],
    ['too_hard', 'Too hard'],
  ]

  return el('section', { class: 'screen', 'data-testid': 'screen-post-swim' }, [
    el('h1', {}, ['How was it?']),
    el(
      'div',
      { class: 'tiles' },
      efforts.map(([value, label]) =>
        button(
          label,
          () => {
            onDone({ effort: value, completed, ...(fun === undefined ? {} : { fun }) })
          },
          { class: 'tile', 'data-testid': `effort-${value}` },
        ),
      ),
    ),
    el('div', { class: 'chips' }, [completedToggle]),
    ...funRow,
  ])
}
