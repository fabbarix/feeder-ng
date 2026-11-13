// H5 test builders: Ingredient JSON exactly as GET /api/ingredients sends it after H2 (kind and restockLevel always present).
import type { Ingredient, IngredientDetail } from './types'

export const garlicJSON: Ingredient = {
  id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, frozenShelfLifeDays: null,
  conversions: [{ unit: 'clove', toBase: 5 }], image: '', imageUrl: '', baseRecipe: null,
  kind: 'food', restockLevel: null,
}

export const dishSoapJSON: Ingredient = {
  id: 21, name: 'dish soap', baseUnit: 'ml', shelfLifeDays: null, frozenShelfLifeDays: null,
  conversions: [{ unit: 'bottle', toBase: 500 }], image: '', imageUrl: '', baseRecipe: null,
  kind: 'supply', restockLevel: 500,
}

export const toiletPaperJSON: Ingredient = {
  id: 22, name: 'toilet paper', baseUnit: 'piece', shelfLifeDays: null, frozenShelfLifeDays: null,
  conversions: [{ unit: 'pack', toBase: 9 }], image: '', imageUrl: '', baseRecipe: null,
  kind: 'supply', restockLevel: 6,
}

export const detail = (i: Ingredient, references: Record<string, number> = {}): IngredientDetail => ({ ...i, references })

/** The body of a 409 kind_in_use refusal: { error: { code, message, reasons } }. */
export const kindInUse = (reasons: string[]) => ({
  status: 409,
  json: { error: { code: 'kind_in_use', message: 'kind_in_use', reasons } },
})
