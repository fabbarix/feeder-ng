import { describe, expect, it } from 'vitest'
import type { MealSlot } from '../types'
import { batchRequest, changedFields, hasChanges, matchingSlots, quickPicks, resultMessage, sameDays, summaryLines } from './multiDay'

const att = (...ids: number[]) => ids.map((memberId) => ({ memberId, portionFactorOverride: null }))
const slot = (id: number, weekday: number, name: string, time = '19:00', attendance = att(1, 2)): MealSlot => ({ id, weekday, name, time, attendance, portionsNeeded: 0 })
const slots = [
  slot(1, 1, 'Dinner'), slot(2, 2, 'Dinner'), slot(3, 3, 'dinner '), slot(4, 5, 'Dinner'), slot(5, 1, 'Lunch', '12:30'), slot(6, 4, 'Lunch', '12:30'), slot(7, 7, 'Brunch', '11:00'),
]

describe('matchingSlots: same Meal Slot name on each chosen weekday (user decision)', () => {
  it('matches case-insensitively, ignoring edge spaces, in weekday order, and reports the weekdays without one', () => {
    const r = matchingSlots(slots, 'Dinner', [4, 3, 2, 1, 1])
    expect(r.matched.map((s) => s.id)).toEqual([1, 2, 3])
    expect(r.skipped).toEqual([4])
  })
  it('never matches another name on the same day', () => {
    expect(matchingSlots(slots, 'Dinner', [7]).matched).toEqual([])
    expect(matchingSlots(slots, 'Dinner', [7]).skipped).toEqual([7])
  })
})

describe('quickPicks', () => {
  it('editing: "All days with Dinner", "Weekdays", "Weekend"', () => {
    const picks = quickPicks(slots, slots[0])
    expect(picks.map((p) => [p.id, p.label])).toEqual([['same-name', 'All days with Dinner'], ['weekdays', 'Weekdays'], ['weekend', 'Weekend']])
    expect(picks[0]!.days).toEqual([1, 2, 3, 5])
    expect(picks[1]!.days).toEqual([1, 2, 3, 4, 5])
    expect(picks[2]!.days).toEqual([6, 7])
  })
  it('adding: "Every day", "Weekdays", "Weekend"', () => {
    const picks = quickPicks(slots)
    expect(picks.map((p) => p.label)).toEqual(['Every day', 'Weekdays', 'Weekend'])
    expect(picks[0]!.days).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('sameDays ignores order and duplicates', () => {
    expect(sameDays([3, 1, 2], [1, 2, 3, 3])).toBe(true)
    expect(sameDays([1, 2], [1, 2, 3])).toBe(false)
  })
})

describe('changedFields: only what the user changed travels', () => {
  const base = slot(1, 1, 'Dinner', '19:00', att(1, 2))
  const draft = { weekday: 1, name: 'Dinner', time: '19:00', attendance: att(2, 1) }
  it('nothing changed (order of attendees does not count)', () => {
    expect(changedFields(base, draft)).toEqual({})
    expect(hasChanges({})).toBe(false)
  })
  it('time only, name only, trimmed name', () => {
    expect(changedFields(base, { ...draft, time: '19:45' })).toEqual({ time: '19:45' })
    expect(changedFields(base, { ...draft, name: ' Supper ' })).toEqual({ name: 'Supper' })
    expect(hasChanges({ time: '19:45' })).toBe(true)
  })
  it('attendance: a different member set or override, and an emptied list (nobody)', () => {
    expect(changedFields(base, { ...draft, attendance: att(1) })).toEqual({ attendance: att(1) })
    expect(changedFields(base, { ...draft, attendance: [{ memberId: 1, portionFactorOverride: 1.5 }, ...att(2)] }).attendance).toHaveLength(2)
    expect(changedFields(base, { ...draft, attendance: [] })).toEqual({ attendance: [] })
  })
  it('batchRequest matches on the ORIGINAL name, with ascending de-duplicated weekdays', () => {
    expect(batchRequest(base, [3, 1, 3, 2], { ...draft, name: 'Supper' })).toEqual({ match: 'Dinner', weekdays: [1, 2, 3], set: { name: 'Supper' } })
  })
})

describe('summary before saving and message after', () => {
  const matched = slots.filter((s) => [1, 2, 3].includes(s.id))
  it('"Update Dinner on Mon, Tue, Wed" and "Thu skipped: no Dinner"', () => {
    expect(summaryLines('Dinner', matched, [4])).toEqual({ update: 'Update Dinner on Mon, Tue, Wed', skipped: ['Thu skipped: no Dinner'] })
  })
  it('nothing to update when every day is skipped', () => {
    expect(summaryLines('Dinner', [], [6, 7])).toEqual({ update: null, skipped: ['Sat skipped: no Dinner', 'Sun skipped: no Dinner'] })
  })
  it('after saving: one skipped day, several skipped days, none', () => {
    expect(resultMessage('Dinner', [1, 2, 4], [3])).toBe('Updated Dinner on Mon, Tue, Thu. Wed has no Dinner, so it was skipped.')
    expect(resultMessage('Dinner', [1, 2], [3, 5])).toBe('Updated Dinner on Mon, Tue. Wed and Fri have no Dinner, so they were skipped.')
    expect(resultMessage('Dinner', [2], [])).toBe('Updated Dinner on Tue.')
  })
  it('uses the locale for the weekday names', () => {
    expect(summaryLines('Cena', matched, [], 'it').update?.toLowerCase()).toBe('update cena on lun, mar, mer')
  })
})
