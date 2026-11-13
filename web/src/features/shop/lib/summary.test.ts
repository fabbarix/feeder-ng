// DS-SHOP: the metric strip's numbers ("Left to get", the estimated total, the Lines with no Price yet) are derived here, not in a component.
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { shopSummary } from './summary'

describe('shopSummary', () => {
  it('round 2: the progress percent, the "of N left" unit and the meta line are computed here, never in ShopMetrics', () => {
    const s = shopSummary(makeList({ progress: { ticked: 2, total: 18 } }), null)
    expect(s.percent).toBeCloseTo(11.11, 1)
    expect(s.leftOf).toBe('of 18 left')
    expect(s.meta).toBe('2 ticked \u00b7 until Sun 15')
  })
  it('the percent is 0 with an empty list and never above 100', () => {
    expect(shopSummary(makeList({ progress: { ticked: 0, total: 0 } }), null).percent).toBe(0)
    expect(shopSummary(makeList({ progress: { ticked: 5, total: 3 } }), null).percent).toBe(100)
  })
  it('the meta line names the range: "today", "until tomorrow", "until Sun 15"', () => {
    expect(shopSummary(makeList({ to: '2026-11-09' }), null).meta).toBe('0 ticked \u00b7 today')
    expect(shopSummary(makeList({ to: '2026-11-10' }), null).meta).toBe('0 ticked \u00b7 until tomorrow')
  })

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
    expect(shopSummary(makeList({ unpricedLines: 1 }), null).unpriced).toEqual({ count: 1, text: '1 Line has no Price yet' })
    expect(shopSummary(makeList({ unpricedLines: 13 }), null).unpriced).toEqual({ count: 13, text: '13 Lines have no Price yet' })
    expect(shopSummary(makeList({ unpricedLines: 0 }), null).unpriced).toBeNull()
  })
})
