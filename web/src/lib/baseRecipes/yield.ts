// BR-D (design §13, §3.7): the units a Base recipe's Yield can have, and the Yield a new Base recipe gets from a line.

export const YIELD_UNITS: readonly string[] = []

/**
 * "Add "Béchamel" as a new Base recipe" from a line of 500 ml: Yield 500 ml (the line's amount and unit). A unit that is not a Yield unit
 * (a "cup", a "clove") gives 1 portion. A non-positive or non-finite quantity gives 1 of the unit (or 1 portion).
 */
export function yieldFromLine(quantity: number, unit: string): { yield: number; yieldUnit: string } {
  void quantity; void unit
  throw new Error('BR-D: not implemented')
}
