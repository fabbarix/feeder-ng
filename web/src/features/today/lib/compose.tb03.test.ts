// B9-44 (TB-03, TB-12, TB 1, TB 3): composeToday for the new grid. Every tile is listed in DOM order; the aside's tiles
// (Advance Steps, the metric strip) follow To confirm in the DOM, and CSS order moves the metric strip to the end on a phone and a tablet.
// The Scan session is a tile (`shopping`, first), not a mode: the layout is always 'today'.
import { describe, expect, it } from 'vitest'
import type { TodayData } from '../types'
import { composeToday } from './compose'

const quiet: TodayData = {
  scanSessionActive: false, hasNextMeal: false, spoiled: 0, advanceSteps: 0, toConfirm: 0, couldntPlan: 0, leftovers: 0, useSoon: 0, streakDays: 0, linesToGet: 0,
}
const busy: TodayData = { ...quiet, hasNextMeal: true, spoiled: 2, advanceSteps: 1, toConfirm: 1, couldntPlan: 1, leftovers: 2, useSoon: 3, streakDays: 5, linesToGet: 6 }
const today = (d: TodayData) => {
  const l = composeToday(d)
  if (l.mode !== 'today') throw new Error('expected the today layout')
  return l
}
const ids = (d: TodayData) => today(d).tiles.map((t) => t.id)

describe('composeToday: the order of the tiles (TB-03)', () => {
  it('is hero, To confirm, Advance Steps, the metric strip, Couldn’t plan, Throw out or keep?, Leftovers, Use soon in the DOM', () => {
    expect(ids(busy)).toEqual(['nextMeal', 'toConfirm', 'advanceSteps', 'metrics', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon'])
  })

  it('names the aside: Advance Steps, then the metric strip, right after To confirm in the DOM', () => {
    const l = today(busy)
    expect(l.aside).toEqual(['advanceSteps', 'metrics'])
    const i = ids(busy)
    expect(i.indexOf('advanceSteps')).toBe(i.indexOf('toConfirm') + 1)
    expect(i.indexOf('metrics')).toBe(i.indexOf('advanceSteps') + 1)
  })

  it('the aside lists only the tiles that are present', () => {
    expect(today({ ...busy, advanceSteps: 0 }).aside).toEqual(['metrics'])
    expect(today({ ...busy, streakDays: 0, linesToGet: 0 }).aside).toEqual(['advanceSteps'])
    expect(today({ ...busy, advanceSteps: 0, streakDays: 0, linesToGet: 0 }).aside).toEqual([])
  })

  it('every aside id is in tiles, and nothing outside the two is in the aside', () => {
    const l = today(busy)
    for (const id of l.aside ?? []) expect(l.tiles.map((t) => t.id)).toContain(id)
    expect((l.aside ?? []).every((id) => id === 'advanceSteps' || id === 'metrics')).toBe(true)
  })

  it('setup comes first, before the hero, and replaces Couldn’t plan', () => {
    expect(ids({ ...busy, needsSetup: true })).toEqual(['setup', 'nextMeal', 'toConfirm', 'advanceSteps', 'metrics', 'spoiled', 'leftovers', 'useSoon'])
  })

  it('Throw out or keep? comes before Leftovers and Use soon (the chapter’s phone order)', () => {
    const i = ids(busy)
    expect(i.indexOf('spoiled')).toBeLessThan(i.indexOf('leftovers'))
    expect(i.indexOf('leftovers')).toBeLessThan(i.indexOf('useSoon'))
    expect(i.indexOf('couldntPlan')).toBeLessThan(i.indexOf('spoiled'))
  })
})

describe('composeToday: the Zero-waste streak at 0 is hidden on Today (TB 3)', () => {
  it('a streak of 0 days opens no metric strip on its own', () => {
    expect(ids({ ...quiet, hasNextMeal: true, streakDays: 0 })).toEqual(['nextMeal'])
  })
  it('from 1 day the strip shows; Lines to get alone also shows it', () => {
    expect(ids({ ...quiet, hasNextMeal: true, streakDays: 1 })).toEqual(['nextMeal', 'metrics'])
    expect(ids({ ...quiet, hasNextMeal: true, linesToGet: 2 })).toEqual(['nextMeal', 'metrics'])
  })
})

describe('composeToday: the Scan session is the first tile (TB-12)', () => {
  it('is the layout of Today with a `shopping` tile first, never a mode', () => {
    const l = today({ ...busy, scanSessionActive: true })
    expect(l.tiles[0]).toEqual({ id: 'shopping' })
    expect(l.tiles.slice(1).map((t) => t.id)).toEqual(ids(busy))
    expect(l).not.toHaveProperty('mode', 'shopping')
  })
  it('comes before the setup checklist too', () => {
    expect(ids({ ...quiet, needsSetup: true, scanSessionActive: true })).toEqual(['shopping', 'setup'])
  })
  it('is not in the aside, and it makes Today not empty', () => {
    const l = today({ ...quiet, scanSessionActive: true })
    expect(l.aside).toEqual([])
    expect(l.empty).toBe(false)
  })
  it('without a session there is no shopping tile', () => {
    expect(ids(busy)).not.toContain('shopping')
  })
})

describe('composeToday: empty and failed', () => {
  it('is empty when nothing but the metric strip could show; the aside keeps the strip', () => {
    const l = today({ ...quiet, streakDays: 12, linesToGet: 4 })
    expect(l.empty).toBe(true)
    expect(l.aside).toEqual(['metrics'])
  })
  it('a failed load is not empty', () => {
    expect(today({ ...quiet, loadFailed: true })).toMatchObject({ empty: false, failed: true })
  })
})
