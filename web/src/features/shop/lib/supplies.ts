// H7′: the Supplies group and the Restock reason of a Line (docs/dev/design/household-items.md §4.4). Plain TypeScript, no React.
import { restockReason } from '../../../lib/restock'
import type { BaseUnit, UnitSystem } from '../../../lib/units'
import type { ListEntry } from './lines'

/**
 * The Restock reason of a Line (SSP-05, decision SSP 4; the rule is lib/restock): "Below 4 · 2 in Stock", or with `compact`
 * "2 in Stock". A piece count is bare; g and ml read as formatQuantity ("Below 1 l · 400 ml in Stock").
 */
export function restockText(
  restock: { level: number; stock: number },
  baseUnit: BaseUnit,
  system: UnitSystem,
  opts: { compact?: boolean } = {},
): string {
  const reason = restockReason(restock.stock, restock.level, baseUnit, system)
  return opts.compact ? reason.compact : reason.long
}

/** The food entries and the Supply entries of a list, each in the order given. Does not mutate its input. */
export function splitSupplies(entries: ListEntry[]): { food: ListEntry[]; supplies: ListEntry[] } {
  return {
    food: entries.filter((e) => !e.supply),
    supplies: entries.filter((e) => e.supply),
  }
}
