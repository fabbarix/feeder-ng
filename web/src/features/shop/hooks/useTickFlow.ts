// B9-34 (SSP-01): the one-tap tick, its toast, Undo, Change, Take back. TEST-AUTHOR STUB: the developer writes it.
import type { UnitSystem } from '../../../lib/units'
import type { ChangeTarget } from '../lib/tickAmount'
import type { ListEntry } from '../lib/lines'
import type { TickAddition } from '../types'

export interface UseTickFlowOptions {
  /** the range's last date, as the list answered it; undefined until the list has loaded */
  to: string | undefined
  shopId: number | null
  system: UnitSystem
  /** the Undo toast's duration; omitted = the Undo default (8 s). Scan passes 5000. */
  durationMs?: number
}

export interface TickFlow {
  tick(entry: ListEntry): Promise<void>
  /** the keys of the entries whose tick or untick is in flight */
  pendingKeys: ReadonlySet<string>
  /** the Change sheet's subject, or null */
  changing: ChangeTarget | null
  openChange(target: ChangeTarget): void
  closeChange(): void
  /** Save in the Change sheet (quantity > 0) or "Tick without adding" (0): PATCH the addition. Closes the sheet. */
  change(quantity: number): Promise<void>
  /** Take back one addition of a ticked entry, with the Take back toast. */
  takeBack(entry: ListEntry, addition: TickAddition): Promise<void>
  /** Untick every hand addition (the sheet's "Untick {Line}"), with the Undo toast. */
  untick(entry: ListEntry): Promise<void>
}

export function useTickFlow(_options: UseTickFlowOptions): TickFlow {
  throw new Error('not implemented (B9-34)')
}
