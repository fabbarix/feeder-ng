// B9-20 (RES-02, RES-06): a first launch (no remembered User) while /api/me has not answered: a status from the first
// frame that says what is happening, and the shared ErrorState with Try again when the server cannot be reached.
import { useEffect, useState } from 'react'
import { ErrorState } from '../ui'
import { shellStrings } from './strings'
import './FirstLaunch.css'

/** The "still trying" line comes after this long. */
export const SLOW_AFTER_MS = 3000

const STILL_TRYING = 'Still trying to reach Feeder.'

export function FirstLaunchWaiting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <main className="first-launch" role="status" aria-busy="true">
      <span className="visually-hidden">{shellStrings.loading}</span>
      {slow ? <p className="first-launch__slow">{STILL_TRYING}</p> : null}
    </main>
  )
}

export function FirstLaunchFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="first-launch">
      <ErrorState message={shellStrings.loadError} onRetry={onRetry} />
    </main>
  )
}
