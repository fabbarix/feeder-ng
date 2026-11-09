// The "what is this?" form for an unknown barcode (functional spec §10.1): validation, the prefilled Product name,
// and the Op it produces. Plain TypeScript, no React. Stubs until implemented.
import type { BarcodeScope, BaseUnit, Op } from '../types'

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
  throw new Error('not implemented')
}

/** Units the pack size can be typed in: g -> g, kg, oz, lb; ml -> ml, l; piece -> piece. The first is the Base Unit. */
export function unitOptions(base: BaseUnit): string[] {
  void base
  throw new Error('not implemented')
}

/** The typed pack size in Base Units (oz and lb to grams, l to ml), or null for empty, non-numeric or <= 0. A comma is a decimal point. */
export function packSizeInBase(text: string, unit: string, base: BaseUnit): number | null {
  void text
  void unit
  void base
  throw new Error('not implemented')
}

/** "<Ingredient> <size>" via products/lib/names defaultProductName, or "" until the Ingredient and a valid size are known. */
export function suggestedName(values: UnknownFormValues): string {
  void values
  throw new Error('not implemented')
}

/** Errors by field; empty when the form can be saved. Strings come from scanStrings. */
export function validateUnknownForm(values: UnknownFormValues, mode: UnknownMode): FormErrors {
  void values
  void mode
  throw new Error('not implemented')
}

/** The shop_unknown Op for a valid form (see docs/dev/design/t13-shopping-scan.md for the field mapping). */
export function toUnknownOp(values: UnknownFormValues, target: UnknownTarget, meta: OpMeta): Op {
  void values
  void target
  void meta
  throw new Error('not implemented')
}
