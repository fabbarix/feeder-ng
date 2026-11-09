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
