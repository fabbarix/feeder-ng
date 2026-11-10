// The "what is this?" form for an unknown barcode (functional spec §10.1): validation, the prefilled Product name,
// and the Op it produces. Plain TypeScript, no React. Stubs until implemented.
import { defaultProductName } from '../../products/lib/names'
import { scanStrings } from '../strings'
import type { BarcodeScope, BaseUnit, Op } from '../types'
import { pricePerKgFromWeight } from './barcode'

export interface IngredientChoice {
  /** absent = a new Ingredient to create from name + baseUnit */
  id?: number
  name: string
  baseUnit: BaseUnit
}

export interface UnknownFormValues {
  ingredient: IngredientChoice | null
  /** what the User typed ("700", "1,5") */
  packSize: string
  packUnit: string
  productName: string
  scope: BarcodeScope
  /** grams, only for a price-valued weighed code */
  weightText: string
}

/** pack: the full form. weighed: Ingredient + Product name only. weighed_price: also the weight, once. */
export type UnknownMode = 'pack' | 'weighed' | 'weighed_price'

export type FormErrors = Partial<Record<'ingredient' | 'packSize' | 'productName' | 'weight', string>>

export type UnknownTarget =
  | { mode: 'pack'; code: string }
  | { mode: 'weighed'; ruleId: number; itemCode: string; weightGrams: number; priceCents?: number }
  | { mode: 'weighed_price'; ruleId: number; itemCode: string; priceCents: number }

export interface OpMeta {
  clientUuid: string
  scannedAt: string
  shopId: number
  rangeTo?: string
}

export function emptyForm(): UnknownFormValues {
  return { ingredient: null, packSize: '', packUnit: '', productName: '', scope: 'global', weightText: '' }
}

const UNIT_FACTORS: Record<BaseUnit, Record<string, number>> = {
  g: { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 },
  ml: { ml: 1, l: 1000 },
  piece: { piece: 1 },
}

/** Units the pack size can be typed in: g -> g, kg, oz, lb; ml -> ml, l; piece -> piece. The first is the Base Unit. */
export function unitOptions(base: BaseUnit): string[] {
  return Object.keys(UNIT_FACTORS[base])
}

/** A typed number (a comma is a decimal point), or null for empty, non-numeric or <= 0. */
function positiveNumber(text: string): number | null {
  const normalised = text.trim().replace(',', '.')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalised)) return null
  const n = Number(normalised)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The typed pack size in Base Units (oz and lb to grams, l to ml), or null for empty, non-numeric or <= 0. A comma is a decimal point. */
export function packSizeInBase(text: string, unit: string, base: BaseUnit): number | null {
  const n = positiveNumber(text)
  const factor = UNIT_FACTORS[base][unit]
  if (n === null || factor === undefined) return null
  return n * factor
}

/** "<Ingredient> <size>" via products/lib/names defaultProductName, or "" until the Ingredient and a valid size are known. */
export function suggestedName(values: UnknownFormValues): string {
  const size = packSizeInBase(values.packSize, values.packUnit, values.ingredient?.baseUnit ?? 'g')
  if (!values.ingredient || size === null) return ''
  return defaultProductName(values.ingredient.name, size, values.ingredient.baseUnit)
}

/** Errors by field; empty when the form can be saved. Strings come from scanStrings. */
export function validateUnknownForm(values: UnknownFormValues, mode: UnknownMode): FormErrors {
  const errors: FormErrors = {}
  if (!values.ingredient) errors.ingredient = scanStrings.required
  if (values.productName.trim() === '') errors.productName = scanStrings.required
  if (mode === 'pack') {
    const base = values.ingredient?.baseUnit ?? 'g'
    if (packSizeInBase(values.packSize, values.packUnit, base) === null) errors.packSize = scanStrings.mustBePositive
  }
  if (mode === 'weighed_price' && positiveNumber(values.weightText) === null) errors.weight = scanStrings.mustBePositive
  return errors
}

/** The shop_unknown Op for a valid form (see docs/dev/design/t13-shopping-scan.md for the field mapping). */
export function toUnknownOp(values: UnknownFormValues, target: UnknownTarget, meta: OpMeta): Op {
  const base = values.ingredient?.baseUnit ?? 'g'
  const ingredient = values.ingredient?.id !== undefined ? { id: values.ingredient.id } : { name: values.ingredient?.name ?? '', baseUnit: base }
  const op: Op = {
    clientUuid: meta.clientUuid,
    scannedAt: meta.scannedAt,
    kind: 'shop_unknown',
    shopId: meta.shopId,
    ingredient,
    productName: values.productName.trim(),
  }
  if (meta.rangeTo) op.rangeTo = meta.rangeTo
  if (target.mode === 'pack') {
    const size = packSizeInBase(values.packSize, values.packUnit, base) ?? 0
    return { ...op, barcode: target.code, quantity: size, packSize: size, scope: values.scope }
  }
  if (target.mode === 'weighed') {
    const weighed: Op = { ...op, ruleId: target.ruleId, itemCode: target.itemCode, quantity: target.weightGrams }
    if (target.priceCents !== undefined) weighed.priceCents = target.priceCents
    return weighed
  }
  const grams = positiveNumber(values.weightText) ?? 0
  const perKg = pricePerKgFromWeight(target.priceCents, grams)
  return {
    ...op,
    ruleId: target.ruleId,
    itemCode: target.itemCode,
    quantity: grams,
    priceCents: target.priceCents,
    ...(perKg.ok ? { pricePerKgCents: perKg.pricePerKgCents } : {}),
  }
}
