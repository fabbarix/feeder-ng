import { describe, expect, it, vi } from 'vitest'
import { createSlotsSequentially, slotDraft, slotFromDraft, slotInputsForWeekdays, slotProblem, weekdaysProblem } from './slotForm'

describe('slotForm', () => {
  it('starts blank on Monday', () => {
    expect(slotDraft()).toEqual({ weekday: 1, name: '', time: '', attendance: [] })
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
