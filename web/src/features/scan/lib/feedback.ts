// Beep, haptic buzz and the per-device mute (functional spec §10.1, §15 item 8). Plain TypeScript, no React.
// iOS Safari has no vibration API, so there the beep is the only confirmation.

export interface FeedbackDeps {
  /** plays the short beep */
  beep: () => void
  /** navigator.vibrate where it exists (absent on iOS) */
  vibrate?: (pattern: number) => boolean
  /** localStorage-like; reads and writes may throw (private windows) and then the mute simply is not remembered */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
}

export interface Feedback {
  /** a successful read: beep and buzz, unless muted */
  confirm(): void
  /** a failed read: a different, lower buzz; no beep */
  reject(): void
  isMuted(): boolean
  setMuted(muted: boolean): void
  /** false on iOS: the UI can say the beep is the confirmation */
  readonly canVibrate: boolean
}

/** The storage key of the mute flag. */
export const MUTE_KEY = 'feeder.scan.muted'

const CONFIRM_BUZZ_MS = 60
const REJECT_BUZZ_MS = 180

export function createFeedback(deps: FeedbackDeps): Feedback {
  const readStored = (): boolean => {
    try {
      return deps.storage?.getItem(MUTE_KEY) === '1'
    } catch {
      return false
    }
  }
  let muted = readStored()
  const canVibrate = typeof deps.vibrate === 'function'

  return {
    confirm() {
      if (muted) return
      deps.beep()
      if (deps.vibrate) deps.vibrate(CONFIRM_BUZZ_MS)
    },
    reject() {
      if (muted || !deps.vibrate) return
      deps.vibrate(REJECT_BUZZ_MS)
    },
    isMuted: () => muted,
    setMuted(next) {
      muted = next
      try {
        deps.storage?.setItem(MUTE_KEY, next ? '1' : '0')
      } catch {
        // Not remembered across visits; the session keeps the choice.
      }
    },
    canVibrate,
  }
}

/** A beep played through Web Audio (a short 880 Hz tone). Untested glue; returns a no-op where there is no AudioContext. */
export function webAudioBeep(win: { AudioContext?: typeof AudioContext } | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  const Ctx = win?.AudioContext
  if (!Ctx) return () => {}
  let ctx: AudioContext | null = null
  return () => {
    try {
      ctx ??= new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } catch {
      // Audio is blocked: the buzz and the screen still confirm the read.
    }
  }
}
