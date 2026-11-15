import type { LineTick, PastPlannedMeal, ShoppingExtra, ShoppingLine, ShoppingList, TickAddition } from './types'

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
  return { date: '2026-11-03', mealSlotId: 3, mealSlotName: 'Dinner', courseName: 'Starter', ...over }
}

/** B9-23: one addition; by default the viewer's own hand tick of 500 g at 10:12 UTC. */
export function makeAddition(over: Partial<TickAddition> = {}): TickAddition {
  return { who: 'You', mine: true, by: 'hand', quantity: 500, clientUuid: 'u-1', tickedAt: '2026-11-14T10:12:00Z', syncedAt: '2026-11-14T10:12:01Z', ...over }
}

/** B9-23: the tick of a Line with one hand addition of 500 g (the Line needed 150 g: SSP-01's Garlic). */
export function makeTick(over: Partial<LineTick> = {}): LineTick {
  const additions = over.additions ?? [makeAddition()]
  return { by: 'hand', added: additions.reduce((n, a) => n + (a.quantity ?? 0), 0) || null, additions, ...over }
}

/** SSP-01's Garlic: need 150 g, a last-bought 500 g pack, ticked by hand (500 g in Stock). */
export function makeGarlic(over: Partial<ShoppingLine> = {}): ShoppingLine {
  return {
    ingredientId: 9,
    name: 'garlic',
    baseUnit: 'g',
    need: 150,
    available: 0,
    quantity: 150,
    ticked: false,
    pack: { productId: 11, name: 'Garlic organic pack', size: 500, count: 1, remainder: 350 },
    estimatedCostCents: 229,
    ...over,
  }
}
