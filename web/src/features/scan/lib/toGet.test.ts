// Beta.8 (scan): the To get rows. Each open Shopping List Line is a ListEntry plus what this session's scans cover of it
// ("700 of 1400 g", the same words and the same maths as a Scanned row), and the request that ticking it sends.
import { describe, expect, it } from 'vitest'
import { lineEntry } from '../../shop/lib/lines'
import { makeLine } from '../../shop/testData'
import { buildScannedRows } from './scannedList'
import { applied, passata, products, queued } from './scannedList.testData'
import { tickRequest, toGetRows } from './toGet'

const passataLine = makeLine()
const cheeseLine = makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })
const eggsLine = makeLine({ ingredientId: 9, name: 'Eggs', baseUnit: 'piece', quantity: 6, pack: null })

describe('toGetRows', () => {
  it('is one row per Line, in the order given, with the Shop screen entry', () => {
    const rows = toGetRows([passataLine, cheeseLine], [], 'USD', 'metric')
    expect(rows.map((r) => r.entry.key)).toEqual(['line:2', 'line:5'])
    expect(rows[0]!.entry).toEqual(lineEntry(passataLine, 'USD', 'metric'))
  })

  it('a Line nothing was scanned for covers none of it: "0 of 1400 g", still to get', () => {
    expect(toGetRows([passataLine], [], 'USD', 'metric')[0]!.cover).toEqual({ text: '0 of 1400 g', done: false })
  })

  it('a pack scanned for the Line is counted: "700 of 1400 g"', () => {
    const rows = buildScannedRows([applied('u-1', passata, { priceCents: 89 }, { priceCents: 89, onList: true, remaining: 700 })], products)
    expect(toGetRows([passataLine], rows, 'USD', 'metric')[0]!.cover).toEqual({ text: '700 of 1400 g', done: false })
  })

  it('a scan that waits in the queue is not counted yet', () => {
    const rows = buildScannedRows([queued('q-1', passata, { priceCents: 129 })], products)
    expect(toGetRows([passataLine], rows, 'USD', 'metric')[0]!.cover.text).toBe('0 of 1400 g')
  })

  it('pieces are bare: "0 of 6"', () => {
    expect(toGetRows([eggsLine], [], 'USD', 'metric')[0]!.cover.text).toBe('0 of 6')
  })

  it('a scan of another Ingredient does not count', () => {
    const rows = buildScannedRows([applied('u-1', passata, { priceCents: 89 }, { priceCents: 89, onList: true, remaining: 700 })], products)
    expect(toGetRows([cheeseLine], rows, 'USD', 'metric')[0]!.cover.text).toBe('0 of 200 g')
  })

  it('no Lines, no rows', () => {
    expect(toGetRows([], [], 'USD', 'metric')).toEqual([])
  })
})

describe('tickRequest: what ticking a To get row sends', () => {
  it('is the Line and what is still to get (what the Shop screen "How much?" prefills), so it adds that to Stock', () => {
    expect(tickRequest(lineEntry(passataLine, 'USD', 'metric'))).toEqual({ ingredientId: 2, quantity: 1400 })
    expect(tickRequest(lineEntry(makeLine({ quantity: 700 }), 'USD', 'metric'))).toEqual({ ingredientId: 2, quantity: 700 })
  })

  it('is null for an entry with no Ingredient (nothing to tick here)', () => {
    expect(tickRequest({ ...lineEntry(passataLine, 'USD', 'metric'), ingredientId: null })).toBeNull()
  })
})
