import { clear, el } from './dom'
import { distance } from './format'
import { homeScreen } from './screens/home'
import { preSwimScreen } from './screens/preSwim'
import { workoutScreen } from './screens/workout'
import { postSwimScreen, type PostSwimAnswers } from './screens/postSwim'
import { keepScreenAwake, type WakeLock } from './wakeLock'
import { adapt, type Adaptation } from '../core/adaptation'
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

  /**
   * Which render is the current one.
   *
   * `render` awaits storage before it touches the DOM, so two navigations in
   * quick succession — tapping 45 then 60 before the first read comes back —
   * would otherwise both append, and the slower one would win. Every render
   * takes a ticket and stands down if a newer one has been issued since.
   */
  let renderToken = 0

  function releaseWakeLock(): void {
    wakeLock?.release()
    wakeLock = undefined
  }

  async function planFor(
    swimmer: Swimmer,
    minutes: number,
  ): Promise<{ selection: Selection | undefined; adaptation: Adaptation }> {
    const stored = await store.sessions.forSwimmer(swimmer.id)
    const recentSessions = [...stored].sort((a, b) => b.date - a.date)
    const adaptation = adapt(swimmer, recentSessions, now())

    const selection = selectTemplate({
      // Selection sees the adapted swimmer, not the stored one: how much work
      // they are up for today is what decides which template fits the time.
      swimmer: { ...swimmer, load_factor: adaptation.load_factor },
      templates,
      recentSessions,
      requestedMinutes: minutes,
      now: now(),
    })

    return { selection, adaptation }
  }

  function go(next: Screen): void {
    if (next.name !== 'workout') releaseWakeLock()
    screen = next
    void render()
  }

  async function render(): Promise<void> {
    const token = ++renderToken
    const current = screen
    clear(mount)

    if (current.name === 'home') {
      mount.append(
        homeScreen(swimmers, (swimmer) => {
          go({ name: 'pre-swim', swimmer, minutes: DEFAULT_MINUTES })
        }),
      )
      return
    }

    if (current.name === 'pre-swim') {
      const { swimmer, minutes } = current
      const { selection, adaptation } = await planFor(swimmer, minutes)
      if (token !== renderToken) return

      mount.append(
        preSwimScreen(swimmer, minutes, selection, adaptation.reasons, {
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
              workout: resolveTemplate(selection.template, swimmer, {
                loadFactor: adaptation.load_factor,
                sendOffBonusSeconds: adaptation.send_off_bonus_seconds,
                ...(adaptation.weekly_distance_budget === null
                  ? {}
                  : { maxDistance: adaptation.weekly_distance_budget }),
              }),
              index: 0,
            })
          },
        }),
      )
      return
    }

    if (current.name === 'workout') {
      const { swimmer, workout, index } = current
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

    const { swimmer, workout } = current
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

    // The rating only means something if it reaches the next swim. Recomputing
    // from the freshly written history, rather than from what was on screen,
    // keeps the stored load factor a function of what actually happened.
    const history = await store.sessions.forSwimmer(swimmer.id)
    const next = adapt(
      swimmer,
      [...history].sort((a, b) => b.date - a.date),
      now(),
    )

    if (next.load_factor !== swimmer.load_factor) {
      const updated = await store.swimmers.update(swimmer.id, { load_factor: next.load_factor })
      const index = swimmers.findIndex((each) => each.id === swimmer.id)
      if (index >= 0) swimmers[index] = updated
    }
  }

  await render()
}

/** Exported for the settings screen to reach later; unused for now. */
export type { Template, Settings }
