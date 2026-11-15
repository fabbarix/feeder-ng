// B9-40 (PC-03, SHORT-01): which timer pills the Cook strip shows and in what order.
import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { splitPills, stripOrder, visiblePillCount } from './timers'

const t = (id: number): { timer: CookTimer; seconds: number } => ({
  timer: { id, scope: 'recipe:1', step: id, label: `T${id}`, durationSeconds: 60, state: 'running', remainingSeconds: 60, endsAt: null, startedAt: '' },
  seconds: 60,
})

describe('visiblePillCount (SHORT-01: only whole pills; two from 700 px, one below)', () => {
  it('844 wide shows two, 568 wide shows one', () => {
    expect(visiblePillCount(844)).toBe(2)
    expect(visiblePillCount(568)).toBe(1)
  })
  it('the edge is 700 px', () => {
    expect(visiblePillCount(700)).toBe(2)
    expect(visiblePillCount(699)).toBe(1)
    expect(visiblePillCount(560)).toBe(1)
  })
})

describe('stripOrder (PC-03: the timer that holds Next comes first)', () => {
  it('moves the holding timers to the front and keeps the order of the rest', () => {
    const items = [t(1), t(2), t(3), t(4)]
    expect(stripOrder(items, [3]).map((i) => i.timer.id)).toEqual([3, 1, 2, 4])
    expect(stripOrder(items, [4, 2]).map((i) => i.timer.id)).toEqual([2, 4, 1, 3])
  })
  it('with nothing holding Next the order is unchanged, and the input is not mutated', () => {
    const items = [t(1), t(2)]
    expect(stripOrder(items, []).map((i) => i.timer.id)).toEqual([1, 2])
    expect(stripOrder(items, [2])).not.toBe(items)
    expect(items.map((i) => i.timer.id)).toEqual([1, 2])
  })
  it('an id that is not in the list is ignored', () => {
    expect(stripOrder([t(1), t(2)], [9]).map((i) => i.timer.id)).toEqual([1, 2])
  })
})

describe('splitPills (the last whole pill carries "+N" for the rest)', () => {
  it('three timers with room for two: two shown and 1 more', () => {
    const r = splitPills([t(1), t(2), t(3)], 2)
    expect(r.shown.map((i) => i.timer.id)).toEqual([1, 2])
    expect(r.more).toBe(1)
  })
  it('one pill of five: 4 more', () => {
    expect(splitPills([t(1), t(2), t(3), t(4), t(5)], 1).more).toBe(4)
  })
  it('room for all, or no limit: nothing more', () => {
    expect(splitPills([t(1), t(2)], 2).more).toBe(0)
    const all = splitPills([t(1), t(2), t(3)])
    expect(all.shown).toHaveLength(3)
    expect(all.more).toBe(0)
  })
  it('no timers', () => {
    expect(splitPills([], 2)).toEqual({ shown: [], more: 0 })
  })
})
