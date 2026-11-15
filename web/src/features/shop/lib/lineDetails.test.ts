// B9-43 (SSP-13, SSP-14; mocks/ssp-13-line-sheet.html): what an open Line's sheet says, built into `lineEntry(...).details` (lib/lineDetails
// pins the shape). The Line JSON (B9-06, B9-23): `pack` {productId, name, size, count, bought, price?}, `plannedMeals` [{date, mealSlotId,
// mealSlotName, courseName, recipeName}] (always sent).
import { describe, expect, it } from 'vitest'
import { extraEntry, lineEntry } from './lines'
import { makeExtra, makeGarlic, makeLine, makeOnion } from '../testData'

const onion = (over = {}, system: 'metric' | 'imperial' = 'metric') => lineEntry(makeOnion(over), 'USD', system).details!
const meal = (date: string, mealSlotId: number, mealSlotName: string, recipeName: string, courseName = 'Main') => ({ date, mealSlotId, mealSlotName, courseName, recipeName })

describe('details.toGet and details.estimate (SSP-13)', () => {
  it('never bought: To get "94 pieces" with "16 × Onion pack (6 pieces)"; Estimated "$47.84" with "$2.99 a pack, 14 Nov · not bought here yet"', () => {
    const d = onion()
    expect(d.toGet).toEqual({ state: '94 pieces', detail: '16 × Onion pack (6 pieces)' })
    expect(d.estimate).toEqual({ state: '$47.84', detail: '$2.99 a pack, 14 Nov · not bought here yet' })
  })

  it('the pack\'s size is named only when the Product name does not already carry it ("2 × Mutti 700 g", "1 × Garlic organic pack (500 g)")', () => {
    expect(lineEntry(makeLine(), 'USD', 'metric').details!.toGet).toEqual({ state: '1.4 kg', detail: '2 × Mutti 700 g' })
    expect(lineEntry(makeGarlic(), 'USD', 'metric').details!.toGet).toEqual({ state: '150 g', detail: '1 × Garlic organic pack (500 g)' })
  })

  it('a pack that was bought before has no "not bought here yet" detail (the estimate is plain)', () => {
    const d = lineEntry(makeLine(), 'USD', 'metric').details!
    expect(d.estimate).toEqual({ state: '$3.18', detail: '' })
    const flagged = onion({ pack: { productId: 21, name: 'Onion pack', size: 6, count: 16, remainder: 2, bought: true, price: null } })
    expect(flagged.estimate.detail).toBe('')
  })

  it('no estimate: "No Price yet", no detail; a Line with no pack: To get has no detail', () => {
    const d = onion({ estimatedCostCents: null, pack: null })
    expect(d.toGet).toEqual({ state: '94 pieces', detail: '' })
    expect(d.estimate).toEqual({ state: 'No Price yet', detail: '' })
  })

  it('amounts follow the display system and kg / l from 1000 g / ml (SSP 7)', () => {
    expect(lineEntry(makeLine({ need: 12000, quantity: 12000, pack: null, estimatedCostCents: null }), 'USD', 'metric').details!.toGet.state).toBe('12 kg')
    expect(lineEntry(makeLine({ baseUnit: 'ml', need: 1500, quantity: 1500, pack: null }), 'USD', 'metric').details!.toGet.state).toBe('1.5 l')
    expect(lineEntry(makeLine({ need: 100, quantity: 100, pack: null }), 'USD', 'imperial').details!.toGet.state).toBe('3.5 oz')
  })

  it('"Change the Price" targets the Line\'s suggested Product and its Shop (the priced fallback\'s); no pack = no Product', () => {
    expect(onion().product).toEqual({ id: 21, name: 'Onion pack', packSize: 6, baseUnit: 'piece' })
    expect(onion().priceShopId).toBe(1)
    expect(lineEntry(makeLine(), 'USD', 'metric').details!.product).toEqual({ id: 7, name: 'Mutti 700 g', packSize: 700, baseUnit: 'g' })
    expect(lineEntry(makeLine(), 'USD', 'metric').details!.priceShopId).toBeNull()
    expect(onion({ pack: null }).product).toBeNull()
  })

  it('an extra has no details', () => {
    expect(extraEntry(makeExtra(), 'metric').details).toBeUndefined()
  })
})

describe('details.plannedMeals (SSP-14: "For")', () => {
  it('rows of "Sat Dinner" with the Recipe as the detail, oldest first (the server\'s order is not relied on)', () => {
    const d = onion()
    expect(d.plannedMeals).toEqual([
      { key: 'Mon Lunch', detail: 'Onion and potato frittata' },
      { key: 'Wed Dinner', detail: 'Roast chicken' },
      { key: 'Sat Dinner', detail: 'French onion soup' },
    ])
    expect(d.morePlannedMeals).toBe(0)
  })

  it('the same day sorts by Meal Slot id', () => {
    const d = onion({ plannedMeals: [meal('2026-11-16', 3, 'Dinner', 'B'), meal('2026-11-16', 2, 'Lunch', 'A')] })
    expect(d.plannedMeals.map((r) => r.key)).toEqual(['Mon Lunch', 'Mon Dinner'])
  })

  it('at most 5 rows, then "and {n} more" counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, i) => meal(`2026-11-${String(10 + i).padStart(2, '0')}`, 3, 'Dinner', `Recipe ${i}`))
    const d = onion({ plannedMeals: many })
    expect(d.plannedMeals).toHaveLength(5)
    expect(d.plannedMeals[0]!.detail).toBe('Recipe 0')
    expect(d.morePlannedMeals).toBe(3)
  })

  it('exactly 5: all listed, no "more"', () => {
    const five = Array.from({ length: 5 }, (_, i) => meal(`2026-11-1${i}`, 3, 'Dinner', `Recipe ${i}`))
    expect(onion({ plannedMeals: five }).morePlannedMeals).toBe(0)
  })

  it('a Line with no Planned Meals (a Supply, an older saved list) has no rows and no consequence', () => {
    for (const plannedMeals of [[], undefined]) {
      const d = onion({ plannedMeals })
      expect(d.plannedMeals).toEqual([])
      expect(d.morePlannedMeals).toBe(0)
      expect(d.consequence).toBe('')
    }
  })
})

describe('details.consequence', () => {
  it('several Planned Meals: "Not needed leaves these 3 Planned Meals short of Onion."', () => {
    expect(onion().consequence).toBe('Not needed leaves these 3 Planned Meals short of Onion.')
  })

  it('counts all of them, not just the five listed', () => {
    const many = Array.from({ length: 8 }, (_, i) => meal(`2026-11-${String(10 + i).padStart(2, '0')}`, 3, 'Dinner', `R${i}`))
    expect(onion({ plannedMeals: many }).consequence).toBe('Not needed leaves these 8 Planned Meals short of Onion.')
  })

  it('one Planned Meal names it: "Not needed leaves Sat Dinner short of Onion."', () => {
    expect(onion({ plannedMeals: [meal('2026-11-21', 3, 'Dinner', 'French onion soup')] }).consequence).toBe('Not needed leaves Sat Dinner short of Onion.')
  })

  it('uses the Ingredient\'s display name, capitalised ("Olive oil")', () => {
    expect(onion({ name: 'olive oil', plannedMeals: [meal('2026-11-21', 3, 'Dinner', 'x'), meal('2026-11-22', 3, 'Dinner', 'y')] }).consequence).toBe('Not needed leaves these 2 Planned Meals short of Olive oil.')
  })
})
