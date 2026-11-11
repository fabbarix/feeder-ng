// The dry-run preview of a multi-day Meal Slot edit that takes Courses off.
import { useEffect, useState } from 'react'
import type { SlotBatchRequest, SlotBatchResult, SlotRemoves } from '../types'

export interface SlotPreviewState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  removes: SlotRemoves | undefined
}

const IDLE: SlotPreviewState = { status: 'idle', removes: undefined }

/**
 * Runs `run({ ...request, dryRun: true })` whenever `request` changes to a new one that is not null, and answers the latest
 * result only (an older answer that arrives late is dropped). A null request is `idle` and runs nothing.
 */
export function useSlotPreview(request: SlotBatchRequest | null, run: (request: SlotBatchRequest) => Promise<SlotBatchResult>): SlotPreviewState {
  const key = request === null ? null : JSON.stringify(request)
  const [state, setState] = useState<SlotPreviewState>(IDLE)

  useEffect(() => {
    if (request === null) {
      setState(IDLE)
      return
    }
    let live = true
    setState({ status: 'loading', removes: undefined })
    run({ ...request, dryRun: true }).then(
      (result) => {
        if (live) setState({ status: 'ready', removes: result.removes })
      },
      () => {
        if (live) setState({ status: 'error', removes: undefined })
      },
    )
    return () => {
      live = false
    }
    // Runs once per distinct request (its JSON), not per object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
