import { useEffect, useState } from 'react'

/** True once `active` has been true for `ms` milliseconds; false at once when it turns false. Keeps a quick step from flashing a status line. */
export function useAfter(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!active) {
      setElapsed(false)
      return
    }
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(timer)
  }, [active, ms])
  return active && elapsed
}
