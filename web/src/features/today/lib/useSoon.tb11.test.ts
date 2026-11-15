// B9-44 (TB-11): Use soon rows carry the amount that goes off soonest and the Lot to open. useSoonItems takes the Lots as a third
// argument ([] before they load: the row then has the Ingredient's total and no Lot, and is not a target).
import { describe, expect, it } from 'vitest'
import type { IngredientStock, StockLot } from '../../stock/types'
import { useSoonItems } from './useSoon'

const totals = (id: number, name: string, nextGoesOff: string, total = 900): IngredientStock =>
  ({ ingredientId: id, name, baseUnit: 'g', total, lotCount: 2, nextGoesOff, useSoon: true, spoiledCount: 0 }) as IngredientStock
const lot = (id: number, ingredientId: number, quantity: number, goesOff: string | null, spoiled = false): StockLot =>
  ({ id, ingredientId, ingredientName: 'x', baseUnit: 'g', quantity, purchased: '2026-11-01', goesOff, source: 'manual', productId: null, shopId: null, spoiled, useSoon: true }) as StockLot

describe('useSoonItems with Lots (TB-11)', () => {
  it('the value is the amount going off on the soonest date, not the whole total', () => {
    const items = useSoonItems([totals(1, 'Flour', '2026-11-10')], '2026-11-09', [lot(11, 1, 500, '2026-11-10'), lot(12, 1, 400, '2026-11-20')])
    expect(items[0]).toMatchObject({ ingredientId: 1, quantity: 500, baseUnit: 'g' })
  })

  it('two Lots going off the same day add up, and the soonest Lot is the one named (the smaller id on a tie)', () => {
    const items = useSoonItems([totals(1, 'Flour', '2026-11-10')], '2026-11-09', [lot(12, 1, 200, '2026-11-10'), lot(11, 1, 300, '2026-11-10')])
    expect(items[0]).toMatchObject({ quantity: 500, soonestLotId: 11 })
  })

  it('the soonest Lot is the earliest go-off date, and a spoiled Lot is never the one (it belongs to Throw out or keep?)', () => {
    const items = useSoonItems([totals(1, 'Milk', '2026-11-10')], '2026-11-09', [lot(21, 1, 1000, '2026-11-08', true), lot(22, 1, 500, '2026-11-12'), lot(23, 1, 250, '2026-11-10')])
    expect(items[0]).toMatchObject({ soonestLotId: 23, quantity: 250 })
  })

  it('without Lots (not loaded) the row has the total and no Lot to open', () => {
    const [item] = useSoonItems([totals(1, 'Flour', '2026-11-10', 900)], '2026-11-09', [])
    expect(item).toMatchObject({ quantity: 900, baseUnit: 'g' })
    expect(item?.soonestLotId).toBeUndefined()
  })

  it('keeps the short wording and the order of before (soonest day first, then name)', () => {
    const items = useSoonItems([totals(2, 'B', '2026-11-11'), totals(1, 'A', '2026-11-10')], '2026-11-09', [])
    expect(items.map((i) => [i.name, i.when])).toEqual([['A', 'good until tomorrow'], ['B', 'good until Wed']])
  })
})
