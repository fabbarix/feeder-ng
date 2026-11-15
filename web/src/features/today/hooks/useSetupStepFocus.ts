import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SetupStep, SetupStepId } from '../lib/setup'
import { todayStrings as s } from '../strings'

/**
 * TB-06 (A11Y): when a step completes after its button was pressed here, focus moves to the next step's primary control and a polite
 * status says "Step N of 5 done." (N the step just done). A step that completes elsewhere neither moves focus nor announces. While a sheet
 * the step opened is still up (`holding`: Save and add another keeps it open), the move waits until the sheet has closed.
 */
export function useSetupStepFocus(
  steps: SetupStep[],
  root: RefObject<HTMLElement | null>,
  holding = false,
): { pressed: (id: SetupStepId) => void; announcement: string } {
  const pressedRef = useRef<SetupStepId | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const doneKey = steps.map((x) => (x.done ? '1' : '0')).join('')

  useEffect(() => {
    const id = pressedRef.current
    if (id === null || holding) return
    const index = steps.findIndex((x) => x.id === id)
    if (index < 0 || !steps[index]!.done) return
    pressedRef.current = null
    setAnnouncement(s.setupStepDone(index + 1, steps.length))
    root.current?.querySelector<HTMLElement>('[aria-current="step"] [data-step-primary]')?.focus()
    // Only a change of what is done, or a sheet closing, can complete the move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey, holding])

  const pressed = (id: SetupStepId) => {
    pressedRef.current = id
  }
  return { pressed, announcement }
}
