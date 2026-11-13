// DS-SHOP: the metric strip's numbers ("Left to get", the estimated total, the Lines with no Price yet) are derived here, not in a component.
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { shopSummary } from './summary'

describe('shopSummary', () => {
  it('counts what is left from the server progress (Not needed Lines are not in it)', () => {
    const s = shopSummary(makeList({ progress: { ticked: 2, total: 18 }, notNeeded: [makeLine()] }), 'Coop')
    expect(s.left).toBe(16)
    expect(s.total).toBe(18)
    expect(s.ticked).toBe(2)
  })

  it('formats the estimated total in the household currency, with "est. at <Shop>" (or "est." without a Shop)', () => {
    expect(shopSummary(makeList({ estimatedCostCents: 1966 }), 'Coop').estimated).toEqual({ text: '$19.66', caption: 'est. at Coop' })
    expect(shopSummary(makeList({ estimatedCostCents: 1966 }), null).estimated).toEqual({ text: '$19.66', caption: 'est.' })
  })

  it('has no estimate when nothing is priced (no "$0.00", no dash)', () => {
    expect(shopSummary(makeList({ estimatedCostCents: 0 }), 'Coop').estimated).toBeNull()
  })

  it('says how many Lines have no Price yet, singular and plural; null when all have one', () => {
    expect(shopSummary(makeList({ unpricedLines: 1 }), null).unpriced).toEqual({ count: 1, text: '1 line has no Price yet' })
    expect(shopSummary(makeList({ unpricedLines: 13 }), null).unpriced).toEqual({ count: 13, text: '13 lines have no Price yet' })
    expect(shopSummary(makeList({ unpricedLines: 0 }), null).unpriced).toBeNull()
  })
})
