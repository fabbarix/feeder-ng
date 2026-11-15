// B9-44 (TB-02): the pure parts of the Advance Steps tile: the badge's two lines, the meta, the first four rows, the names.
// New module lib/advanceSteps.ts: badgeFor, metaFor, splitShown, doneName, doneToast.
import { describe, expect, it } from 'vitest'
import type { AdvanceStepDue } from '../types'
import { badgeFor, doneName, doneToast, metaFor, splitShown } from './advanceSteps'

const step = (over: Partial<AdvanceStepDue> = {}): AdvanceStepDue => ({
  scope: 'plan:2026-11-10:2:5', step: 0, mealDate: '2026-11-10', mealSlotId: 2, mealSlotName: 'Dinner', recipeName: 'Cauliflower al gorgonzola',
  description: 'Take the cauliflower out of the freezer', dueAt: '2026-11-09T18:00:00Z', dueTime: '19:00', slotTime: '19:00', state: 'upcoming', overdue: false, ...over,
})

describe('badgeFor: the When badge, "Today" / "Mon" / "Overdue" over the due time', () => {
  it('says Today for a Step due on the Household date, with the due time below', () => {
    expect(badgeFor(step(), '2026-11-09', 'Europe/Rome')).toEqual({ top: 'Today', bottom: '19:00', overdue: false })
  })
  it('says the short weekday of the due day for a Step due tomorrow', () => {
    expect(badgeFor(step({ dueAt: '2026-11-10T09:00:00Z', dueTime: '10:00' }), '2026-11-09', 'Europe/Rome')).toEqual({ top: 'Tue', bottom: '10:00', overdue: false })
  })
  it('reads the due day in the Household zone, not the device zone', () => {
    // 23:30 UTC on Mon is already Tue 00:30 in Rome
    expect(badgeFor(step({ dueAt: '2026-11-09T23:30:00Z', dueTime: '00:30' }), '2026-11-09', 'Europe/Rome').top).toBe('Tue')
    expect(badgeFor(step({ dueAt: '2026-11-09T23:30:00Z', dueTime: '18:30' }), '2026-11-09', 'America/New_York').top).toBe('Today')
  })
  it('says Overdue, solid, for an overdue Step whatever its day', () => {
    expect(badgeFor(step({ overdue: true, dueAt: '2026-11-08T18:00:00Z', dueTime: '19:00' }), '2026-11-09', 'Europe/Rome')).toEqual({ top: 'Overdue', bottom: '19:00', overdue: true })
  })
})

describe('metaFor: "For <Day> <Meal Slot> · <Recipe>"', () => {
  it('names the day of the Planned Meal, its Meal Slot and the Recipe', () => {
    expect(metaFor(step())).toBe('For Tue Dinner · Cauliflower al gorgonzola')
  })
  it('leaves the Meal Slot out when the server did not say it', () => {
    expect(metaFor(step({ mealSlotName: undefined }))).toBe('For Tue · Cauliflower al gorgonzola')
  })
})

describe('splitShown: the first 4 rows, then "Show N more"', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => step({ step: i, description: `Step ${i}` }))
  it('shows up to 4 and counts the rest', () => {
    expect(splitShown(many(6)).rows).toHaveLength(4)
    expect(splitShown(many(6)).more).toBe(2)
  })
  it('4 or fewer: no more', () => {
    expect(splitShown(many(4))).toMatchObject({ more: 0 })
    expect(splitShown(many(4)).rows).toHaveLength(4)
    expect(splitShown(many(1)).rows).toHaveLength(1)
  })
  it('keeps the order it is given (the server sorts soonest first)', () => {
    expect(splitShown(many(6)).rows.map((s) => s.description)).toEqual(['Step 0', 'Step 1', 'Step 2', 'Step 3'])
  })
})

describe('names and the Done toast', () => {
  it('the button is named "Done: <Step text>"', () => {
    expect(doneName(step())).toBe('Done: Take the cauliflower out of the freezer')
  })
  it('the toast has a headline, the muted meta as subline and the Step text as body', () => {
    expect(doneToast(step())).toEqual({
      headline: 'Advance Step done',
      subline: 'For Tue Dinner · Cauliflower al gorgonzola',
      body: 'Take the cauliflower out of the freezer',
    })
  })
})
