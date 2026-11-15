// B9-39 (TB-01): the clock Today's hero is judged by. It re-renders at the instant `nextChange(now)` names (the hero's start time,
// then its slot time), at the latest every minute, and when the page becomes visible again (a phone that slept past the slot time).
import { useEffect, useRef, useState } from 'react'

/** At most this long between two looks at the clock. */
const MAX_WAIT_MS = 60_000

/** `nextChange(now)`: the next instant (ms since the epoch) the hero changes, or null when nothing is ahead. */
export function useHeroClock(nextChange: (now: Date) => number | null): Date {
  const [now, setNow] = useState(() => new Date())
  const next = useRef(nextChange)
  next.current = nextChange
  // Re-armed whenever the instant to wait for changes (new plan data, or the hero moved on).
  const target = nextChange(now)

  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined
    // The timer re-arms itself from the time it fired, so a start time and then a slot time are both met without a render between.
    const arm = (from: Date) => {
      const at = next.current(from)
      const ahead = at === null ? null : at - from.getTime()
      const wait = ahead !== null && ahead > 0 ? Math.min(ahead, MAX_WAIT_MS) : MAX_WAIT_MS
      id = setTimeout(() => {
        const t = new Date()
        setNow(t)
        arm(t)
      }, wait)
    }
    arm(new Date())
    return () => clearTimeout(id)
  }, [target])

  useEffect(() => {
    const look = () => {
      if (document.visibilityState !== 'hidden') setNow(new Date())
    }
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])

  return now
}
