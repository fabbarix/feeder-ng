// BR-D (design §3.1, §3.7): the units a Base recipe's Yield can have, and the Yield a new Base recipe gets from a line.

/** The Yield units: the weights and volumes of the global units (cup among them), piece and portion (design §3.1). */
export const YIELD_UNITS: readonly string[] = ['g', 'kg', 'ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup', 'piece', 'portion']

/** The Yield amount of a Base recipe's shown text: "1 l", "300 g", "8 portions", "1 portion"; null unit = a plannable Recipe's portions. */
export function yieldText(amount: number, unit: string | null | undefined): string {
  if (!unit) return `${amount} ${amount === 1 ? 'portion' : 'portions'}`
  if (unit === 'portion') return `${amount} ${amount === 1 ? 'portion' : 'portions'}`
  if (unit === 'piece') return `${amount} ${amount === 1 ? 'piece' : 'pieces'}`
  return `${amount} ${unit}`
}

/**
 * "Add "Béchamel" as a new Base recipe" from a line of 500 ml: Yield 500 ml (the line's amount and unit). A unit that is not a Yield unit
 * (a "clove", a "pinch") gives 1 portion. A non-positive or non-finite quantity gives 1 of the unit (or 1 portion).
 */
export function yieldFromLine(quantity: number, unit: string): { yield: number; yieldUnit: string } {
  const u = unit.trim().toLowerCase()
  const isYield = YIELD_UNITS.includes(u)
  if (!Number.isFinite(quantity) || quantity <= 0) return { yield: 1, yieldUnit: isYield ? u : 'portion' }
  return isYield ? { yield: quantity, yieldUnit: u } : { yield: 1, yieldUnit: 'portion' }
}

/** The Base Unit a Yield unit converts to (design §3.2): the weights to g, the volumes to ml, piece and portion to piece; null for another unit. */
export function baseUnitOfYield(yieldUnit: string): 'g' | 'ml' | 'piece' | null {
  if (yieldUnit === 'g' || yieldUnit === 'kg') return 'g'
  if (['ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup'].includes(yieldUnit)) return 'ml'
  if (yieldUnit === 'piece' || yieldUnit === 'portion') return 'piece'
  return null
}

/** A Base recipe turned back into a plannable Recipe: its amount becomes whole portions (at least 1); a blank or not-a-number Yield is 4 portions. */
export function portionsYield(amount: number): number {
  if (!Number.isFinite(amount)) return 4
  return Math.max(1, Math.round(amount))
}

