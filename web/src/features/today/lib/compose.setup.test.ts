import { describe, expect, it } from 'vitest'
import type { TodayData } from '../types'
import { composeToday } from './compose'

const quiet: TodayData = {
  scanSessionActive: false, hasNextMeal: false, spoiled: 0, advanceSteps: 0, toConfirm: 0, couldntPlan: 0, leftovers: 0, useSoon: 0, streakDays: 0,
}
const ids = (d: TodayData) => {
  const l = composeToday(d)
  if (l.mode !== 'today') throw new Error('today layout expected')
  return l.tiles.map((t) => t.id)
}

describe('composeToday: the first-run setup checklist (R13)', () => {
  it('shows the setup tile first, and is not the "nothing on the menu" empty state', () => {
    const l = composeToday({ ...quiet, needsSetup: true })
    expect(l).toMatchObject({ mode: 'today', empty: false })
    expect(ids({ ...quiet, needsSetup: true })).toEqual(['setup'])
  })

  it('replaces Couldn\'t plan while the household is being set up', () => {
    expect(ids({ ...quiet, needsSetup: true, couldntPlan: 9 })).toEqual(['setup'])
  })

  it('without setup, Couldn\'t plan is a tile as before (last, after Throw out or keep)', () => {
    expect(ids({ ...quiet, couldntPlan: 9, spoiled: 1 })).toEqual(['spoiled', 'couldntPlan'])
  })

  it('needsSetup left out means not needed', () => {
    expect(ids({ ...quiet, couldntPlan: 1 })).toEqual(['couldntPlan'])
  })

  it('a scan session still wins over everything', () => {
    expect(composeToday({ ...quiet, needsSetup: true, scanSessionActive: true })).toEqual({ mode: 'shopping' })
  })
})
