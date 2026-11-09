import type { AlarmAdapter } from '../adapters/alarm'
import type { SpeechAdapter } from '../adapters/speech'
import type { WakeLockAdapter } from '../adapters/wakeLock'
import type { CookTimer } from '../types'
import type { VoiceCommand } from '../lib/voice'

/**
 * Keeps the screen awake while mounted and active: acquire() on mount, again
 * whenever the document becomes visible, release() on unmount or when `active`
 * turns false. Returns whether the adapter is supported.
 */
export function useWakeLock(_adapter: WakeLockAdapter, _active?: boolean): { supported: boolean } {
  throw new Error('TODO')
}

export interface VoiceOptions {
  adapter: SpeechAdapter
  enabled: boolean
  onCommand(command: VoiceCommand): void
}

/**
 * While enabled and supported, listens through the adapter and calls onCommand
 * with parseCommand(transcript) for every phrase that is a command (other
 * phrases are ignored). Stops when disabled or unmounted. Uses the latest
 * onCommand without restarting the microphone.
 */
export function useVoiceCommands(_opts: VoiceOptions): void {
  throw new Error('TODO')
}

/**
 * Rings the alarm when a timer is seen to turn finished while the page is open
 * (lib/timers.newlyFinished; the first look never rings) and stops it once no
 * finished timer is left (dismissed or cancelled). `ringing` is true meanwhile.
 */
export function useTimerAlarm(_timers: CookTimer[], _alarm: AlarmAdapter, _nowMs?: () => number): { ringing: boolean } {
  throw new Error('TODO')
}

/** Voice commands are off by default; the choice is per device in localStorage `feeder.cook.voice` ("1" = on). Storage errors mean off. */
export function useVoicePreference(): [boolean, (on: boolean) => void] {
  throw new Error('TODO')
}
