// "x of y" amounts in one Base Unit, shared by the Shop screen's Restock reason ("2 of 6") and the Scanned row's Line cover
// ("250 of 375 g"). Each feature joins the two texts with its own copy. Plain TypeScript, no React.
import { formatQuantity, type BaseUnit, type UnitSystem } from './units'

/** Float dust: an amount this close to 0 reads 0 (the server's own tolerance). */
const EPS = 1e-9

/** One amount: a piece is a bare number (at most 1 decimal, as formatQuantity rounds pieces); g and ml read as formatQuantity. */
function amountText(amount: number, base: BaseUnit, system: UnitSystem): string {
  if (base === 'piece') return String(Number(amount.toFixed(1)))
  return formatQuantity(amount, base, system)
}

/** "200 ml" -> ["200", "ml"]; null when the text is not one number and one unit ("1 lb 2 oz"). */
function numberAndUnit(text: string): [string, string] | null {
  const m = /^(-?[\d.]+) (\S+)$/.exec(text)
  return m ? [m[1]!, m[2]!] : null
}

/**
 * The two texts of "x of y": pieces are bare ("2", "6"); metric g and ml name the unit once, on y, when both amounts share it
 * ("250", "375 g") and keep both when they do not ("800 g", "1.2 kg"); imperial always keeps both ("7.1 oz", "1 lb 2 oz").
 * An x within float dust of 0 (or below it) reads 0.
 */
export function amountOf(x: number, y: number, base: BaseUnit, system: UnitSystem): [string, string] {
  let a = amountText(x > EPS ? x : 0, base, system)
  const b = amountText(y, base, system)
  if (base !== 'piece' && system === 'metric') {
    const pa = numberAndUnit(a)
    const pb = numberAndUnit(b)
    if (pa && pb && pa[1] === pb[1]) a = pa[0]
  }
  return [a, b]
}

/**
 * The "x of y" text of two amounts (b8-polish): "400 of 1000 ml"; with `compact` the "x/y" form, "400/1000 ml", "2/6". The unit
 * rules are amountOf's: one unit on y when both amounts share it, and a 0 for float dust.
 */
export function amountOfText(x: number, y: number, base: BaseUnit, system: UnitSystem, opts: { compact?: boolean } = {}): string {
  const [a, b] = amountOf(x, y, base, system)
  return opts.compact ? `${a}/${b}` : `${a} of ${b}`
}
