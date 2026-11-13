import type { IngredientStock, StockLot } from './types'

export function makeLot(over: Partial<StockLot> = {}): StockLot {
  return {
    id: 1,
    ingredientId: 7,
    ingredientName: 'chicken thighs',
    baseUnit: 'g',
    quantity: 200,
    purchased: '2026-11-01',
    goesOff: '2026-11-05',
    source: 'manual',
    productId: null,
    shopId: null,
    spoiled: true,
    useSoon: false,
    ...over,
  }
}

export function makeTotal(over: Partial<IngredientStock> = {}): IngredientStock {
  return {
    ingredientId: 7,
    name: 'chicken thighs',
    baseUnit: 'g',
    total: 800,
    lotCount: 2,
    nextGoesOff: '2026-11-11',
    useSoon: false,
    spoiledCount: 0,
    ...over,
  }
}

/**
 * A Supply's Stock Lot as GET /api/stock/lots returns it (H4): `kind: "supply"`, no go-off, no Shelf Life, never Use soon or
 * Spoiled. Every field the server sends is here, so a mock cannot drift from the JSON.
 */
export function makeSupplyLot(over: Partial<StockLot> = {}): StockLot {
  return makeLot({
    id: 31,
    ingredientId: 40,
    ingredientName: 'toilet paper',
    baseUnit: 'piece',
    quantity: 4,
    purchased: '2026-11-01',
    goesOff: null,
    shelfLifeDays: null,
    spoiled: false,
    useSoon: false,
    kind: 'supply',
    ...over,
  })
}

/** A Supply's row of GET /api/stock (H4): `kind: "supply"`, never use soon, no spoiled Lots, no next go-off. */
export function makeSupplyTotal(over: Partial<IngredientStock> = {}): IngredientStock {
  return makeTotal({
    ingredientId: 40,
    name: 'toilet paper',
    baseUnit: 'piece',
    total: 4,
    lotCount: 1,
    nextGoesOff: null,
    useSoon: false,
    spoiledCount: 0,
    kind: 'supply',
    ...over,
  })
}

/** An Ingredient of GET /api/ingredients (H2): `kind` and `restockLevel` (Base Units; null = none, food always null). */
export function makeIngredientJson(over: Record<string, unknown> = {}) {
  return { id: 7, name: 'chicken thighs', baseUnit: 'g', shelfLifeDays: 4, frozenShelfLifeDays: null, conversions: [], image: '', imageUrl: '', kind: 'food', restockLevel: null, ...over }
}

/** A Supply as GET /api/ingredients returns it: no Shelf Life, a Restock level. */
export function makeSupplyJson(over: Record<string, unknown> = {}) {
  return makeIngredientJson({ id: 40, name: 'toilet paper', baseUnit: 'piece', shelfLifeDays: null, kind: 'supply', restockLevel: 6, ...over })
}
