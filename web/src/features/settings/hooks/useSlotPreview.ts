// The dry-run preview of a multi-day Meal Slot edit that takes Courses off. STUB (CRS D2 design step).
import type { SlotBatchRequest, SlotBatchResult, SlotRemoves } from '../types'

export interface SlotPreviewState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  removes: SlotRemoves | undefined
}

/**
 * Runs `run({ ...request, dryRun: true })` whenever `request` changes to a new one that is not null, and answers the latest
 * result only (an older answer that arrives late is dropped). A null request is `idle` and runs nothing.
 */
export function useSlotPreview(_request: SlotBatchRequest | null, _run: (request: SlotBatchRequest) => Promise<SlotBatchResult>): SlotPreviewState {
  throw new Error('not implemented')
}
