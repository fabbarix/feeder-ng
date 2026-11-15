import { describe, expect, it, vi } from 'vitest'
import { members } from '../components/fixtures'
import { dinnerCard, lunchCard } from '../components/mealSlotCardFixtures'
import { createSlotsSequentially, slotDraft, slotFormDirty, slotFormFromCard, slotFormFromCell, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from './slotForm'

describe('slotForm', () => {
  it('starts blank on Monday', () => {
    expect(slotDraft()).toEqual({ weekday: 1, name: '', time: '', attendance: [] })
  })

  it('a new Meal Slot starts with every Member attending (opt out in the editor), no Portion Factor override', () => {
    expect(slotDraft(undefined, members)).toEqual({
      weekday: 1, name: '', time: '',
      attendance: [
        { memberId: 1, portionFactorOverride: null },
        { memberId: 2, portionFactorOverride: null },
        { memberId: 3, portionFactorOverride: null },
      ],
    })
  })

  it('without Members the draft has nobody to list', () => {
    expect(slotDraft(undefined, [])).toMatchObject({ attendance: [] })
  })

  it('an existing Meal Slot keeps its own Attendance, even an empty one (a deliberate choice)', () => {
    const slot = { id: 1, weekday: 2, name: 'Dinner', time: '19:30', attendance: [], portionsNeeded: 0 }
    expect(slotDraft(slot, members).attendance).toEqual([])
  })

  it('copies an existing Meal Slot', () => {
    const slot = { id: 1, weekday: 2, name: 'Dinner', time: '19:30', attendance: [{ memberId: 1, portionFactorOverride: null }], portionsNeeded: 1 }
    expect(slotDraft(slot)).toEqual({ weekday: 2, name: 'Dinner', time: '19:30', attendance: slot.attendance })
  })

  it('asks for a name first, then a time', () => {
    expect(slotProblem({ ...slotDraft(), name: ' ' })).toMatch(/name/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner' })).toMatch(/time/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner', time: '25:00' })).toMatch(/time/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner', time: '19:30' })).toBeNull()
  })

  it('trims the name', () => {
    expect(slotFromDraft({ ...slotDraft(), name: ' Dinner ', time: '19:30' }).name).toBe('Dinner')
  })
})

describe('Meal Slots for several weekdays (WP11)', () => {
  const draft = { weekday: 1, name: '  Dinner ', time: '19:30', attendance: [{ memberId: 1, portionFactorOverride: null }] }

  it('asks for at least one weekday', () => {
    expect(weekdaysProblem([])).toMatch(/at least one weekday/i)
    expect(weekdaysProblem([3])).toBeNull()
  })

  it('makes one body per weekday, ascending and without duplicates', () => {
    const out = slotInputsForWeekdays(draft, [5, 1, 3, 3])
    expect(out.map((s) => s.weekday)).toEqual([1, 3, 5])
    expect(out.every((s) => s.name === 'Dinner' && s.time === '19:30')).toBe(true)
  })

  it('gives each body its own Attendance array', () => {
    const [a, b] = slotInputsForWeekdays(draft, [1, 2])
    expect(a!.attendance).toEqual(b!.attendance)
    expect(a!.attendance).not.toBe(b!.attendance)
  })

  it('creates them in order and reports all saved', async () => {
    const create = vi.fn().mockResolvedValue({})
    const inputs = slotInputsForWeekdays(draft, [1, 2, 3])
    expect(await createSlotsSequentially(inputs, create)).toEqual({ created: 3 })
    expect(create.mock.calls.map((c) => c[0].weekday)).toEqual([1, 2, 3])
  })

  it('stops at the first failure and says which weekday', async () => {
    const boom = new Error('duplicate')
    const create = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(boom)
    const result = await createSlotsSequentially(slotInputsForWeekdays(draft, [1, 2, 3]), create)
    expect(result).toEqual({ created: 1, failedWeekday: 2, error: boom })
    expect(create).toHaveBeenCalledTimes(2)
  })
})

// SET-14h, decision SET 5: Edit from an "Every day" card starts with all days of that name; a strip cell starts with that day only.
describe('slotFormFromCard / slotFormFromCell (SET-14h)', () => {
  it('an every-day card starts with all seven days chosen, on the card\'s usual slot', () => {
    expect(slotFormFromCard(dinnerCard)).toEqual({ slot: dinnerCard.editSlot, weekdays: [1, 2, 3, 4, 5, 6, 7] })
  })
  it('a card that runs on some days starts with exactly those days (all days of that name)', () => {
    const weekdaysOnly = { ...dinnerCard, days: [1, 2, 3, 4, 5] }
    expect(slotFormFromCard(weekdaysOnly).weekdays).toEqual([1, 2, 3, 4, 5])
  })
  it('a one-day card starts with its day', () => {
    expect(slotFormFromCard(lunchCard)).toEqual({ slot: lunchCard.editSlot, weekdays: [7] })
  })
  it('the weekdays are a copy: changing them does not change the card', () => {
    const start = slotFormFromCard(dinnerCard)
    start.weekdays.pop()
    expect(dinnerCard.days).toHaveLength(7)
  })
  it('a strip cell or a "Differs on" row starts with that day only, even when the name runs every day', () => {
    const friday = dinnerCard.differences[1]!.slot
    expect(slotFormFromCell(friday)).toEqual({ slot: friday, weekdays: [5] })
  })
})

describe('slotFormDirty', () => {
  const start = { draft: slotDraft(dinnerCard.editSlot), weekdays: [1, 2, 3] }
  it('is false for an untouched form, and for the same days in another order', () => {
    expect(slotFormDirty(start, { draft: { ...start.draft }, weekdays: [3, 1, 2] })).toBe(false)
  })
  it('is true after a changed name, time, Attendance, Course or weekday', () => {
    expect(slotFormDirty(start, { draft: { ...start.draft, name: 'Supper' }, weekdays: start.weekdays })).toBe(true)
    expect(slotFormDirty(start, { draft: { ...start.draft, time: '20:00' }, weekdays: start.weekdays })).toBe(true)
    expect(slotFormDirty(start, { draft: { ...start.draft, attendance: [] }, weekdays: start.weekdays })).toBe(true)
    expect(slotFormDirty(start, { draft: { ...start.draft, courses: [{ id: 9, optional: false, optOutMemberIds: [] }] }, weekdays: start.weekdays })).toBe(true)
    expect(slotFormDirty(start, { draft: start.draft, weekdays: [1, 2] })).toBe(true)
  })
  it('a name with only edge spaces added is not a change', () => {
    expect(slotFormDirty(start, { draft: { ...start.draft, name: ' Dinner ' }, weekdays: start.weekdays })).toBe(false)
  })
})
