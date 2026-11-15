// B9-49 (TB-14): Today as a notification's landing. Once Today's data is ready it reads `?step=` and `?leftover=` (lib/landing), acts on
// them once and clears them with `replace`, so Back never replays a landing:
//   an Advance Step still open is rung for RING_MS (`ringed`) and the screen focuses its Done; one already done gets a notice;
//   a Leftover still waiting has its action sheet opened; one already answered gets a notice.
// The hook knows nothing of tiles: the screen says what is true and what to do. TodayScreen wires it (B9-44's file).
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { hasLanding, landingNotices, parseLanding, withoutLanding, type StepLanding } from '../lib/landing'

export const RING_MS = 2000

export interface TodayLandingInput {
  /** Today's data has loaded: until then nothing is judged (an empty screen would say every Step is done). */
  ready: boolean
  /** The Advance Step is on Today and not done. */
  hasOpenStep: (scope: string, index: number) => boolean
  /** The Leftover is on Today and not answered. */
  hasOpenLeftover: (id: number) => boolean
  /** Scroll to the Step's row and focus its Done (the ring itself is `ringed`). */
  onRingStep: (scope: string, index: number) => void
  /** Open the Leftover's action sheet. */
  onOpenLeftover: (id: number) => void
  /** A transient notice (a toast). */
  onNotice: (text: string) => void
}

export interface TodayLanding {
  /** The Step to draw the ring on while it lasts, else null. */
  ringed: StepLanding | null
}

export function useTodayLanding(input: TodayLandingInput): TodayLanding {
  const [params, setParams] = useSearchParams()
  const [ringed, setRinged] = useState<StepLanding | null>(null)
  const latest = useRef(input)
  latest.current = input
  const search = params.toString()
  const { ready } = input

  useEffect(() => {
    if (!ready) return
    const current = new URLSearchParams(search)
    if (!hasLanding(current)) return
    const { step, leftover } = parseLanding(current)
    const i = latest.current
    if (step) {
      if (i.hasOpenStep(step.scope, step.index)) {
        i.onRingStep(step.scope, step.index)
        setRinged(step)
      } else {
        i.onNotice(landingNotices.stepDone)
      }
    }
    if (leftover !== undefined) {
      if (i.hasOpenLeftover(leftover)) i.onOpenLeftover(leftover)
      else i.onNotice(landingNotices.leftoverAnswered)
    }
    setParams(withoutLanding(current), { replace: true })
  }, [ready, search, setParams])

  useEffect(() => {
    if (!ringed) return
    const timer = setTimeout(() => setRinged(null), RING_MS)
    return () => clearTimeout(timer)
  }, [ringed])

  return { ringed }
}
