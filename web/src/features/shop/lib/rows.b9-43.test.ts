// B9-43 (SSP-14, decision SSP 6): "Get something else…" is offered on an open food or Supply Line, before Not needed; not on an extra, a
// ticked entry, a Not needed Line, nor on the "more since your tick" row (that row takes only the difference off).
import { describe, expect, it } from 'vitest'
import { extraEntry, lineEntry, listEntries } from './lines'
import { lineActions } from './rows'
import { makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'

describe('lineActions: Get something else… (SSP-14)', () => {
  it('a Supply Line is a Line too', () => {
    const supply = lineEntry(makeLine({ kind: 'supply', restock: { level: 4, stock: 2 } }), 'USD', 'metric')
    expect(lineActions(supply, 'open')).toEqual(['get-something-else', 'not-needed'])
  })
  it('not on an extra (it has no Planned Meals to be short), a ticked Line, or a Not needed Line', () => {
    expect(lineActions(extraEntry(makeExtra(), 'metric'), 'open')).toEqual(['delete'])
    expect(lineActions(lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'metric'), 'ticked')).not.toContain('get-something-else')
    expect(lineActions(lineEntry(makeGarlic(), 'USD', 'metric'), 'not-needed')).toEqual(['needed-after-all'])
  })
  it('not on the "more since your tick" row: it offers Not needed only', () => {
    const { open } = listEntries(makeList({ lines: [makeLine({ ingredientId: 5, ticked: true, more: 750, quantity: 750, tick: makeTick() })] }), 'metric')
    expect(lineActions(open[0]!, 'open')).toEqual(['not-needed'])
  })
})
