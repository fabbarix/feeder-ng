import { useCallback, useEffect, useRef, useState } from 'react'
import type { AlarmAdapter } from '../adapters/alarm'
import type { SpeechAdapter } from '../adapters/speech'
import type { WakeLockAdapter } from '../adapters/wakeLock'
import { finishedIds, newlyFinished } from '../lib/timers'
import { parseCommand, type VoiceCommand } from '../lib/voice'
import type { CookTimer } from '../types'

/**
 * Keeps the screen awake while mounted and active: acquire() on mount, again
 * whenever the document becomes visible, release() on unmount or when `active`
 * turns false. Returns whether the adapter is supported.
 */
export function useWakeLock(adapter: WakeLockAdapter, active = true): { supported: boolean } {
  useEffect(() => {
    if (!active) return
    void adapter.acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void adapter.acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void adapter.release()
    }
  }, [adapter, active])
  return { supported: adapter.supported }
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
export function useVoiceCommands(opts: VoiceOptions): void {
  const { adapter, enabled } = opts
  const latest = useRef(opts.onCommand)
  useEffect(() => {
    latest.current = opts.onCommand
  })
  useEffect(() => {
    if (!enabled || !adapter.supported) return
    adapter.start((text) => {
      const command = parseCommand(text)
      if (command) latest.current(command)
    })
    return () => adapter.stop()
  }, [adapter, enabled])
}

/**
 * Rings the alarm when a timer is seen to turn finished while the page is open
 * (lib/timers.newlyFinished; the first look never rings) and stops it once no
 * finished timer is left (dismissed or cancelled). `ringing` is true meanwhile.
 */
export function useTimerAlarm(timers: CookTimer[], alarm: AlarmAdapter, nowMs: () => number = Date.now): { ringing: boolean } {
  const [ringing, setRinging] = useState(false)
  const seen = useRef<number[] | null>(null)
  const ids = finishedIds(timers, nowMs(), 0)
  const idKey = ids.join(',')

  useEffect(() => {
    const current = idKey === '' ? [] : idKey.split(',').map(Number)
    const fresh = newlyFinished(seen.current, current)
    seen.current = current
    if (current.length === 0) {
      alarm.stop()
      setRinging(false)
      return
    }
    if (fresh.length > 0) {
      alarm.play()
      setRinging(true)
    }
  }, [idKey, alarm])

  useEffect(() => () => alarm.stop(), [alarm])
  return { ringing }
}

const VOICE_KEY = 'feeder.cook.voice'

function readVoice(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) === '1'
  } catch {
    return false
  }
}

/** Voice commands are off by default; the choice is per device in localStorage `feeder.cook.voice` ("1" = on). Storage errors mean off. */
export function useVoicePreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readVoice)
  const set = useCallback((next: boolean) => {
    setOn(next)
    try {
      if (next) window.localStorage.setItem(VOICE_KEY, '1')
      else window.localStorage.removeItem(VOICE_KEY)
    } catch {
      // storage blocked: the choice still holds for this page
    }
  }, [])
  return [on, set]
}

/** True while the media query matches (false where matchMedia is missing). */
export function useMediaQuery(query: string): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
