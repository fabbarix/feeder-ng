// Screen Wake Lock adapter. Production uses navigator.wakeLock; tests use FakeWakeLock.

export interface WakeLockAdapter {
  readonly supported: boolean
  /** Keeps the screen awake. Does nothing when already held, or unsupported. Never throws (a refusal is swallowed). */
  acquire(): Promise<void>
  /** Lets the screen sleep again. Safe when not held. */
  release(): Promise<void>
}

export interface SentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<SentinelLike> }
}

/**
 * Wraps nav.wakeLock (default: navigator). The system drops the lock when the
 * tab is hidden and fires `release` on the sentinel; the adapter then counts
 * as not held, so the next acquire() requests a fresh one.
 */
export function createWakeLock(nav: WakeLockNavigator = defaultNavigator()): WakeLockAdapter {
  const api = nav.wakeLock
  let sentinel: SentinelLike | null = null
  return {
    supported: api !== undefined,
    async acquire() {
      if (!api || sentinel) return
      try {
        const held = await api.request('screen')
        sentinel = held
        held.addEventListener('release', () => {
          if (sentinel === held) sentinel = null
        })
      } catch {
        // refused (battery saver, hidden tab): the screen simply may sleep
      }
    },
    async release() {
      const held = sentinel
      sentinel = null
      if (!held) return
      try {
        await held.release()
      } catch {
        // already released by the system
      }
    },
  }
}

function defaultNavigator(): WakeLockNavigator {
  return typeof navigator !== 'undefined' ? (navigator as unknown as WakeLockNavigator) : {}
}
