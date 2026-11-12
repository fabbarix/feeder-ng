// True once `busy` has lasted `ms` (the photo panel says "Preparing the photo…" only then, so a quick intake shows nothing).
import { useEffect, useState } from 'react'

export function useBusyNote(busy: boolean, ms = 300): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!busy) {
      setElapsed(false)
      return
    }
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(timer)
  }, [busy, ms])
  return busy && elapsed
}
