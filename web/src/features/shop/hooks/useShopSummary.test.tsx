// DS-SHOP: the metric strip and the notice are derived once per list, by a hook over the lib functions.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeLine, makeList, makePast } from '../testData'
import { useShopSummary } from './useShopSummary'

describe('useShopSummary', () => {
  it('returns the summary and the notice of the list', () => {
    const list = makeList({ progress: { ticked: 0, total: 1 }, estimatedCostCents: 318, lines: [makeLine({ pastPlannedMeals: [makePast()] })] })
    const { result } = renderHook(() => useShopSummary(list, 'Coop'))
    expect(result.current.summary.left).toBe(1)
    expect(result.current.summary.estimated).toEqual({ text: '$3.18', caption: 'est. at Coop' })
    expect(result.current.notice?.text).toBe("Tue Dinner isn't marked Cooked yet")
  })

  it('no notice without unconfirmed past meals', () => {
    const { result } = renderHook(() => useShopSummary(makeList(), null))
    expect(result.current.notice).toBeNull()
  })

  it('keeps the same objects while the list and the Shop are the same, and follows a new list', () => {
    const list = makeList()
    const { result, rerender } = renderHook(({ l }) => useShopSummary(l, 'Coop'), { initialProps: { l: list } })
    const first = result.current
    rerender({ l: list })
    expect(result.current).toBe(first)
    rerender({ l: makeList({ progress: { ticked: 1, total: 1 } }) })
    expect(result.current.summary.left).toBe(0)
  })
})
