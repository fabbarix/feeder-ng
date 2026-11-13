// H7′: the Supplies group and the Restock reason of a Line (docs/dev/design/household-items.md §4.4). Plain TypeScript, no React.
import { baseUnitLabel, formatQuantity, GRAMS_PER_OUNCE, ML_PER_FL_OZ, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { ListEntry } from './lines'

/** One amount of a Restock reason: a piece is a bare number; g and ml follow the display unit system. */
function amountText(amount: number, base: BaseUnit, system: UnitSystem): string {
  if (base === 'piece') return String(amount)
  if (system === 'metric') return formatQuantity(amount, base, 'metric')
  const perUnit = base === 'g' ? GRAMS_PER_OUNCE : ML_PER_FL_OZ
  return `${Number((amount / perUnit).toFixed(1))} ${baseUnitLabel(base, 'imperial')}`
}

/** "Below 6 · 2 in Stock", "Below 500 ml · 200 ml in Stock", "Below 6 · None in Stock" (no Stock at all). */
export function restockText(restock: { level: number; stock: number }, baseUnit: BaseUnit, system: UnitSystem): string {
  const level = amountText(restock.level, baseUnit, system)
  const stock = restock.stock > 0 ? shopStrings.inStock(amountText(restock.stock, baseUnit, system)) : shopStrings.noneInStock
  return shopStrings.restockReason(level, stock)
}

/** The food entries and the Supply entries of a list, each in the order given. Does not mutate its input. */
export function splitSupplies(entries: ListEntry[]): { food: ListEntry[]; supplies: ListEntry[] } {
  return {
    food: entries.filter((e) => !e.supply),
    supplies: entries.filter((e) => e.supply),
  }
}
