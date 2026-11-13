// H7′: the Supplies group and the Restock reason of a Line (docs/dev/design/household-items.md §4.4). Plain TypeScript, no React.
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { ListEntry } from './lines'

/** Float dust: Stock this close to 0 reads 0 (the same tolerance as the Supplies list, ingredients/lib/supplyUse.ts). */
const EPS = 1e-9

/**
 * One amount of a Restock reason: a piece is a bare number (at most 1 decimal, as formatQuantity rounds pieces); g and ml go
 * through formatQuantity, so they read like the quantity column of the same row ("1 lb 2 oz", "2 cups" in imperial).
 */
function amountText(amount: number, base: BaseUnit, system: UnitSystem): string {
  if (base === 'piece') return String(Number(amount.toFixed(1)))
  return formatQuantity(amount, base, system)
}

/** "200 ml" -> ["200", "ml"]; null when the text is not one number and one unit (e.g. "1 lb 2 oz"). */
function numberAndUnit(text: string): [string, string] | null {
  const m = /^(-?[\d.]+) (\S+)$/.exec(text)
  return m ? [m[1]!, m[2]!] : null
}

/**
 * The Restock reason of a Line, Stock of the Restock level, bare like the Scan rows: "2 of 6", "0 of 20" (no Stock at all,
 * float dust included). Metric g and ml name the unit once when both amounts share it ("200 of 500 ml") and keep both when
 * they do not ("800 g of 1.2 kg"); imperial always keeps both ("7.1 oz of 1 lb 2 oz").
 */
export function restockText(restock: { level: number; stock: number }, baseUnit: BaseUnit, system: UnitSystem): string {
  let stock = amountText(restock.stock > EPS ? restock.stock : 0, baseUnit, system)
  const level = amountText(restock.level, baseUnit, system)
  if (baseUnit !== 'piece' && system === 'metric') {
    const s = numberAndUnit(stock)
    const l = numberAndUnit(level)
    if (s && l && s[1] === l[1]) stock = s[0]
  }
  return shopStrings.restockReason(stock, level)
}

/** The food entries and the Supply entries of a list, each in the order given. Does not mutate its input. */
export function splitSupplies(entries: ListEntry[]): { food: ListEntry[]; supplies: ListEntry[] } {
  return {
    food: entries.filter((e) => !e.supply),
    supplies: entries.filter((e) => e.supply),
  }
}
