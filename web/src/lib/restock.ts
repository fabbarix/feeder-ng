// SSP-05 / SSP 4: the one Restock reason for Shop, Pantry and Supplies: "Below 4 · 2 in Stock", compact "2 in Stock".
// Plain TypeScript, no React. Amounts read as formatQuantity writes them, except a piece count, which is bare ("2", "1,250").
import { formatQuantity, grouped, type BaseUnit, type UnitSystem } from './units'

export interface RestockReason {
  /** The full text. */
  long: string
  /** The short form shown in a text column under 12 rem; '' when the long text has no shorter form. */
  compact: string
}

export interface RestockReasonOptions {
  /** False on a Pantry Stock Lot, whose quantity is in the value column: a reason that is not below the level then leaves the Stock out. Default true. */
  stockInReason?: boolean
}

/** Float dust: an amount this close to 0 reads 0 (the server's own tolerance, as amountOf). */
const EPS = 1e-9

/** Stock with float dust (and anything below it) read as 0. */
const clean = (n: number): number => (n > EPS ? n : 0)

/** One amount: a piece count is bare and grouped; g and ml read as formatQuantity ("400 ml", "1.2 kg"). */
function amount(n: number, base: BaseUnit, system: UnitSystem): string {
  return base === 'piece' ? grouped(Math.abs(n), 1) : formatQuantity(n, base, system)
}

/** True when Stock is under the Restock level (at the level is not below). Float dust counts as 0. */
export function isBelowLevel(stock: number, level: number): boolean {
  return clean(stock) < level
}

/**
 * The Restock reason of an Ingredient's Stock against its Restock level:
 * below: "Below 4 · 2 in Stock" (compact "2 in Stock"); not below: "60 in Stock · Restocks below 20" (compact "60 in Stock"),
 * or, with `stockInReason: false`, "Restocks below 20" with no compact form.
 */
export function restockReason(stock: number, level: number, base: BaseUnit, system: UnitSystem, opts: RestockReasonOptions = {}): RestockReason {
  const have = `${amount(clean(stock), base, system)} in Stock`
  const lvl = amount(level, base, system)
  if (isBelowLevel(stock, level)) return { long: `Below ${lvl} · ${have}`, compact: have }
  if (opts.stockInReason === false) return { long: `Restocks below ${lvl}`, compact: '' }
  return { long: `${have} · Restocks below ${lvl}`, compact: have }
}
