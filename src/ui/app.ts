import { clear, el } from './dom'
import { distance } from './format'
import { homeScreen } from './screens/home'
import { preSwimScreen } from './screens/preSwim'
import { workoutScreen } from './screens/workout'
import { postSwimScreen, type PostSwimAnswers } from './screens/postSwim'
import { keepScreenAwake, type WakeLock } from './wakeLock'
import { resolveTemplate } from '../core/resolver'
import { selectTemplate, type Selection } from '../core/selection'
import type { ResolvedWorkout, Settings, Swimmer, Template } from '../core/types'
import type { SwimBuddyStore } from '../storage/store'

/**
 * The app, as a state machine over four screens.
 *
 * Deliberately one small object rather than a framework: the whole of Swim Buddy
 * is pick a swimmer, pick a length, swim it, say how it went. Everything that
 * decides anything lives in src/core and is unit tested; this only decides what
 * is on screen.
 *
 * The resolved workout is held in memory for the length of the swim. Leaving
 * mid-workout loses it, which is why the wake lock matters and why a workout is
 * only written to storage once it has been rated.
 */
type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'pre-swim'; readonly swimmer: Swimmer; readonly minutes: number }
  | {
      readonly name: 'workout'
      readonly swimmer: Swimmer
      readonly workout: ResolvedWorkout
      readonly index: number
    }
  | {
      readonly name: 'post-swim'
      readonly swimmer: Swimmer
      readonly workout: ResolvedWorkout
    }

export interface AppOptions {
  readonly store: SwimBuddyStore
  readonly mount: HTMLElement
  readonly now?: () => number
}

const DEFAULT_MINUTES = 45

export async function startApp(options: AppOptions): Promise<void> {
  const { store, mount } = options
  const now = options.now ?? (() => Date.now())

  const [swimmers, templates, settings] = await Promise.all([
    store.swimmers.list(),
    store.templates.list(),
    store.getSettings(),
  ])

  let screen: Screen = { name: 'home' }
  let wakeLock: WakeLock | undefined

  function releaseWakeLock(): void {
    wakeLock?.release()
    wakeLock = undefined
  }

  async function chooseFor(swimmer: Swimmer, minutes: number): Promise<Selection | undefined> {
    const recentSessions = await store.sessions.forSwimmer(swimmer.id)
    return selectTemplate({
      swimmer,
      templates,
      recentSessions: [...recentSessions].sort((a, b) => b.date - a.date),
      requestedMinutes: minutes,
      now: now(),
    })
  }

  function go(next: Screen): void {
    if (next.name !== 'workout') releaseWakeLock()
    screen = next
    void render()
  }

  async function render(): Promise<void> {
    clear(mount)

    if (screen.name === 'home') {
      mount.append(
        homeScreen(swimmers, (swimmer) => {
          go({ name: 'pre-swim', swimmer, minutes: DEFAULT_MINUTES })
        }),
      )
      return
    }

    if (screen.name === 'pre-swim') {
      const { swimmer, minutes } = screen
      const selection = await chooseFor(swimmer, minutes)

      mount.append(
        preSwimScreen(swimmer, minutes, selection, {
          onLengthChange: (next) => {
            go({ name: 'pre-swim', swimmer, minutes: next })
          },
          onBack: () => {
            go({ name: 'home' })
          },
          onStart: () => {
            if (selection === undefined) return
            go({
              name: 'workout',
              swimmer,
              workout: resolveTemplate(selection.template, swimmer),
              index: 0,
            })
          },
        }),
      )
      return
    }

    if (screen.name === 'workout') {
      const { swimmer, workout, index } = screen
      wakeLock ??= keepScreenAwake()

      mount.append(
        workoutScreen(workout, settings, index, {
          onStep: (next) => {
            go({ name: 'workout', swimmer, workout, index: next })
          },
          onFinish: () => {
            go({ name: 'post-swim', swimmer, workout })
          },
        }),
      )
      return
    }

    const { swimmer, workout } = screen
    mount.append(
      el('p', { class: 'muted', 'data-testid': 'swum' }, [
        distance(workout.total_distance, settings.pool_unit),
      ]),
      postSwimScreen(swimmer, (answers) => {
        void finish(swimmer, workout, answers).then(() => {
          go({ name: 'home' })
        })
      }),
    )
  }

  async function finish(
    swimmer: Swimmer,
    workout: ResolvedWorkout,
    answers: PostSwimAnswers,
  ): Promise<void> {
    await store.sessions.create({
      swimmer_id: swimmer.id,
      template_id: workout.template_id,
      date: now(),
      resolved_sets: workout.sections,
      total_distance: workout.total_distance,
      effort_rating: answers.effort,
      completed: answers.completed,
      ...(answers.fun === undefined ? {} : { fun_rating: answers.fun }),
      notes: '',
    })
  }

  await render()
}

/** Exported for the settings screen to reach later; unused for now. */
export type { Template, Settings }
