// Beep, haptic buzz and the per-device mute (functional spec §10.1, §15 item 8). Plain TypeScript, no React.
// iOS Safari has no vibration API, so there the beep is the only confirmation. Stubs until implemented.

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

export function createFeedback(deps: FeedbackDeps): Feedback {
  void deps
  throw new Error('not implemented')
}

/** A beep played through Web Audio (a short 880 Hz tone). Untested glue; returns a no-op where there is no AudioContext. */
export function webAudioBeep(win: { AudioContext?: typeof AudioContext } | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  void win
  throw new Error('not implemented')
}
