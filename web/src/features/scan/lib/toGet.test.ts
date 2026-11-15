// Beta.8 (scan): the To get rows. Each open Shopping List Line is a ListEntry plus what this session's scans cover of it
// ("700 g of 1.4 kg", the same words and the same maths as a Scanned row), and the request that ticking it sends.
import { describe, expect, it } from 'vitest'
import { lineEntry } from '../../shop/lib/lines'
import { makeGarlic, makeLine, makeList, makeTick } from '../../shop/testData'
import { buildScannedRows, toGetLines } from './scannedList'
import { applied, passata, products, queued } from './scannedList.testData'
import { tickRequest, toGetRows } from './toGet'

const lineLike = (line: ReturnType<typeof makeLine>) => lineEntry(line, 'USD', 'metric')
const passataLine = makeLine()
const cheeseLine = makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })
const eggsLine = makeLine({ ingredientId: 9, name: 'Eggs', baseUnit: 'piece', quantity: 6, pack: null })

describe('toGetRows', () => {
  it('is one row per Line, in the order given, with the Shop screen entry', () => {
    const rows = toGetRows([passataLine, cheeseLine], [], 'USD', 'metric')
    expect(rows.map((r) => r.entry.key)).toEqual(['line:2', 'line:5'])
    expect(rows[0]!.entry).toEqual(lineEntry(passataLine, 'USD', 'metric'))
  })

  it('a Line nothing was scanned for covers none of it: "0 of 1.4 kg", still to get', () => {
    expect(toGetRows([passataLine], [], 'USD', 'metric')[0]!.cover).toEqual({ text: '0 of 1.4 kg', done: false })
  })

  it('a pack scanned for the Line is counted: "700 g of 1.4 kg"', () => {
    const rows = buildScannedRows([applied('u-1', passata, { priceCents: 89 }, { priceCents: 89, onList: true, remaining: 700 })], products)
    expect(toGetRows([passataLine], rows, 'USD', 'metric')[0]!.cover).toEqual({ text: '700 g of 1.4 kg', done: false })
  })

  it('a scan that waits in the queue is not counted yet', () => {
    const rows = buildScannedRows([queued('q-1', passata, { priceCents: 129 })], products)
    expect(toGetRows([passataLine], rows, 'USD', 'metric')[0]!.cover.text).toBe('0 of 1.4 kg')
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

describe('tickRequest: what ticking a To get row sends (B9-34, SSP 1: the same amount as the Shop)', () => {
  it('is the Line and its default amount: the suggested pack, not what is still to get', () => {
    expect(tickRequest(lineLike(passataLine))).toEqual({ ingredientId: 2, quantity: 1400 }) // 2 x Mutti 700 g
    expect(tickRequest(lineLike(makeLine({ quantity: 700, pack: { productId: 7, name: 'Mutti 700 g', size: 700, count: 1, remainder: 0 } })))).toEqual({ ingredientId: 2, quantity: 700 })
    expect(tickRequest(lineLike(makeGarlic()))).toEqual({ ingredientId: 9, quantity: 500 }) // need 150 g, the pack is 500 g
  })

  it('without a pack it is what is still to get', () => {
    expect(tickRequest(lineLike(makeLine({ quantity: 200, pack: null })))).toEqual({ ingredientId: 2, quantity: 200 })
  })

  it('is null for an entry with no Ingredient (nothing to tick here)', () => {
    expect(tickRequest({ ...lineLike(passataLine), ingredientId: null })).toBeNull()
  })
})

describe('toGetRows: need that grew after a tick (SSP-02)', () => {
  const grown = makeGarlic({ ticked: true, need: 650, quantity: 500, more: 500, pack: null, tick: makeTick() })

  it('a ticked Line with more shows once, as the open row "more:<id>" for the difference, with its own cover', () => {
    const rows = toGetRows([grown], [], 'USD', 'metric')
    expect(rows.map((r) => r.entry.key)).toEqual(['more:9'])
    expect(rows[0]!.entry).toMatchObject({ moreSince: true, quantity: 500, ticked: false })
    expect(rows[0]!.cover).toEqual({ text: '0 of 500 g', done: false })
  })

  it('ticking that row sends the difference', () => {
    expect(tickRequest(toGetRows([grown], [], 'USD', 'metric')[0]!.entry)).toEqual({ ingredientId: 9, quantity: 500 })
  })

  it('a ticked Line without more is not a row (as before)', () => {
    expect(toGetRows([{ ...grown, more: undefined, quantity: 0 }], [], 'USD', 'metric')).toEqual([])
  })

  it('toGetLines (scan/lib/scannedList.ts, a one-line change B9-41 inherits) keeps a ticked Line that has more, and still drops a plain ticked one', () => {
    const list = makeList({ lines: [grown, makeLine({ ingredientId: 4, name: 'Rice', ticked: true, quantity: 0 }), makeLine()] })
    expect(toGetLines(list, []).map((l) => l.ingredientId)).toEqual([9, 2])
  })
})
