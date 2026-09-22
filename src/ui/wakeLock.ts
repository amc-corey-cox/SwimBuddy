/**
 * Keeps the screen on during a workout, where that is available.
 *
 * A graceful no-op everywhere else, as the spec requires: the API is missing on
 * iOS Safari in some configurations and behind a flag in others, and a workout
 * that refuses to start because the screen might dim would be worse than a screen
 * that dims. The lock is also dropped whenever the page is hidden, so it is
 * re-acquired on the way back.
 */
export interface WakeLock {
  release(): void
}

interface SentinelLike {
  release(): Promise<void>
}

interface NavigatorWithWakeLock {
  wakeLock?: { request(type: 'screen'): Promise<SentinelLike> }
}

export function keepScreenAwake(target: Navigator = navigator): WakeLock {
  const api = (target as NavigatorWithWakeLock).wakeLock
  let sentinel: SentinelLike | undefined
  let released = false

  async function acquire(): Promise<void> {
    if (api === undefined || released || document.visibilityState !== 'visible') return
    try {
      sentinel = await api.request('screen')
    } catch {
      // Denied, or the document was not visible after all. Nothing to do: the
      // workout carries on, the screen just behaves normally.
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void acquire()
  }

  void acquire()
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    release() {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {
        // Already gone, which is the state we wanted anyway.
      })
      sentinel = undefined
    },
  }
}
