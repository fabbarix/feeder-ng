// B9-40 (PC-03, SHORT-01): which timer pills the Cook strip shows and in what order.
import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { railPlace, splitPills, stripOrder, visiblePillCount } from './timers'

const t = (id: number): { timer: CookTimer; seconds: number } => ({
  timer: { id, scope: 'recipe:1', step: id, label: `T${id}`, durationSeconds: 60, state: 'running', remainingSeconds: 60, endsAt: null, startedAt: '' },
  seconds: 60,
})

// The chapter's edge is 700 px; the breakpoint table (DS-09) has 37.5 em and 48 em, so the edge is 768 px (choice, listed in the hand-back).
describe('visiblePillCount (SHORT-01: only whole pills; two from 768 px, one below)', () => {
  it('844 wide shows two, 667 wide (the smallest landscape, A1) shows one', () => {
    expect(visiblePillCount(844)).toBe(2)
    expect(visiblePillCount(667)).toBe(1)
  })
  it('the edge is 768 px', () => {
    expect(visiblePillCount(768)).toBe(2)
    expect(visiblePillCount(767)).toBe(1)
    expect(visiblePillCount(600)).toBe(1)
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

describe('railPlace (the place line of a rail timer tile, PC-03)', () => {
  const timer = (over: Partial<CookTimer>): CookTimer => ({ id: 1, scope: 'recipe:7', step: 0, label: 'Step 1: Pre-heat the oven', durationSeconds: 60, state: 'running', remainingSeconds: 60, endsAt: null, startedAt: '', ...over })
  it('a timer that holds Next says so, with its Step number from the label', () => {
    expect(railPlace(timer({}), 'recipe:7', true)).toBe('Step 1 · next waits for it')
  })
  it('this scope\'s other timers name their Step', () => {
    expect(railPlace(timer({ label: 'Step 4: Simmer the rice', step: 3 }), 'recipe:7', false)).toBe('Step 4')
  })
  it('a free timer has no place line', () => {
    expect(railPlace(timer({ label: 'Eggs', step: null, scope: null }), 'recipe:7', false)).toBe('')
  })
  it('another Recipe\'s timer names its Recipe and its Step', () => {
    expect(railPlace(timer({ scope: 'recipe:9', recipeName: 'Slow cooker stew', label: 'Step 2: Simmer' }), 'recipe:7', false)).toBe('Slow cooker stew · Step 2')
  })
  it('a Planned Meal\'s timer with no Recipe name falls back to the day of the meal', () => {
    expect(railPlace(timer({ scope: 'meal:2026-11-10/3/1', label: 'Step 2: Simmer' }), 'recipe:7', false)).toBe('Tue Planned Meal · Step 2')
  })
})
