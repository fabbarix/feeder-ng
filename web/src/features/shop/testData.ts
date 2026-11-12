import type { PastPlannedMeal, ShoppingExtra, ShoppingLine, ShoppingList } from './types'

export function makeLine(over: Partial<ShoppingLine> = {}): ShoppingLine {
  return {
    ingredientId: 2,
    name: 'Passata',
    baseUnit: 'g',
    need: 1400,
    available: 0,
    quantity: 1400,
    ticked: false,
    pack: { productId: 7, name: 'Mutti 700 g', size: 700, count: 2, remainder: 0 },
    estimatedCostCents: 318,
    ...over,
  }
}

export function makeExtra(over: Partial<ShoppingExtra> = {}): ShoppingExtra {
  return { id: 1, text: 'toilet paper', ingredientId: null, name: null, baseUnit: null, quantity: null, ticked: false, ...over }
}

export function makeList(over: Partial<ShoppingList> = {}): ShoppingList {
  return {
    today: '2026-11-09',
    horizonDays: 7,
    from: '2026-11-09',
    to: '2026-11-15',
    defaultTo: '2026-11-15',
    maxTo: '2026-11-15',
    currency: 'USD',
    lines: [makeLine()],
    extras: [],
    progress: { ticked: 0, total: 1 },
    estimatedCostCents: 318,
    unpricedLines: 0,
    complete: false,
    summary: { lines: 0, spentCents: 0, lotsAdded: 0 },
    ...over,
  }
}

/** B5-SH: an unconfirmed past meal; 2026-11-03 is a Tuesday. */
export function makePast(over: Partial<PastPlannedMeal> = {}): PastPlannedMeal {
  return { date: '2026-11-03', mealSlotId: 3, mealSlotName: 'Dinner', courseName: 'Main', ...over }
}
