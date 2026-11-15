// B9-39 (TB-01): what Today's polite live region says when a slot whose time has come joins To confirm ("Lunch moved to To confirm.").
// Nothing is said for what was already there when Today opened (or when the plan first loaded), and focus never moves.
import { useEffect, useRef, useState } from 'react'
import { movedToConfirm } from '../lib/hero'
import type { PlanEntry } from '../types'

/** `served`: the just-served rows (lib/hero justServed); `ready`: the plan has loaded, so its first answer is not news. */
export function useMovedToConfirm(served: PlanEntry[], ready: boolean): string {
  const before = useRef<PlanEntry[] | null>(null)
  const [message, setMessage] = useState('')
  const key = served.map((e) => `${e.date}/${e.mealSlotId}`).join('|')

  useEffect(() => {
    if (!ready) return
    setMessage(movedToConfirm(before.current, served))
    before.current = served
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the slots in the list are the dependency
  }, [key, ready])

  return message
}
