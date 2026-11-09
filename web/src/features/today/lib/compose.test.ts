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

  it('orders tiles by urgency and sizes them', () => {
    const { tiles, empty } = tilesOf(busy)
    expect(empty).toBe(false)
    expect(tiles).toEqual([
      { id: 'nextMeal', size: 'lg', tone: 'accent' },
      { id: 'spoiled', size: 'full', tone: 'spoil' },
      { id: 'advanceSteps', size: 'wide', tone: 'neutral' },
      { id: 'toConfirm', size: 'md', tone: 'neutral' },
      { id: 'couldntPlan', size: 'wide', tone: 'neutral' },
      { id: 'leftovers', size: 'md', tone: 'leftover' },
      { id: 'useSoon', size: 'md', tone: 'spoil' },
      { id: 'streak', size: 'sm', tone: 'accent' },
    ])
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
    expect(tilesOf(quiet)).toEqual({ mode: 'today', tiles: [], empty: true })
    const withStreak = tilesOf({ ...quiet, streakDays: 12 })
    expect(withStreak.empty).toBe(true)
    expect(withStreak.tiles.map((t) => t.id)).toEqual(['streak'])
  })

  it('is not empty with a single Advance Step', () => {
    expect(tilesOf({ ...quiet, advanceSteps: 1 }).empty).toBe(false)
  })

  it('puts spoiled lots first when there is no next meal', () => {
    expect(tilesOf({ ...quiet, spoiled: 1, leftovers: 1 }).tiles.map((t) => t.id)).toEqual(['spoiled', 'leftovers'])
  })
})
