// B9-34 (SSP-01, SSP-02, SSP-18, SSP-05): lib/rows.ts. The one meta line of a ticked row and of a "more since your tick" row; the compact
// form is the row's own (ListRow shows it by the width of its text column), so rowMeta takes no viewport option any more; the actions of a
// ticked Line's sheet.
import { describe, expect, it } from 'vitest'
import { makeAddition, makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import { extraEntry, lineEntry, listEntries } from './lines'
import { lineActions, metaWidth, rowMeta, rowValue } from './rows'

const tickedGarlic = (tick = makeTick()) => lineEntry(makeGarlic({ ticked: true, quantity: 0, tick }), 'USD', 'metric')

describe('rowMeta of a ticked row (SSP-01)', () => {
  it('added Stock: success status, the Package icon, "+500 g in Stock", no compact form', () => {
    expect(rowMeta(tickedGarlic())).toEqual({ text: '+500 g in Stock', status: 'success', icon: 'stock' })
  })

  it('no Stock added: no status (muted), MinusCircle, the long text and the compact one for a narrow text column', () => {
    const tick = makeTick({ added: null, additions: [makeAddition({ quantity: null })] })
    expect(rowMeta(tickedGarlic(tick))).toEqual({ text: 'Not added to Stock', compact: 'No Stock added', icon: 'notAdded' })
  })

  it('a Scan: no status, the Barcode icon, "Scanned · 700 g"', () => {
    const tick = makeTick({ by: 'scan', added: 700, additions: [makeAddition({ by: 'scan', quantity: 700 })] })
    expect(rowMeta(tickedGarlic(tick))).toEqual({ text: 'Scanned · 700 g', icon: 'scan' })
  })

  it('two additions: success, long and compact', () => {
    const tick = makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 50 }), makeAddition({ quantity: 50, clientUuid: 'u-2' })] })
    expect(rowMeta(tickedGarlic(tick))).toEqual({ text: 'Added twice · Sam 50 g, you 50 g', compact: 'Added twice · 100 g', status: 'success', icon: 'stock' })
  })

  it('a ticked entry without a tick from the server (an older list) says nothing, as before', () => {
    expect(rowMeta(lineEntry(makeGarlic({ ticked: true, quantity: 0 }), 'USD', 'metric'))).toEqual({ text: '' })
  })
})

describe('rowMeta of the "more since your tick" row (SSP-02)', () => {
  it('info status, the ArrowBendDownRight icon, "More since your tick", compact "More needed"', () => {
    const { open } = listEntries(makeList({ lines: [makeLine({ ingredientId: 5, name: 'Chicken', ticked: true, more: 750, quantity: 750, pack: null, tick: makeTick() })] }), 'metric')
    expect(rowMeta(open[0]!)).toEqual({ text: 'More since your tick', compact: 'More needed', status: 'info', icon: 'moreSince' })
  })
})

describe('rowMeta keeps the other metas, and the compact Restock reason is the row\'s own (SSP-05)', () => {
  const supply = () => lineEntry(makeLine({ kind: 'supply', baseUnit: 'ml', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null }), 'USD', 'metric')

  it('a Restock reason: long text, its compact form beside it, info status; never chosen by a viewport', () => {
    expect(rowMeta(supply())).toEqual({ text: 'Below 1 l · 400 ml in Stock', compact: '400 ml in Stock', status: 'info' })
  })

  it('the unconfirmed-meals hint and the pack line are as before', () => {
    expect(rowMeta({ ...lineEntry(makeLine(), 'USD', 'metric'), hintShort: 'Fri Dinner +2' })).toEqual({ text: 'Fri Dinner +2', status: 'info' })
    // B9-34 (SSP-05, P23 on every meta): the pack line's compact form keeps the count and size, so a long Product name is never cut
    expect(rowMeta(lineEntry(makeLine(), 'USD', 'metric'))).toEqual({ text: '2 × Mutti 700 g', compact: '2 × 700 g' })
  })
})

describe('rowValue', () => {
  it('a ticked Line keeps its need as the value (the column stays, muted by the stylesheet)', () => {
    expect(rowValue(tickedGarlic()).value).toBe('150 g')
  })
  it('the "more since your tick" row shows the difference and its estimate', () => {
    const line = makeLine({ ingredientId: 5, name: 'Chicken', ticked: true, more: 750, quantity: 750, estimatedCostCents: 899, tick: makeTick() })
    expect(rowValue(listEntries(makeList({ lines: [line] }), 'metric').open[0]!)).toEqual({ value: '750 g', subValue: '$8.99' })
  })
})

describe('lineActions of a ticked Line (SSP-18)', () => {
  it('Change amount (the viewer has a hand addition), then Untick', () => {
    expect(lineActions(tickedGarlic(), 'ticked')).toEqual(['change-amount', 'untick'])
  })

  it('no Change amount when the viewer added nothing by hand (someone else\'s tick, or a Scan): only Untick', () => {
    const sam = makeTick({ additions: [makeAddition({ who: 'Sam', mine: false })] })
    expect(lineActions(tickedGarlic(sam), 'ticked')).toEqual(['untick'])
    const scan = makeTick({ by: 'scan', additions: [makeAddition({ by: 'scan' })] })
    expect(lineActions(tickedGarlic(scan), 'ticked')).toEqual(['untick'])
  })

  it('"Mark it" still comes first, and a ticked extra also offers Delete, last', () => {
    const marked = { ...tickedGarlic(), markIt: { date: '2026-11-03', mealSlotId: 3 } }
    expect(lineActions(marked, 'ticked')).toEqual(['mark-it', 'change-amount', 'untick'])
    const extra = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000, ticked: true, tick: makeTick() }), 'metric')
    expect(lineActions(extra, 'ticked')).toEqual(['change-amount', 'untick', 'delete'])
    expect(lineActions(extraEntry(makeExtra({ ticked: true, tick: makeTick({ added: null, additions: [makeAddition({ quantity: null })] }) }), 'metric'), 'ticked')).toEqual(['change-amount', 'untick', 'delete'])
  })

  it('open Lines add Get something else… (B9-43); Not needed Lines are as before', () => {
    expect(lineActions(lineEntry(makeGarlic(), 'USD', 'metric'), 'open')).toEqual(['get-something-else', 'not-needed'])
    expect(lineActions(lineEntry(makeGarlic(), 'USD', 'metric'), 'not-needed')).toEqual(['needed-after-all'])
  })

  it('the "more since your tick" row offers Not needed (it takes only the difference off)', () => {
    const { open } = listEntries(makeList({ lines: [makeLine({ ingredientId: 5, ticked: true, more: 750, quantity: 750, tick: makeTick() })] }), 'metric')
    expect(lineActions(open[0]!, 'open')).toEqual(['not-needed'])
  })
})

describe('metaWidth: how wide a column a long meta needs before it shows uncut (SSP-05, P23 in the card grid)', () => {
  it('short metas, and metas with no compact form, are ListRow\'s 12 rem case', () => {
    expect(metaWidth({ text: 'More since your tick', compact: 'More needed' })).toBeUndefined()
    expect(metaWidth({ text: 'Added twice · Sam 50 g, you 50 g but no compact form' })).toBeUndefined()
  })
  it('two additions (27 to 34 characters) need the middle width; three need the wide one', () => {
    const two = rowMeta(tickedGarlic(makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 50 }), makeAddition({ quantity: 50, clientUuid: 'u-2' })] })))
    expect(metaWidth(two)).toBe('m')
    const three = rowMeta(tickedGarlic(makeTick({ additions: ['Ann', 'Sam', 'You'].map((who, i) => makeAddition({ who, mine: who === 'You', quantity: 40, clientUuid: `u-${i}` })) })))
    expect(metaWidth(three)).toBe('l')
  })
})
