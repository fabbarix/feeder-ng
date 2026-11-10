import { useCallback, useState } from 'react'

const COACH_KEY = 'feeder.cook.coach'

/** True when the coach mark was dismissed on this device. Storage errors mean not yet seen. */
function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_KEY) === 'seen'
  } catch {
    return false
  }
}

/**
 * The one-time coach mark for the tablet tap zones. [show, dismiss]: show is true until dismiss() has been called
 * once on this device; the choice is kept in localStorage under `feeder.cook.coach` (value "seen"). Without
 * working storage (private mode) it shows once per mount and never throws.
 */
export function useCoachMark(): [boolean, () => void] {
  const [show, setShow] = useState(() => !alreadySeen())
  const dismiss = useCallback(() => {
    setShow(false)
    try {
      window.localStorage.setItem(COACH_KEY, 'seen')
    } catch {
      // storage blocked: the mark stays dismissed for this mount only
    }
  }, [])
  return [show, dismiss]
}
