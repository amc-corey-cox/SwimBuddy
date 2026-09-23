import { clear, el } from './dom'
import { distance } from './format'
import { homeScreen } from './screens/home'
import { preSwimScreen } from './screens/preSwim'
import { rosterScreen, type RosterDraft } from './screens/roster'
import { workoutScreen, type Participant } from './screens/workout'
import { postSwimScreen, type PostSwimAnswers } from './screens/postSwim'
import { keepScreenAwake, type WakeLock } from './wakeLock'
import { adapt, type Adaptation } from '../core/adaptation'
import { resolveTemplate } from '../core/resolver'
import { selectForPractice, type PracticeSelection } from '../core/selection'
import type { EffortRating, Settings, Swimmer, Template, Uuid } from '../core/types'
import type { SwimBuddyStore } from '../storage/store'

/**
 * The app, as a state machine over the screens.
 *
 * Deliberately one small object rather than a framework: the whole of Swim Buddy
 * is pick who is swimming, pick a length, swim it, say how it went. Everything
 * that decides anything lives in src/core and is unit tested; this only decides
 * what is on screen.
 *
 * A practice is held in memory for its duration. Leaving mid-practice loses it,
 * which is why the wake lock matters — moving it into storage is the next step
 * and the reason the Practice record exists in the spec.
 */

interface Practice {
  readonly template: Template
  readonly members: readonly Participant[]
  /** Set feedback, keyed by swimmer then by the set's position in their workout. */
  readonly flags: Map<Uuid, Map<string, EffortRating>>
}

type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'roster' }
  | { readonly name: 'pre-swim'; readonly swimmers: readonly Swimmer[]; readonly minutes: number }
  | { readonly name: 'workout'; readonly practice: Practice; readonly index: number }
  | { readonly name: 'post-swim'; readonly practice: Practice; readonly rated: number }

export interface AppOptions {
  readonly store: SwimBuddyStore
  readonly mount: HTMLElement
  readonly now?: () => number
}

const DEFAULT_MINUTES = 45

/** The provisional pace a new swimmer starts on, until a test set measures one. */
const DEFAULT_BASE_PACE_SECONDS = 120

export async function startApp(options: AppOptions): Promise<void> {
  const { store, mount } = options
  const now = options.now ?? (() => Date.now())

  const [initialSwimmers, templates, settings] = await Promise.all([
    store.swimmers.list(),
    store.templates.list(),
    store.getSettings(),
  ])

  let swimmers = initialSwimmers

  let screen: Screen = { name: 'home' }
  let selected = new Set<Uuid>(swimmers.length === 1 ? swimmers.map((each) => each.id) : [])
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
    chosen: readonly Swimmer[],
    minutes: number,
  ): Promise<{
    selection: PracticeSelection | undefined
    adaptations: ReadonlyMap<Uuid, Adaptation>
  }> {
    // One reading of the clock for the whole plan. Two would let adaptation and
    // selection land either side of a week boundary and disagree about the same
    // swimmer, which is the sort of bug that only shows up on a Sunday night.
    const at = now()

    const histories = await Promise.all(
      chosen.map(async (swimmer) => {
        const stored = await store.sessions.forSwimmer(swimmer.id)
        return { swimmer, sessions: [...stored].sort((a, b) => b.date - a.date) }
      }),
    )

    const adaptations = new Map<Uuid, Adaptation>(
      histories.map(({ swimmer, sessions }) => [swimmer.id, adapt(swimmer, sessions, at)]),
    )

    const selection = selectForPractice({
      swimmers: histories.map(({ swimmer, sessions }) => {
        const adaptation = adaptations.get(swimmer.id)
        const budget = adaptation?.weekly_distance_budget
        return {
          // Selection sees the adapted swimmer, not the stored one: how much
          // work they are up for today is what decides which arrangement fits.
          swimmer: { ...swimmer, load_factor: adaptation?.load_factor ?? swimmer.load_factor },
          recentSessions: sessions,
          ...(budget === undefined || budget === null ? {} : { weeklyDistanceBudget: budget }),
        }
      }),
      templates,
      requestedMinutes: minutes,
      now: at,
    })

    return { selection, adaptations }
  }

  function go(next: Screen): void {
    if (next.name !== 'workout') releaseWakeLock()
    screen = next
    void render()
  }

  async function refreshSwimmers(): Promise<void> {
    swimmers = await store.swimmers.list()
    // A swimmer removed while selected would otherwise start a practice that
    // cannot be resolved for them.
    selected = new Set([...selected].filter((id) => swimmers.some((each) => each.id === id)))
  }

  async function render(): Promise<void> {
    const token = ++renderToken
    const current = screen
    clear(mount)

    if (current.name === 'home') {
      mount.append(
        homeScreen(
          swimmers,
          selected,
          (swimmer) => {
            if (selected.has(swimmer.id)) selected.delete(swimmer.id)
            else selected.add(swimmer.id)
            void render()
          },
          {
            onStart: (chosen) => {
              go({ name: 'pre-swim', swimmers: chosen, minutes: DEFAULT_MINUTES })
            },
            onRoster: () => {
              go({ name: 'roster' })
            },
          },
        ),
      )
      return
    }

    if (current.name === 'roster') {
      mount.append(
        rosterScreen(swimmers, {
          onAdd: (draft: RosterDraft) => {
            void store.swimmers
              .create({
                name: draft.name,
                base_pace_by_stroke: { free: draft.base_pace_seconds || DEFAULT_BASE_PACE_SECONDS },
                load_factor: 1.0,
                is_youth: draft.is_youth,
              })
              .then(refreshSwimmers)
              .then(render)
          },
          onRename: (swimmer, name) => {
            void store.swimmers.update(swimmer.id, { name }).then(refreshSwimmers).then(render)
          },
          onSetYouth: (swimmer, isYouth) => {
            void store.swimmers
              .update(swimmer.id, { is_youth: isYouth })
              .then(refreshSwimmers)
              .then(render)
          },
          onSetBasePace: (swimmer, seconds) => {
            void store.swimmers
              .update(swimmer.id, {
                base_pace_by_stroke: { ...swimmer.base_pace_by_stroke, free: seconds },
              })
              .then(refreshSwimmers)
              .then(render)
          },
          onRemove: (swimmer) => {
            void store.swimmers.remove(swimmer.id).then(refreshSwimmers).then(render)
          },
          onDone: () => {
            go({ name: 'home' })
          },
        }),
      )
      return
    }

    if (current.name === 'pre-swim') {
      const { swimmers: chosen, minutes } = current
      const { selection, adaptations } = await planFor(chosen, minutes)
      if (token !== renderToken) return

      const adaptationReasons = chosen.flatMap((swimmer) => {
        const reasons = adaptations.get(swimmer.id)?.reasons ?? []
        return chosen.length === 1 ? reasons : reasons.map((r) => `${swimmer.name}: ${r}`)
      })

      mount.append(
        preSwimScreen(chosen, minutes, selection, adaptationReasons, {
          onLengthChange: (next) => {
            go({ name: 'pre-swim', swimmers: chosen, minutes: next })
          },
          onBack: () => {
            go({ name: 'home' })
          },
          onStart: () => {
            if (selection === undefined) return
            go({
              name: 'workout',
              practice: {
                template: selection.template,
                members: chosen.map((swimmer) => {
                  const adaptation = adaptations.get(swimmer.id)
                  const budget = adaptation?.weekly_distance_budget
                  return {
                    swimmer,
                    workout: resolveTemplate(selection.template, swimmer, {
                      loadFactor: adaptation?.load_factor ?? swimmer.load_factor,
                      sendOffBonusSeconds: adaptation?.send_off_bonus_seconds ?? 0,
                      ...(budget === undefined || budget === null ? {} : { maxDistance: budget }),
                    }),
                  }
                }),
                flags: new Map(),
              },
              index: 0,
            })
          },
        }),
      )
      return
    }

    if (current.name === 'workout') {
      const { practice, index } = current
      wakeLock ??= keepScreenAwake()

      const flagsHere = new Map<Uuid, EffortRating>()
      for (const [swimmerId, byPosition] of practice.flags) {
        const rating = byPosition.get(String(index))
        if (rating !== undefined) flagsHere.set(swimmerId, rating)
      }

      mount.append(
        workoutScreen(practice.members, settings, index, flagsHere, {
          onStep: (next) => {
            go({ name: 'workout', practice, index: next })
          },
          onFinish: () => {
            go({ name: 'post-swim', practice, rated: 0 })
          },
          onFlag: (swimmer, rating) => {
            const byPosition = practice.flags.get(swimmer.id) ?? new Map<string, EffortRating>()
            if (rating === undefined) byPosition.delete(String(index))
            else byPosition.set(String(index), rating)
            practice.flags.set(swimmer.id, byPosition)
            void render()
          },
        }),
      )
      return
    }

    const { practice, rated } = current
    const member = practice.members[rated]

    // Everyone has been rated, so the practice is over. The selection goes with
    // it: leaving the tiles lit means the next tap turns somebody off rather
    // than starting the next practice, which reads as the app ignoring you.
    if (member === undefined) {
      selected = new Set()
      go({ name: 'home' })
      return
    }

    mount.append(
      el('p', { class: 'muted', 'data-testid': 'swum' }, [
        distance(member.workout.total_distance, settings.pool_unit),
      ]),
      postSwimScreen(member.swimmer, (answers) => {
        void finish(practice, rated, answers).then(() => {
          go({ name: 'post-swim', practice, rated: rated + 1 })
        })
      }),
    )
  }

  async function finish(
    practice: Practice,
    index: number,
    answers: PostSwimAnswers,
  ): Promise<void> {
    const member = practice.members[index]
    if (member === undefined) return

    const { swimmer, workout } = member

    await store.sessions.create({
      swimmer_id: swimmer.id,
      template_id: workout.template_id,
      date: now(),
      resolved_sets: workout.sections,
      total_distance: workout.total_distance,
      effort_rating: answers.effort,
      completed: answers.completed,
      ...(answers.fun === undefined ? {} : { fun_rating: answers.fun }),
      notes: notesFrom(practice, swimmer.id),
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
      const at = swimmers.findIndex((each) => each.id === swimmer.id)
      if (at >= 0) swimmers[at] = updated
    }
  }

  /**
   * Set feedback, written into the session's notes.
   *
   * The model has nowhere structured to put this yet — `set_feedback` is
   * specified and not built. Notes keep the signal rather than dropping it on
   * the floor while the field is added, and History will read it either way.
   */
  function notesFrom(practice: Practice, swimmerId: Uuid): string {
    const byPosition = practice.flags.get(swimmerId)
    if (byPosition === undefined || byPosition.size === 0) return ''

    return [...byPosition.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(
        ([position, rating]) => `Set ${String(Number(position) + 1)}: ${rating.replace('_', ' ')}`,
      )
      .join('; ')
  }

  await render()
}

export type { Template, Settings }
