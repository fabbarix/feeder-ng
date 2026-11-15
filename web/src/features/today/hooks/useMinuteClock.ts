// B9-44 (TB-12): a clock that moves each minute while `on` (the Shopping tile's "last Scan 4 min ago"); it re-renders, it announces nothing.
import { useEffect, useState } from 'react'

export function useMinuteClock(on: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!on) return
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [on])
  return now
}
