// B9-34 (SSP-01, SSP-02): lib/lines.ts. The entries carry what one tap sends and what the Change sheet offers; a ticked Line that grew
// ("more since your tick") puts one more OPEN entry "more:<ingredientId>" in To get while its ticked entry stays in Ticked.
import { describe, expect, it } from 'vitest'
import { makeAddition, makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import { extraEntry, lineEntry, listEntries } from './lines'

describe('lineEntry: what a tap sends and what a tick says', () => {
  it('an open Line carries the default amount (the pack), what it needed and the pack as a choice', () => {
    expect(lineEntry(makeGarlic(), 'USD', 'metric')).toMatchObject({
      defaultAmount: 500,
      need: 150,
      packChoice: { count: 1, name: 'Garlic organic pack', size: 500 },
      tick: null,
      tickMeta: null,
      moreSince: false,
    })
  })

  it('"What the Line needed" of an open Line is what is still to get (its Stock already counted), not the whole need', () => {
    expect(lineEntry(makeGarlic({ need: 1350, available: 650, quantity: 700, pack: null }), 'USD', 'metric')).toMatchObject({ need: 700, defaultAmount: 700 })
  })

  it('without a pack the default amount is what is still to get and there is no pack choice', () => {
    expect(lineEntry(makeGarlic({ pack: null }), 'USD', 'metric')).toMatchObject({ defaultAmount: 150, packChoice: null })
  })

  it('a ticked Line keeps the tick the list sent and the meta that says it; its value stays what it needed, muted by the stylesheet', () => {
    const tick = makeTick()
    const entry = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick }), 'USD', 'metric')
    expect(entry).toMatchObject({ ticked: true, tick, quantityText: '150 g', need: 150, tickMeta: { text: '+500 g in Stock', tone: 'success' } })
  })

  it('the meta is written in the display system', () => {
    const entry = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'imperial')
    expect(entry.tickMeta?.text).toMatch(/^\+.* oz in Stock$/)
  })
})

describe('extraEntry', () => {
  it('an Ingredient extra ticks with its quantity, free text with none', () => {
    expect(extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 }), 'metric')).toMatchObject({ defaultAmount: 2000, tick: null })
    expect(extraEntry(makeExtra(), 'metric')).toMatchObject({ defaultAmount: 0, tick: null, packChoice: null })
  })

  it('a ticked extra carries its tick and its meta', () => {
    const tick = makeTick({ by: 'hand', added: 2000, additions: [makeAddition({ quantity: 2000 })] })
    const entry = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000, ticked: true, tick }), 'metric')
    expect(entry).toMatchObject({ ticked: true, tick, tickMeta: { tone: 'success' } })
  })

  it('a ticked free-text extra that added nothing says "Not added to Stock"', () => {
    const tick = makeTick({ added: null, additions: [makeAddition({ quantity: null })] })
    expect(extraEntry(makeExtra({ ticked: true, tick }), 'metric').tickMeta).toMatchObject({ text: 'Not added to Stock', tone: 'muted' })
  })
})

describe('listEntries: need that grew after a tick (SSP-02)', () => {
  const chicken = (over = {}) => makeLine({ ingredientId: 5, name: 'Chicken thighs', need: 1550, available: 0, quantity: 750, more: 750, ticked: true, pack: null, estimatedCostCents: null, tick: makeTick({ added: 800, additions: [makeAddition({ quantity: 800 })] }), ...over })

  it('the ticked entry stays in Ticked, and ONE open entry "more:<id>" appears in To get for the difference', () => {
    const { open, ticked } = listEntries(makeList({ lines: [chicken()] }), 'metric')
    expect(ticked.map((e) => e.key)).toEqual(['line:5'])
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({
      key: 'more:5',
      kind: 'line',
      ingredientId: 5,
      title: 'Chicken thighs',
      ticked: false,
      moreSince: true,
      quantity: 750,
      quantityText: '750 g',
      defaultAmount: 750,
      baseUnit: 'g',
    })
  })

  it('the open entry is a real Line row: it carries the pack suggestion and the estimate the server sent for the difference', () => {
    const pack = { productId: 6, name: 'Chicken 750 g', size: 750, count: 1, remainder: 0 }
    const { open } = listEntries(makeList({ lines: [chicken({ pack, estimatedCostCents: 899 })] }), 'metric')
    expect(open[0]).toMatchObject({ packLine: '1 × Chicken 750 g', estimatedCost: '$8.99', defaultAmount: 750, packChoice: { count: 1, name: 'Chicken 750 g', size: 750 } })
  })

  it('it sits where its Line sits among the open Lines (server order), before the extras', () => {
    const list = makeList({ lines: [makeLine({ ingredientId: 1, name: 'Dill', ticked: false }), chicken(), makeLine({ ingredientId: 7, name: 'Rice', ticked: false })], extras: [makeExtra()] })
    expect(listEntries(list, 'metric').open.map((e) => e.key)).toEqual(['line:1', 'more:5', 'line:7', 'extra:1'])
  })

  it('a Supply that grew stays a Supply, so it goes to the Supplies group', () => {
    const { open } = listEntries(makeList({ lines: [chicken({ kind: 'supply', baseUnit: 'piece' })] }), 'metric')
    expect(open[0]).toMatchObject({ key: 'more:5', supply: true })
  })

  it('no more, no extra entry (absent, 0 and an open Line)', () => {
    const lines = [chicken({ more: undefined, quantity: 0 }), chicken({ ingredientId: 6, more: 0, quantity: 0 }), makeLine({ ingredientId: 8, name: 'Open', more: undefined })]
    expect(listEntries(makeList({ lines }), 'metric').open.map((e) => e.key)).toEqual(['line:8'])
  })

  it('a Line that is not ticked never shows a more entry of its own', () => {
    expect(listEntries(makeList({ lines: [makeLine({ more: 500 })] }), 'metric').open.map((e) => e.key)).toEqual(['line:2'])
  })
})
