// SR3: a Price entry for one row becomes the work of one Price edit (shop-scan-proposals.md §13.4 and §13.9; the SR1
// contract PATCH /api/scan/prices). Pure TypeScript, no React. The server costs each weighed scan by its quantity when
// a per kg Price is sent, so the PATCH carries one Price for the row; the per scan prices here are for the screen.
import { weighedPrice } from '../../../ui/lib/perKgPrice'
import { scanStrings } from '../strings'
import type { ScannedRow } from './scannedList'

export type PriceBasis = 'pack' | 'perKg'
export type PriceIntent = 'save' | 'next' | 'close'

/** What the Price entry sheet holds: the typed amount in its basis, and the pack and per kg Prices it implies (null when none). */
export interface PriceEntry {
  basis: PriceBasis
  cents: number | null
  packCents: number | null
  perKgCents: number | null
}

/** One scan's new Price. */
export interface PriceLine {
  clientUuid: string
  priceCents: number
  pricePerKgCents?: number
}

export type PricePlan =
  | { kind: 'discard' }
  | { kind: 'refuse'; error: string }
  | {
      kind: 'save'
      /** the PATCH for the applied scans; null when every scan of the row still waits in the queue */
      patch: { clientUuids: string[]; priceCents: number; pricePerKgCents?: number } | null
      /** the queued scans: their Ops are edited in the queue */
      queued: PriceLine[]
      /** the applied scans, with the Price each of them will cost */
      applied: PriceLine[]
    }

export const PRICE_REFUSED: string = scanStrings.mustBePositive

const positive = (cents: number | null): cents is number => cents !== null && Number.isFinite(cents) && cents > 0

/**
 * The plan for saving a Price on a row. Close with nothing valid discards; Save and Next refuse ("Enter a number above 0").
 * A per kg entry needs both its per kg Price and the pack Price it implies. A row with no live scans has nothing to edit.
 */
export function planPriceEntry(row: ScannedRow, entry: PriceEntry, intent: PriceIntent): PricePlan {
  if (row.scans.length === 0) return { kind: 'discard' }
  const perKg = entry.basis === 'perKg' ? entry.perKgCents : null
  const packCents = entry.basis === 'perKg' ? entry.packCents : entry.cents
  const valid = perKg !== null ? positive(perKg) && positive(entry.packCents) : positive(packCents)
  if (!valid || packCents === null) {
    return intent === 'close' ? { kind: 'discard' } : { kind: 'refuse', error: PRICE_REFUSED }
  }
  const lines = row.scans.map((scan): PriceLine => {
    const line: PriceLine = { clientUuid: scan.clientUuid, priceCents: perKg !== null && scan.weighed ? weighedPrice(perKg, scan.quantity) : packCents }
    if (perKg !== null) line.pricePerKgCents = perKg
    return line
  })
  const queued = lines.filter((_, i) => row.scans[i]!.queued)
  const applied = lines.filter((_, i) => !row.scans[i]!.queued)
  const patch = applied.length > 0 ? { clientUuids: applied.map((l) => l.clientUuid), priceCents: packCents, ...(perKg !== null ? { pricePerKgCents: perKg } : {}) } : null
  return { kind: 'save', patch, queued, applied }
}
