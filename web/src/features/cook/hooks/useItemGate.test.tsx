// CRS F (spec 11): Next is held only by timers of the next item's own Course.
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAIN_SCOPE, SIDE_SCOPE, timelineView, timer } from '../timeline-fixtures'
import { visibleItems } from '../lib/timeline'
import { useItemGate } from './useItemGate'

const items = () => visibleItems(timelineView(), 'all')
const timerItem = (over: Parameters<typeof timer>[0], seconds = 252) => ({ timer: timer(over), seconds })

describe('useItemGate', () => {
  it('holds Next while the next item\'s Course has a timer counting for a Step it waits for, and says which', () => {
    const next = vi.fn()
    // from item index 2 (Main step 1) the next item is Side step 1, which waits for Side step 0
    const { result } = renderHook(() => useItemGate(items(), 2, [timerItem({ scope: SIDE_SCOPE, step: 0 })], next))
    expect(result.current.canNext).toBe(false)
    expect(result.current.heldText).toBe('Next waits for Green beans · Simmer the beans: 4:12 left. Cancel its timer to go on now.')
    result.current.next()
    expect(next).not.toHaveBeenCalled()
  })

  it('a timer of another Course for the same Step index does not hold', () => {
    const next = vi.fn()
    const { result } = renderHook(() => useItemGate(items(), 2, [timerItem({ scope: MAIN_SCOPE, step: 0 })], next))
    expect(result.current.canNext).toBe(true)
    expect(result.current.heldText).toBeNull()
    result.current.next()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('several holding timers: one line with the count and the longest time', () => {
    const all = items()
    const waiting = [{ ...all[3]!, item: { ...all[3]!.item, after: [0, 1] } }]
    const holders = [timerItem({ id: 1, scope: SIDE_SCOPE, step: 0 }, 60), timerItem({ id: 2, scope: SIDE_SCOPE, step: 1 }, 125)]
    const { result } = renderHook(() => useItemGate([all[2]!, ...waiting], 0, holders, () => {}))
    expect(result.current.heldText).toBe('Next waits for 2 timers: 2:05 left. Cancel them to go on now.')
  })

  it('at the last item nothing is next, so nothing holds', () => {
    const { result } = renderHook(() => useItemGate(items(), 3, [timerItem({ scope: SIDE_SCOPE, step: 0 })], () => {}))
    expect(result.current.canNext).toBe(true)
  })

  it('in the single-Course view the next item is that Course\'s own, as in the old Next gate', () => {
    const side = visibleItems(timelineView(), 2)
    const { result } = renderHook(() => useItemGate(side, 0, [timerItem({ scope: SIDE_SCOPE, step: 0 })], () => {}))
    expect(result.current.canNext).toBe(false)
  })
})
