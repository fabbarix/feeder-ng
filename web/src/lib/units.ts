// Display formatting for quantities. Plain TypeScript, no React.
// Storage and API values are always metric Base Units (g, ml, piece); the unit system
// is the per-User display choice (team T1 owns the preference and passes it in).

export type UnitSystem = 'metric' | 'imperial'
export type BaseUnit = 'g' | 'ml' | 'piece'

export const GRAMS_PER_OUNCE = 28.349523125
export const GRAMS_PER_POUND = 453.59237
export const ML_PER_TSP = 4.92892159375 // US customary
export const ML_PER_TBSP = 14.78676478125
export const ML_PER_FL_OZ = 29.5735295625
export const ML_PER_CUP = 236.5882365

/**
 * Formats a quantity given in Base Units.
 *
 * metric (never promotes to kg/l, so a shopping line reads "1400 g"):
 *   g -> "250 g", ml -> "250 ml"; at most 1 decimal, trailing ".0" dropped; "0 g".
 *   piece -> "1 piece", otherwise "<n> pieces" (also 0 and fractions: "0.5 pieces").
 * imperial:
 *   g  : below 15.95 oz -> "<oz, 1 decimal> oz" (e.g. 100 g = "3.5 oz");
 *        otherwise "<lb> lb <oz> oz" with whole oz, the oz part omitted when 0
 *        (500 g = "1 lb 2 oz", 453 g = "1 lb", 1000 g = "2 lb 3 oz"); oz rounding to 16 carries to the next lb.
 *   ml : below 14 ml -> tsp to the nearest 1/4 ("1 tsp", "0.25 tsp"), never rendering a positive amount as 0;
 *        below 60 ml -> tbsp to the nearest 1/2 ("2 tbsp", "1.5 tbsp");
 *        below 120 ml -> fl oz, 1 decimal ("3.4 fl oz");
 *        otherwise cups to the nearest 1/4 ("1 cup", "2 cups", "4.25 cups").
 *   piece : as metric.
 * Zero is "0 oz" / "0 fl oz" / "0 g" / "0 ml" / "0 pieces". Negative amounts are formatted as the
 * positive amount with a leading "-". Non-finite input returns "".
 */
export function formatQuantity(amount: number, base: BaseUnit, system: UnitSystem): string {
  void amount
  void base
  void system
  throw new Error('TODO')
}

/** The label of a Base Unit in the system: g/oz, ml/fl oz, piece/piece. */
export function baseUnitLabel(base: BaseUnit, system: UnitSystem): string {
  void base
  void system
  throw new Error('TODO')
}

/**
 * A Unit Conversion as one line, in the display system: "1 clove = 5 g" (metric),
 * "1 clove = 0.2 oz" (imperial; 1 decimal via formatQuantity), "1 bunch = 2 pieces".
 */
export function formatConversion(unit: string, toBase: number, base: BaseUnit, system: UnitSystem): string {
  void unit
  void toBase
  void base
  void system
  throw new Error('TODO')
}
