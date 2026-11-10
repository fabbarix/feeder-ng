// Display formatting for quantities. Plain TypeScript, no React.
// Storage and API values are always metric Base Units (g, ml, piece); the unit system
// is the per-User display choice (team T1 owns the preference and passes it in).

export type UnitSystem = 'metric' | 'imperial'
export type BaseUnit = 'g' | 'ml' | 'piece'

// Same numbers as internal/units (Go): keep them identical.
export const GRAMS_PER_OUNCE = 28.349523125
export const GRAMS_PER_POUND = 453.59237
export const ML_PER_TSP = 4.92892159375 // US customary: 1/6 fl oz
export const ML_PER_TBSP = 14.78676478125 // 1/2 fl oz
export const ML_PER_FL_OZ = 29.5735295625
export const ML_PER_CUP = 236.5882365 // 8 fl oz

/** Imperial mass switches from plain ounces to pounds and ounces at this many oz. */
const POUND_THRESHOLD_OZ = 15.95

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
  if (!Number.isFinite(amount)) return ''
  if (base === 'piece') {
    return withSign(amount, (abs) => `${trim(abs, 1)} ${abs === 1 ? 'piece' : 'pieces'}`)
  }
  if (system === 'metric') {
    return withSign(amount, (abs) => `${trim(abs, 1)} ${base}`)
  }
  return base === 'g'
    ? withSign(amount, imperialMass)
    : withSign(amount, imperialVolume)
}

/** The label of a Base Unit in the system: g/oz, ml/fl oz, piece/piece. */
export function baseUnitLabel(base: BaseUnit, system: UnitSystem, _count?: number): string {
  if (base === 'piece') return 'piece'
  if (base === 'g') return system === 'imperial' ? 'oz' : 'g'
  return system === 'imperial' ? 'fl oz' : 'ml'
}

/**
 * A Unit Conversion as one line, in the display system: "1 clove = 5 g" (metric),
 * "1 clove = 0.2 oz" (imperial; 1 decimal via formatQuantity), "1 bunch = 2 pieces".
 */
export function formatConversion(unit: string, toBase: number, base: BaseUnit, system: UnitSystem): string {
  if (system === 'imperial' && base !== 'piece') return `1 ${unit} = ${imperialBaseSide(toBase, base)}`
  return `1 ${unit} = ${formatQuantity(toBase, base, system)}`
}

/**
 * A quantity as the author wrote it, in the User's display system (recipe lines, Step uses).
 * Rule: only metric mass and volume units (g, kg, ml, l, dl, cl) are converted to imperial, through
 * formatQuantity ("250 g" -> "8.8 oz", "1 l" -> "4.25 cups"). Everything else (tsp, tbsp, cup, piece,
 * an Ingredient's own conversion unit such as "clove") is shown as written, in both systems:
 * "2 tbsp" stays "2 tbsp". Metric shows g and ml via formatQuantity and the rest as written.
 * Numbers: at most 2 decimals, trailing zeros dropped. Unit matching is trimmed and case-insensitive.
 */
export function formatLineQuantity(quantity: number, unit: string, system: UnitSystem): string {
  if (!Number.isFinite(quantity)) return ''
  const u = unit.trim().toLowerCase()
  const metric = LINE_METRIC_UNITS[u]
  if (metric && (system === 'imperial' || u === 'g' || u === 'ml')) {
    return formatQuantity(quantity * metric.factor, metric.base, system)
  }
  return `${trim(quantity, 2)} ${u}`
}

/** Metric mass and volume units a recipe line may be written in, with their factor to the Base Unit. */
const LINE_METRIC_UNITS: Record<string, { base: BaseUnit; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  dl: { base: 'ml', factor: 100 },
  cl: { base: 'ml', factor: 10 },
}

/**
 * The imperial base side of a Unit Conversion: oz for g, fl oz for ml, 1 decimal (2 when 1 would
 * show 0, so a positive amount never reads 0). Never tsp, tbsp, cup or lb.
 */
function imperialBaseSide(toBase: number, base: BaseUnit): string {
  const perOunce = base === 'g' ? GRAMS_PER_OUNCE : ML_PER_FL_OZ
  const unit = base === 'g' ? 'oz' : 'fl oz'
  return withSign(toBase, (abs) => {
    const oz = abs / perOunce
    const digits = Number(oz.toFixed(1)) === 0 && oz !== 0 ? 2 : 1
    return `${trim(oz, digits)} ${unit}`
  })
}

/** Applies the sign of amount to the body formatted from its absolute value. */
function withSign(amount: number, body: (abs: number) => string): string {
  return (amount < 0 ? '-' : '') + body(Math.abs(amount))
}

/** Rounds to a fixed number of decimals and drops trailing zeros ("3.50" -> "3.5"). */
function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)))
}

/** Rounds x to the nearest multiple of step. */
function nearest(x: number, step: number): number {
  return Math.round(x / step) * step
}

function imperialMass(abs: number): string {
  const oz = abs / GRAMS_PER_OUNCE
  if (oz < POUND_THRESHOLD_OZ) return `${trim(oz, 1)} oz`
  const totalOz = Math.round(oz)
  const lb = Math.floor(totalOz / 16)
  const rest = totalOz % 16
  return rest === 0 ? `${lb} lb` : `${lb} lb ${rest} oz`
}

function imperialVolume(abs: number): string {
  if (abs === 0) return '0 fl oz'
  if (abs < 14) return `${trim(Math.max(nearest(abs / ML_PER_TSP, 0.25), 0.25), 2)} tsp`
  if (abs < 60) return `${trim(nearest(abs / ML_PER_TBSP, 0.5), 1)} tbsp`
  if (abs < 120) return `${trim(abs / ML_PER_FL_OZ, 1)} fl oz`
  const cups = nearest(abs / ML_PER_CUP, 0.25)
  return `${trim(cups, 2)} ${cups === 1 ? 'cup' : 'cups'}`
}
