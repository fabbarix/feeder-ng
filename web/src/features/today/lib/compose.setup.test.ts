import { describe, expect, it } from 'vitest'
import type { TodayData } from '../types'
import { composeToday } from './compose'

const quiet: TodayData = {
  scanSessionActive: false, hasNextMeal: false, spoiled: 0, advanceSteps: 0, toConfirm: 0, couldntPlan: 0, leftovers: 0, useSoon: 0, streakDays: 0, linesToGet: 0,
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

  // B9-44 (TB-03, changed on purpose): Couldn't plan comes before Throw out or keep? on a phone.
  it('without setup, Couldn\'t plan is a tile as before (before Throw out or keep?)', () => {
    expect(ids({ ...quiet, couldntPlan: 9, spoiled: 1 })).toEqual(['couldntPlan', 'spoiled'])
  })

  it('needsSetup left out means not needed', () => {
    expect(ids({ ...quiet, couldntPlan: 1 })).toEqual(['couldntPlan'])
  })

  // B9-44 (TB-12, changed on purpose): the session is a tile on top of Today, not a replacement of it.
  it('a scan session adds the shopping tile before the setup checklist', () => {
    expect(ids({ ...quiet, needsSetup: true, scanSessionActive: true })).toEqual(['shopping', 'setup'])
  })
})
