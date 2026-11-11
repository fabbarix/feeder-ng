import { describe, expect, it } from 'vitest'
import type { TodayData } from '../types'
import { composeToday } from './compose'

const quiet: TodayData = {
  scanSessionActive: false,
  hasNextMeal: false,
  spoiled: 0,
  advanceSteps: 0,
  toConfirm: 0,
  couldntPlan: 0,
  leftovers: 0,
  useSoon: 0,
  streakDays: 0,
}

const busy: TodayData = {
  ...quiet,
  hasNextMeal: true,
  spoiled: 2,
  advanceSteps: 1,
  toConfirm: 1,
  couldntPlan: 1,
  leftovers: 2,
  useSoon: 3,
  streakDays: 5,
}

function tilesOf(data: TodayData) {
  const layout = composeToday(data)
  if (layout.mode !== 'today') throw new Error('expected the today layout')
  return layout
}

describe('composeToday', () => {
  it('is the Shopping List while a scan session is active, whatever else is going on', () => {
    expect(composeToday({ ...busy, scanSessionActive: true })).toEqual({ mode: 'shopping' })
    expect(composeToday({ ...quiet, scanSessionActive: true })).toEqual({ mode: 'shopping' })
  })

  it('orders tiles by the Today hierarchy: the hero first, housekeeping last', () => {
    const { tiles, empty } = tilesOf(busy)
    expect(empty).toBe(false)
    expect(tiles).toEqual([
      { id: 'nextMeal' },
      { id: 'toConfirm' },
      { id: 'advanceSteps' },
      { id: 'leftovers' },
      { id: 'useSoon' },
      { id: 'streak' },
      { id: 'spoiled' },
      { id: 'couldntPlan' },
    ])
  })

  it("tonight's dinner is first even when there is a lot of housekeeping", () => {
    expect(tilesOf({ ...busy, spoiled: 9, toConfirm: 3 }).tiles[0]).toEqual({ id: 'nextMeal' })
  })

  it('drops tiles that have nothing to show', () => {
    const { tiles } = tilesOf({ ...quiet, hasNextMeal: true, leftovers: 1 })
    expect(tiles.map((t) => t.id)).toEqual(['nextMeal', 'leftovers'])
  })

  it('shows the streak only from one day on', () => {
    expect(tilesOf({ ...quiet, hasNextMeal: true, streakDays: 0 }).tiles.map((t) => t.id)).toEqual(['nextMeal'])
    expect(tilesOf({ ...quiet, hasNextMeal: true, streakDays: 1 }).tiles.map((t) => t.id)).toEqual(['nextMeal', 'streak'])
  })

  it('is empty when nothing but the streak could show', () => {
    expect(tilesOf(quiet)).toEqual({ mode: 'today', tiles: [], empty: true, failed: false, heroSpan: 'row' })
    const withStreak = tilesOf({ ...quiet, streakDays: 12 })
    expect(withStreak.empty).toBe(true)
    expect(withStreak.tiles.map((t) => t.id)).toEqual(['streak'])
  })

  it('is not empty with a single Advance Step', () => {
    expect(tilesOf({ ...quiet, advanceSteps: 1 }).empty).toBe(false)
  })

  it('without a next meal the rest keeps its order, spoiled lots after the half tiles', () => {
    expect(tilesOf({ ...quiet, spoiled: 1, leftovers: 1 }).tiles.map((t) => t.id)).toEqual(['leftovers', 'spoiled'])
  })

  // R2-2: the hero spans 2x2 only when a small tile can sit beside it; otherwise it takes the full row (no hole).
  describe('heroSpan', () => {
    const hero = { ...quiet, hasNextMeal: true }
    it('is the full row for the hero alone', () => {
      expect(tilesOf(hero).heroSpan).toBe('row')
    })
    it('is the full row for the hero with only full-span tiles (To confirm, Throw out or keep?, Couldn\'t plan)', () => {
      expect(tilesOf({ ...hero, couldntPlan: 2 }).heroSpan).toBe('row')
      expect(tilesOf({ ...hero, toConfirm: 1, spoiled: 1, couldntPlan: 1 }).heroSpan).toBe('row')
    })
    it('is the full row for the hero with the setup checklist', () => {
      expect(tilesOf({ ...hero, needsSetup: true }).heroSpan).toBe('row')
    })
    it.each([
      ['advanceSteps', { advanceSteps: 1 }],
      ['leftovers', { leftovers: 1 }],
      ['useSoon', { useSoon: 1 }],
      ['streak', { streakDays: 3 }],
    ])('is 2x2 (block) when the small tile %s is present', (_n, extra) => {
      expect(tilesOf({ ...hero, ...extra }).heroSpan).toBe('block')
      expect(tilesOf({ ...hero, ...extra, couldntPlan: 1, toConfirm: 1 }).heroSpan).toBe('block')
    })
    it('is 2x2 for a busy day', () => {
      expect(tilesOf(busy).heroSpan).toBe('block')
    })
  })

  it('is never empty when a load failed: the layout says so instead of "nothing on the menu"', () => {
    const layout = tilesOf({ ...quiet, loadFailed: true })
    expect(layout.failed).toBe(true)
    expect(layout.empty).toBe(false)
  })

  it('is not failed by default', () => {
    expect(tilesOf(quiet).failed).toBe(false)
  })
})
