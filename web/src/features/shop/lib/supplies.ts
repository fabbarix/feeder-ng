// H7′: the Supplies group and the Restock reason of a Line (docs/dev/design/household-items.md §4.4). Plain TypeScript, no React.
import { amountOf } from '../../../lib/amountOf'
import type { BaseUnit, UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { ListEntry } from './lines'

/**
 * The Restock reason of a Line, Stock of the Restock level, bare like the Scan rows: "2 of 6", "0 of 20" (no Stock at all,
 * float dust included). Metric g and ml name the unit once when both amounts share it ("200 of 500 ml") and keep both when
 * they do not ("800 g of 1.2 kg"); imperial always keeps both ("7.1 oz of 1 lb 2 oz"). The rule is lib/amountOf.
 */
export function restockText(restock: { level: number; stock: number }, baseUnit: BaseUnit, system: UnitSystem): string {
  const [stock, level] = amountOf(restock.stock, restock.level, baseUnit, system)
  return shopStrings.restockReason(stock, level)
}

/** The food entries and the Supply entries of a list, each in the order given. Does not mutate its input. */
export function splitSupplies(entries: ListEntry[]): { food: ListEntry[]; supplies: ListEntry[] } {
  return {
    food: entries.filter((e) => !e.supply),
    supplies: entries.filter((e) => e.supply),
  }
}
