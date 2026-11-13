// H7′: the Supplies group and the Restock reason of a Line (docs/dev/design/household-items.md §4.4). Plain TypeScript, no React.
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { ListEntry } from './lines'

/** Float dust: Stock this close to 0 is none (as on the Supplies list, ingredients/lib/supplyUse.ts). */
const EPS = 1e-9

/**
 * One amount of a Restock reason: a piece is a bare number (at most 1 decimal, as formatQuantity rounds pieces); g and ml go
 * through formatQuantity, so they read like the quantity column of the same row ("1 lb 2 oz", "2 cups" in imperial).
 */
function amountText(amount: number, base: BaseUnit, system: UnitSystem): string {
  if (base === 'piece') return String(Number(amount.toFixed(1)))
  return formatQuantity(amount, base, system)
}

/** "Below 6 · 2 in Stock", "Below 500 ml · 200 ml in Stock", "Below 6 · None in Stock" (no Stock at all). */
export function restockText(restock: { level: number; stock: number }, baseUnit: BaseUnit, system: UnitSystem): string {
  const level = amountText(restock.level, baseUnit, system)
  const stock = restock.stock > EPS ? shopStrings.inStock(amountText(restock.stock, baseUnit, system)) : shopStrings.noneInStock
  return shopStrings.restockReason(level, stock)
}

/** The food entries and the Supply entries of a list, each in the order given. Does not mutate its input. */
export function splitSupplies(entries: ListEntry[]): { food: ListEntry[]; supplies: ListEntry[] } {
  return {
    food: entries.filter((e) => !e.supply),
    supplies: entries.filter((e) => e.supply),
  }
}
