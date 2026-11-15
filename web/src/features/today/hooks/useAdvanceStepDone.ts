// B9-44 (TB-02): Done on an Advance Step from Today. It writes the board's mark (PUT /api/cook/marks), the row leaves at once, and a plain
// success toast (R-D, R-D+: no icon) says "Advance Step done" with the meta as its subline, the Step text as its body and Undo, which
// clears the mark. A refused Done keeps the row and shows the error toast. After the last row goes, focus moves to the page's heading
// (the tile is gone with it). React hook: the words come from lib/advanceSteps.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useConnectivity } from '../../../app/useConnectivity'
import { useToast, useUndoToast } from '../../../ui'
import { todayApi } from '../api'
import { doneToast, stepKey } from '../lib/advanceSteps'
import { todayStrings as s } from '../strings'
import type { AdvanceStepDue } from '../types'

const KEY = ['today', 'advance-steps'] as const

export interface AdvanceStepDone {
  markDone: (step: AdvanceStepDue) => Promise<void>
  /** Done needs a connection. */
  offline: boolean
}

export function useAdvanceStepDone(steps: AdvanceStepDue[]): AdvanceStepDone {
  const client = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()
  const { offline } = useConnectivity()
  const pressed = useRef(false)

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: KEY })
    void client.invalidateQueries({ queryKey: ['board'] })
  }, [client])

  // The tile leaves with its last row: focus goes to the page heading instead of being lost.
  useEffect(() => {
    if (!pressed.current || steps.length > 0) return
    pressed.current = false
    const active = document.activeElement
    if (active === null || active === document.body) document.getElementById('page-title')?.focus()
  }, [steps.length])

  const markDone = useCallback(
    async (step: AdvanceStepDue) => {
      try {
        await todayApi.setMark(step.scope, step.step, true)
      } catch {
        toast.show(s.actionFailed, { status: 'error' })
        return
      }
      pressed.current = true
      client.setQueryData<{ steps: AdvanceStepDue[] }>(KEY, (old) => (old ? { steps: old.steps.filter((x) => stepKey(x) !== stepKey(step)) } : old))
      refresh()
      const words = doneToast(step)
      undoToast.show({
        headline: words.headline,
        subline: words.subline,
        body: words.body,
        undo: async () => {
          await todayApi.setMark(step.scope, step.step, false)
          refresh()
        },
      })
    },
    [client, refresh, toast, undoToast],
  )

  return { markDone, offline }
}
