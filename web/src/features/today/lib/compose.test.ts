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
  linesToGet: 0,
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
  linesToGet: 6,
}

function tilesOf(data: TodayData) {
  const layout = composeToday(data)
  if (layout.mode !== 'today') throw new Error('expected the today layout')
  return layout
}

describe('composeToday', () => {
  // B9-44 (TB-12, changed on purpose): a Scan session is a tile (`shopping`, first), no longer a mode (see compose.tb03.test.ts).
  it('a scan session adds the shopping tile first and keeps the rest of Today', () => {
    expect(composeToday({ ...busy, scanSessionActive: true })).toMatchObject({ mode: 'today' })
    expect(tilesOf({ ...busy, scanSessionActive: true }).tiles[0]).toEqual({ id: 'shopping' })
  })

  // B9-44 (TB-03, changed on purpose): Advance Steps and the metric strip sit in the aside, right after To confirm; Throw out or keep? comes before Leftovers.
  it('orders tiles by the Today hierarchy: the hero, To confirm, the aside (Advance Steps, the metric strip), then the rest', () => {
    const { tiles, empty } = tilesOf(busy)
    expect(empty).toBe(false)
    expect(tiles).toEqual([
      { id: 'nextMeal' },
      { id: 'toConfirm' },
      { id: 'advanceSteps' },
      { id: 'metrics' },
      { id: 'couldntPlan' },
      { id: 'spoiled' },
      { id: 'leftovers' },
      { id: 'useSoon' },
    ])
  })

  it("tonight's dinner is first even when there is a lot of housekeeping", () => {
    expect(tilesOf({ ...busy, spoiled: 9, toConfirm: 3 }).tiles[0]).toEqual({ id: 'nextMeal' })
  })

  // DS-TODAY round 2: the Leftovers tile shows its own count, so Leftovers alone no longer opens the metric strip.
  it('drops tiles that have nothing to show', () => {
    const { tiles } = tilesOf({ ...quiet, hasNextMeal: true, leftovers: 1 })
    expect(tiles.map((t) => t.id)).toEqual(['nextMeal', 'leftovers'])
  })

  // DS-TODAY (changed on purpose): the streak tile became the metric strip (streak, Leftovers to use, Lines to get).
  it('shows the metric strip when the streak (from one day on) or Lines to get has a value', () => {
    const ids = (extra: Partial<TodayData>) => tilesOf({ ...quiet, hasNextMeal: true, ...extra }).tiles.map((t) => t.id)
    expect(ids({ streakDays: 0 })).toEqual(['nextMeal'])
    expect(ids({ streakDays: 1 })).toEqual(['nextMeal', 'metrics'])
    expect(ids({ linesToGet: 3 })).toEqual(['nextMeal', 'metrics'])
    expect(ids({ leftovers: 2 })).toEqual(['nextMeal', 'leftovers']) // the Leftovers tile is not duplicated by a metric
  })

  it('is one strip, however many metrics: the id appears once', () => {
    expect(tilesOf(busy).tiles.filter((t) => t.id === 'metrics')).toHaveLength(1)
  })

  it('is empty when nothing but the metric strip could show', () => {
    expect(tilesOf(quiet)).toEqual({ mode: 'today', tiles: [], aside: [], empty: true, failed: false })
    const withStreak = tilesOf({ ...quiet, streakDays: 12, linesToGet: 4 })
    expect(withStreak.empty).toBe(true)
    expect(withStreak.tiles.map((t) => t.id)).toEqual(['metrics'])
  })

  it('is not empty with a single Advance Step', () => {
    expect(tilesOf({ ...quiet, advanceSteps: 1 }).empty).toBe(false)
  })

  it('without a next meal the rest keeps its order, Throw out or keep? before the Leftovers', () => {
    expect(tilesOf({ ...quiet, spoiled: 1, leftovers: 1 }).tiles.map((t) => t.id)).toEqual(['spoiled', 'leftovers'])
  })

  // DS-TODAY (changed on purpose): no `heroSpan`. The hero always takes the whole row; the 2x2 back-fill on the 3-column
  // grid is gone with the fixed column counts (ADR 0016).
  it('has no heroSpan: the hero is always the full row', () => {
    expect('heroSpan' in tilesOf({ ...quiet, hasNextMeal: true, leftovers: 1 })).toBe(false)
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
