// The "what is this?" form for an unknown barcode (functional spec §10.1): validation, the prefilled Product name,
// and the Op it produces. Plain TypeScript, no React. Stubs until implemented.
import { defaultBaseUnit } from '../../ingredients/lib/newIngredient'
import type { IngredientKind } from '../../ingredients/types'
import { defaultProductName } from '../../products/lib/names'
import type { RawImage } from '../../../ui'
import { scanStrings } from '../strings'
import type { BarcodeScope, BaseUnit, Op } from '../types'
import { pricePerKgFromWeight } from './barcode'

export interface IngredientChoice {
  /** absent = a new Ingredient to create from name + baseUnit */
  id?: number
  name: string
  baseUnit: BaseUnit
  /** PE: the Ingredient's Picture address, drawn in the picker option */
  imageUrl?: string
  /** SR5 (H7): food or supply; absent = food. A new Supply is created with kind 'supply'. */
  kind?: IngredientKind
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
  /** PP: the Picture's image id for the Product to create, "" or absent = none */
  image?: string
  /**
   * PPX: the Picture picked while OFFLINE (raw-mode ImagePicker, downscaled). Not part of the Op: the flow hands its Blob to the
   * queue, which uploads it on sync. Left out of an online form (the picker uploads and `image` is set instead).
   */
  picture?: RawImage | null
  /**
   * SR5: the Op's clientUuid, chosen by the sheet so that the caller can name the new row (`newRowKey`) once the form is added.
   * toUnknownOp uses it when present and `meta.clientUuid` otherwise.
   */
  clientUuid?: string
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
  if (!values.ingredient || (values.ingredient.id === undefined && values.ingredient.name.trim() === '')) errors.ingredient = scanStrings.required
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
  const ingredient = values.ingredient?.id !== undefined ? { id: values.ingredient.id } : { name: values.ingredient?.name ?? '', baseUnit: base, kind: choiceKind(values.ingredient) }
  const op: Op = {
    clientUuid: values.clientUuid ?? meta.clientUuid,
    scannedAt: meta.scannedAt,
    kind: 'shop_unknown',
    shopId: meta.shopId,
    ingredient,
    productName: values.productName.trim(),
  }
  if (meta.rangeTo) op.rangeTo = meta.rangeTo
  if (values.image) op.productImage = values.image
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

/** R2-4: the Base Unit a new Ingredient gets from the pack unit chosen: the shared ingredients/lib/newIngredient.defaultBaseUnit rule. */
export function newIngredientBaseUnit(packUnit: string): BaseUnit {
  return defaultBaseUnit(packUnit)
}

/** SR5: the Base Unit a new Ingredient starts on in the sheet's Base Unit choice: g for food, piece for a Supply. */
export function defaultNewBaseUnit(kind: IngredientKind): BaseUnit {
  return kind === 'supply' ? 'piece' : 'g'
}

/** SR5: an Ingredient choice's kind (absent = food). */
export function choiceKind(choice: IngredientChoice | null): IngredientKind {
  return choice?.kind ?? 'food'
}

/** SR5: the choices of one kind, for the Select behind the Ingredient | Supply Segmented. */
export function choicesOfKind(choices: IngredientChoice[], kind: IngredientKind): IngredientChoice[] {
  return choices.filter((c) => choiceKind(c) === kind)
}

/**
 * SR5: the Product name the summary line offers. A pack: suggestedName ("Dish soap 500 ml"). A weighed code has no pack size: the
 * Ingredient's name, capitalised ("Loose carrots" is what the User renames it to). "" until the Ingredient is known.
 */
export function defaultName(values: UnknownFormValues, mode: UnknownMode): string {
  if (mode === 'pack') return suggestedName(values)
  const name = values.ingredient?.name.trim() ?? ''
  return name === '' ? '' : name.charAt(0).toUpperCase() + name.slice(1)
}

/** SR5: the key the Scanned list gives the row of a Product that a queued scan has not created yet (scannedList: `new:<uuid>`). */
export function newRowKey(clientUuid: string): string {
  return `new:${clientUuid}`
}
