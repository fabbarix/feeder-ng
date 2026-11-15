// B9-43 (SSP-14): "Get something else…". STUB (test author).
import type { ListEntry } from '../lib/lines'
import type { ExtraInput } from '../types'

export interface Substitute {
  /** the Line being swapped; null while idle (the Add to Shopping List sheet is open exactly while this is set) */
  target: ListEntry | null
  start(entry: ListEntry): void
  cancel(): void
  /**
   * Save in the Add to Shopping List sheet: adds the extra, then takes the Line off the list for the range (Not needed), then ONE toast
   * "Onion is Not needed; Shallot added" whose Undo puts the Line back and deletes the extra. `addedName` is the new thing's name.
   */
  submit(input: ExtraInput, addedName: string): Promise<void>
}

export interface UseSubstituteOptions {
  to: string | undefined
  shopId: number | null
}

export function useSubstitute(_options: UseSubstituteOptions): Substitute {
  throw new Error('not implemented (B9-43)')
}
