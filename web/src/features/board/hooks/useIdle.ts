import { useEffect, useState } from 'react'

/** The inputs that count as someone at the board. */
const INPUTS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'] as const

/**
 * B9-47 (TB-04): true after `ms` without pointer, touch or key input, false again at once on any input (which restarts the wait).
 * The board's Close control dims while this is true.
 */
export function useIdle(ms = 10_000): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms)
    const wake = () => {
      clearTimeout(timer)
      setIdle(false)
      timer = setTimeout(() => setIdle(true), ms)
    }
    for (const type of INPUTS) window.addEventListener(type, wake, { passive: true, capture: true })
    return () => {
      clearTimeout(timer)
      for (const type of INPUTS) window.removeEventListener(type, wake, { capture: true })
    }
  }, [ms])
  return idle
}
