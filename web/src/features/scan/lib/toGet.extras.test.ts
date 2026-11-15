// B9-41 (SSP-11): Scan's To get lists the open manual extras after the food Lines and before the Supplies, in the Shop's order, so its
// count equals the Shop's "left". A free-text extra reads "Added by hand"; an Ingredient extra shows its cover; a ticked one is not here.
import { describe, expect, it } from 'vitest'
import { listEntries } from '../../shop/lib/lines'
import { splitSupplies } from '../../shop/lib/supplies'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import { toGetExtras, toGetLines } from './scannedList'
import { toGetRows } from './toGet'

const flour = makeLine({ ingredientId: 3, name: 'Flour', quantity: 1000, pack: null })
const passata = makeLine({ ingredientId: 2, name: 'Passata' })
const soap = makeLine({ ingredientId: 8, name: 'Dish soap', baseUnit: 'ml', quantity: 500, pack: null, kind: 'supply', restock: { level: 1000, stock: 500 } })
const napkins = makeExtra({ id: 1, text: 'napkins' })
const oil = makeExtra({ id: 2, text: null, ingredientId: 9, name: 'olive oil', baseUnit: 'g', quantity: 500 })
const sponge = makeExtra({ id: 3, text: null, ingredientId: 10, name: 'sponge', baseUnit: 'piece', quantity: 2, kind: 'supply' })
const doneExtra = makeExtra({ id: 4, text: 'candles', ticked: true })

const rowsOf = (list: ReturnType<typeof makeList>) => toGetRows(toGetLines(list, []), [], list.currency, 'metric', toGetExtras(list))
const keys = (list: ReturnType<typeof makeList>) => rowsOf(list).map((r) => r.entry.key)

describe('toGetExtras', () => {
  it('is the open extras, in the list\'s order; a ticked extra is out; no list, none', () => {
    expect(toGetExtras(makeList({ extras: [napkins, doneExtra, oil] })).map((e) => e.id)).toEqual([1, 2])
    expect(toGetExtras(makeList({ extras: [] }))).toEqual([])
    expect(toGetExtras(undefined)).toEqual([])
  })
})

describe('toGetRows with extras', () => {
  it('a free-text extra is a row of its own: key "extra:<id>", its text as the title, flagged byHand (nothing to cover), no Ingredient', () => {
    const [row] = rowsOf(makeList({ lines: [], extras: [napkins] }))
    expect(row?.entry).toMatchObject({ key: 'extra:1', kind: 'extra', title: 'napkins', extraId: 1, ingredientId: null })
    expect(row?.byHand).toBe(true)
  })

  it('an Ingredient extra shows its cover, "0 of 500 g", not done: a Scan covers Lines, never an extra', () => {
    const [row] = rowsOf(makeList({ lines: [], extras: [oil] }))
    expect(row?.entry).toMatchObject({ key: 'extra:2', title: 'Olive oil', extraId: 2, ingredientId: 9 })
    expect(row?.cover).toEqual({ text: '0 of 500 g', done: false })
    expect(row?.byHand).toBeFalsy()
  })

  it('the order is the Shop\'s: the food Lines, then the extras, then the Supplies (their Lines, then their extras)', () => {
    const list = makeList({ lines: [flour, soap, passata], extras: [napkins, sponge, oil] })
    expect(keys(list)).toEqual(['line:3', 'line:2', 'extra:1', 'extra:2', 'line:8', 'extra:3'])
  })

  it('extras do not change the rows of the Lines: covers, "more since your tick" rows and the waiting rule stay as they were', () => {
    const list = makeList({ lines: [flour, passata], extras: [napkins] })
    const without = toGetRows(toGetLines(list, []), [], 'USD', 'metric')
    expect(rowsOf(list).slice(0, 2)).toEqual(without)
  })

  it('the count equals the Shop\'s "left": the open entries of the same list, for every mix', () => {
    const lists = [
      makeList({ lines: [flour], extras: [] }),
      makeList({ lines: [], extras: [napkins, oil] }),
      makeList({ lines: [flour, passata, soap], extras: [napkins, doneExtra, oil, sponge] }),
      makeList({ lines: [flour, makeLine({ ingredientId: 4, name: 'Rice', ticked: true, quantity: 0 })], extras: [doneExtra] }),
    ]
    for (const list of lists) {
      const shopLeft = listEntries(list, 'metric').open
      expect(rowsOf(list)).toHaveLength(shopLeft.length)
      const shopOrder = [...splitSupplies(shopLeft).food, ...splitSupplies(shopLeft).supplies].map((e) => e.key)
      expect(keys(list)).toEqual(shopOrder)
    }
  })
})
