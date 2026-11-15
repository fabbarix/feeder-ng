// B9-44 (RES-05): Today remembers the tile ids and row counts of its last layout in localStorage `feeder.today.layout`, and shows that
// shape as its skeleton while the plan is on its way, so nothing is inserted above a painted tile. New module lib/layoutMemory.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import type { TodayLayout } from '../types'
import { LAYOUT_KEY, recallLayout, rememberLayout } from './layoutMemory'

const layout = (ids: string[], extra: Partial<Extract<TodayLayout, { mode: 'today' }>> = {}): TodayLayout => ({
  mode: 'today', tiles: ids.map((id) => ({ id })) as never, aside: [], empty: false, ...extra,
})

beforeEach(() => localStorage.clear())

describe('rememberLayout / recallLayout', () => {
  it('uses the key feeder.today.layout', () => {
    expect(LAYOUT_KEY).toBe('feeder.today.layout')
  })

  it('round-trips the tile ids in order with their row counts', () => {
    rememberLayout(layout(['nextMeal', 'toConfirm', 'advanceSteps', 'metrics']), { toConfirm: 3, advanceSteps: 2 })
    expect(recallLayout()).toEqual({
      tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 3 }, { id: 'advanceSteps', rows: 2 }, { id: 'metrics' }],
    })
    expect(localStorage.getItem(LAYOUT_KEY)).not.toBeNull()
  })

  it('caps a tile’s remembered rows at 4 (the skeleton is a shape, not a copy)', () => {
    rememberLayout(layout(['nextMeal', 'toConfirm']), { toConfirm: 9 })
    expect(recallLayout().tiles.find((t) => t.id === 'toConfirm')?.rows).toBe(4)
  })

  it('first launch (nothing stored): the hero and one To confirm row', () => {
    expect(recallLayout()).toEqual({ tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 1 }] })
  })

  it('a stored value that is not a layout reads as first launch, and never throws', () => {
    for (const bad of ['not json', '{}', '{"tiles":3}', '{"tiles":[{"id":"bogus"}]}', 'null']) {
      localStorage.setItem(LAYOUT_KEY, bad)
      expect(recallLayout(), bad).toEqual({ tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 1 }] })
    }
  })

  it('does not remember the transient Shopping tile, nor a layout of nothing, nor a failed or empty Today', () => {
    rememberLayout(layout(['shopping', 'nextMeal']), {})
    expect(recallLayout().tiles.map((t) => t.id)).toEqual(['nextMeal'])
    localStorage.clear()
    rememberLayout(layout([]), {})
    rememberLayout(layout(['nextMeal'], { failed: true }), {})
    rememberLayout(layout(['metrics'], { empty: true }), {})
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull()
  })

  it('a storage that throws (private window) is not an error', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(() => rememberLayout(layout(['nextMeal']), {}, broken)).not.toThrow()
    expect(recallLayout(broken)).toEqual({ tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 1 }] })
  })
})
