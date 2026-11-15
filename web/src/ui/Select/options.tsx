import { Avatar } from '../Avatar'
import { Chip } from '../Chip'
import { Icon } from '../Icon'
import { RecipeThumb } from '../RecipeThumb'
import { Thumb } from '../Thumb'
import { mealSlotIcon } from '../lib/mealSlotIcon'
import type { SelectOption } from './lib'
import { COMMON_CURRENCIES, currencyFacts, deviceTimeZone, supportedCurrencies, supportedTimeZones, zoneFacts } from './intlChoices'
import { selectStrings } from './strings'

export { supportedCurrencies, supportedTimeZones } from './intlChoices'
export type { IntlLike } from './intlChoices'

export interface RecipeChoice {
  id: number
  name: string
  imageUrl?: string
  tags: string[]
  totalMinutes?: number
  /** ISO date of the last Cooked Meal, if any. */
  lastCookedAt?: string | null
  /** B9-15: a Ready Meal reads "Ready Meal" instead of a time. */
  readyMeal?: boolean
}
export interface IngredientChoice {
  /** Absent for a not-yet-saved Ingredient; then `key` identifies it. */
  id?: number
  /** Temporary key of a not-yet-saved Ingredient (WP3b follow-up). */
  key?: string
  name: string
  baseUnit: string
  /** PE: the Ingredient's Picture address; the option draws a Thumb (an empty slot without it). */
  imageUrl?: string
  /** BR-D: set when this is a Base recipe's Ingredient: the option shows the "Base recipe" badge. A plain Ingredient of the same name is a second option. */
  baseRecipe?: { id: number; name: string; archived: boolean } | null
  /** Pantry (H6): the subheader this Ingredient is listed under ("Ingredients", "Supplies"); absent = no subheaders. */
  group?: string
}
export interface UnitChoices {
  baseUnit: string
  conversions: { unit: string; toBase: number }[]
  globalUnits: string[]
}
export interface ShopChoice {
  id: number
  name: string
  /** b8-shop: the value a chip shows instead of the name when its row has no room for the name (B9-15: the option's shortLabel). */
  shortName?: string
}
export interface MealSlotChoice {
  id: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
  name: string
  /** "HH:mm". */
  time: string
}
export interface MemberChoice {
  id: number
  name: string
  /** PE: the Member's Photo address, then `avatar` (emoji), then the initials. */
  photoUrl?: string
  avatar?: string
  /** PE: the Member colour, "#rrggbb" (the Avatar's ring). */
  colour?: string
}

export const ENGLISH_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** SET-06: "30 min", "1 h", "1 h 15 min", "6 h"; 0 or no time gives nothing (never "0 min"). */
export function recipeTime(minutes: number | undefined): string | undefined {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return undefined
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

/** meta "35 min", "1 h 15 min" or "Ready Meal"; keywords = tags; leading = RecipeThumb. */
export function recipeOptions(recipes: RecipeChoice[]): SelectOption<number>[] {
  return recipes.map((r) => ({
    value: r.id,
    label: r.name,
    meta: r.readyMeal ? selectStrings.readyMeal : recipeTime(r.totalMinutes),
    keywords: r.tags,
    leading: <RecipeThumb name={r.name} photoUrl={r.imageUrl} tags={r.tags} size={40} initial={false} />,
  }))
}

/** Name key for the same-name pairs: case and accents aside, spacing collapsed. */
const nameKey = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The order the caller gave is kept. BR-D: on an exact name tie (case and accents aside) a Base recipe's Ingredient takes the earlier of the two
 * places, the plain one the later; the Ingredients between them stay where they were.
 * Value = id, or the temporary key of a not-yet-saved Ingredient; meta = the Base Unit (once); a Base recipe's Ingredient carries the "Base recipe" badge.
 */
export function ingredientOptions(ingredients: IngredientChoice[]): SelectOption<number | string>[] {
  const order = [...ingredients]
  const byName = new Map<string, number[]>()
  ingredients.forEach((i, index) => {
    const k = nameKey(i.name)
    byName.set(k, [...(byName.get(k) ?? []), index])
  })
  for (const slots of byName.values()) {
    const baseAt = slots.find((index) => ingredients[index]!.baseRecipe)
    if (slots.length < 2 || baseAt === undefined) continue
    const ordered = [baseAt, ...slots.filter((index) => index !== baseAt)]
    slots.forEach((slot, n) => {
      order[slot] = ingredients[ordered[n]!]!
    })
  }
  return order.map((i) => ({
    value: (i.id ?? i.key)!,
    label: i.name,
    meta: selectStrings.baseUnitMeta(i.baseUnit),
    leading: <Thumb name={i.name} imageUrl={i.imageUrl} size={40} />,
    group: i.group,
    preferred: i.baseRecipe ? true : undefined,
    badge: i.baseRecipe ? (
      <Chip kind="tag" icon="cook">
        {selectStrings.baseRecipeBadge}
      </Chip>
    ) : undefined,
  }))
}

/** Groups "Base Unit", "Unit Conversions" (meta "1 clove = 5 g"), "Units"; a unit never repeats across groups. */
export function unitOptions(units: UnitChoices): SelectOption<string>[] {
  const out: SelectOption<string>[] = [{ value: units.baseUnit, label: units.baseUnit, group: 'Base Unit' }]
  const seen = new Set<string>([units.baseUnit])
  for (const c of units.conversions) {
    if (seen.has(c.unit)) continue
    seen.add(c.unit)
    out.push({ value: c.unit, label: c.unit, meta: `1 ${c.unit} = ${c.toBase} ${units.baseUnit}`, group: 'Unit Conversions' })
  }
  for (const unit of units.globalUnits) {
    if (seen.has(unit)) continue
    seen.add(unit)
    out.push({ value: unit, label: unit, group: 'Units' })
  }
  return out
}

/** Input order; leading = Storefront icon. */
export function shopOptions(shops: ShopChoice[]): SelectOption<number>[] {
  return shops.map((s) => ({
    value: s.id,
    label: s.name,
    ...(s.shortName ? { shortLabel: s.shortName } : {}),
    leading: <Icon name="shops" size={20} />,
  }))
}

/** Grouped by weekday name, ordered by weekday then time; label = name, meta = time; leading = slot icon. */
export function mealSlotOptions(slots: MealSlotChoice[], weekdayNames: string[] = ENGLISH_WEEKDAYS): SelectOption<number>[] {
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
  return ordered.map((s) => ({
    value: s.id,
    label: s.name,
    triggerLabel: `${(weekdayNames[s.weekday - 1] ?? String(s.weekday)).slice(0, 3)} · ${s.name}`,
    meta: s.time,
    group: weekdayNames[s.weekday - 1] ?? String(s.weekday),
    leading: <Icon name={mealSlotIcon(s.name)} size={20} />,
  }))
}

/** leading = Avatar. */
export function memberOptions(members: MemberChoice[]): SelectOption<number>[] {
  return members.map((m) => ({
    value: m.id,
    label: m.name,
    leading: <Avatar name={m.name} imageUrl={m.photoUrl} glyph={m.avatar} colour={m.colour} size="sm" />,
  }))
}

export interface TimeZoneOptionsInput {
  /** The IANA names to list. Default: Intl.supportedValuesOf('timeZone'), or the static list. */
  zones?: string[]
  /** The moment the offsets and clocks are read at. Default: now. */
  now?: Date
  /** Listed first, under "This device". */
  deviceZone?: string
  /** A stored zone that must be listed even if it is not in `zones` (so the trigger can show it). */
  include?: string
}

/**
 * SET-07: one option per zone. Value = the IANA name; label = the city; meta "UTC+1 · 21:14 · Europe/Rome" (the offset and the
 * clock first, so a cut on a narrow list falls on the IANA name); the trigger reads
 * "Rome · Europe/Rome"; leading = a neutral globe. Groups: "This device", then the regions in order of first appearance, then "Other"
 * (names without a region, such as UTC). A zone is listed once. Search reads the label and the meta: the city, the IANA name, the offset.
 */
export function timeZoneOptions({ zones, now = new Date(), deviceZone, include }: TimeZoneOptionsInput = {}): SelectOption<string>[] {
  const names = [...(zones ?? supportedTimeZones())]
  if (include && !names.includes(include)) names.push(include)
  const option = (iana: string, group: string): SelectOption<string> => {
    const z = zoneFacts(iana, now)
    return {
      value: iana,
      label: z.city,
      meta: [z.offset, z.time, iana].filter(Boolean).join(' · '),
      triggerLabel: z.city === iana ? iana : `${z.city} · ${iana}`,
      group,
      leading: <Icon name="globe" size={20} />,
    }
  }
  const out: SelectOption<string>[] = []
  if (deviceZone) out.push(option(deviceZone, selectStrings.thisDevice))
  const rest = names.filter((n) => n !== deviceZone)
  const region = (iana: string) => (iana.includes('/') ? iana.slice(0, iana.indexOf('/')) : null)
  for (const iana of rest) {
    const r = region(iana)
    if (r) out.push(option(iana, r))
  }
  for (const iana of rest) if (!region(iana)) out.push(option(iana, selectStrings.otherZones))
  return out
}

/** The default device zone for TimeZoneSelect. */
export { deviceTimeZone }

export interface CurrencyOptionsInput {
  /** ISO 4217 codes. Default: Intl.supportedValuesOf('currency'), or the static list. */
  codes?: string[]
  /** The locale of the names and symbols. Default: the browser's. */
  locale?: string
  /** A stored code that must be listed even if it is not in `codes`. */
  include?: string
}

/**
 * SET-07: label = the name ("Euro"); meta "EUR · €", or just "CHF" when the symbol is the code; the trigger reads "Euro · EUR".
 * Groups: "Common" (in COMMON_CURRENCIES order), then "All currencies" by name. A code is listed once.
 */
export function currencyOptions({ codes, locale, include }: CurrencyOptionsInput = {}): SelectOption<string>[] {
  const all = [...new Set([...(codes ?? supportedCurrencies()), ...(include ? [include] : [])])]
  const option = (code: string, group: string): SelectOption<string> => {
    const c = currencyFacts(code, locale)
    return {
      value: code,
      label: c.name,
      meta: c.symbol === code ? code : `${code} · ${c.symbol}`,
      triggerLabel: c.name === code ? code : `${c.name} · ${code}`,
      group,
    }
  }
  const common = COMMON_CURRENCIES.filter((code) => all.includes(code)).map((code) => option(code, selectStrings.commonCurrencies))
  const others = all
    .filter((code) => !COMMON_CURRENCIES.includes(code))
    .map((code) => option(code, selectStrings.allCurrencies))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
  return [...common, ...others]
}

/** B9-30 (SET-01): a Product as the Product Select lists it. The caller formats `packLabel` ("700 g"). */
export interface ProductChoice {
  id: number
  name: string
  ingredientName?: string
  packLabel?: string
  /** true for a Supply, false for Food; absent when it is not known (then the Food and Supplies filters are not offered). */
  supply?: boolean
  imageUrl?: string
  /** The Shops it is sold at (a Price or a Shop Barcode there). */
  shopIds?: number[]
}

/** "<Ingredient> · <pack size>", or "Supply · <pack size>"; the parts it does not have are left out. */
export function productMeta(p: ProductChoice): string | undefined {
  const parts = [p.supply ? selectStrings.supply : p.ingredientName, p.packLabel].filter((s): s is string => Boolean(s))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** Whether the Product is sold at the Shop. */
export const soldAt = (p: ProductChoice, shopId: number | undefined) => shopId !== undefined && (p.shopIds ?? []).includes(shopId)

/**
 * SET-01: value = id, label = name, meta = productMeta, leading = a Thumb (the monogram without a Picture). Grouped "Sold at <Shop>"
 * first, then "Other Products", only when some Products are sold at the Shop and some are not; each group keeps the given order and
 * every Product is kept.
 */
export function productOptions(products: ProductChoice[], shop?: { id: number; name: string }): SelectOption<number>[] {
  const sold = products.filter((p) => soldAt(p, shop?.id))
  const grouped = shop !== undefined && sold.length > 0 && sold.length < products.length
  const option = (p: ProductChoice, group?: string): SelectOption<number> => ({
    value: p.id,
    label: p.name,
    meta: productMeta(p),
    keywords: [p.ingredientName, p.packLabel].filter((s): s is string => Boolean(s)),
    leading: <Thumb name={p.name} imageUrl={p.imageUrl} size={40} />,
    ...(group ? { group } : {}),
  })
  if (!grouped) return products.map((p) => option(p))
  return [
    ...sold.map((p) => option(p, selectStrings.soldAt(shop.name))),
    ...products.filter((p) => !soldAt(p, shop.id)).map((p) => option(p, selectStrings.otherProducts)),
  ]
}
