// B9-32 (A11Y-08): every repeated row action names its Recipe (or Course), its day and its Meal Slot. TEST-AUTHOR tests; the module is stubbed.
import { describe, expect, it } from 'vitest'
import { actionName, dayLabel } from './actionNames'

const ctx = { recipe: 'Pasta al pomodoro', day: 'Sun 15', slot: 'Breakfast' }

describe('dayLabel', () => {
  it('is the short weekday and the day of the month, never "Today"', () => {
    expect(dayLabel('2026-11-15')).toBe('Sun 15')
    expect(dayLabel('2026-11-09')).toBe('Mon 9')
    expect(dayLabel('2026-12-01')).toBe('Tue 1')
  })
})

describe('actionName', () => {
  it('Swap: "Swap Pasta al pomodoro, Sun 15 Breakfast"', () => {
    expect(actionName('swap', ctx)).toBe('Swap Pasta al pomodoro, Sun 15 Breakfast')
  })
  it('Pin: "Pin Pasta al pomodoro, Sun 15 Breakfast"; one name, pressed or not (the state is aria-pressed)', () => {
    expect(actionName('pin', ctx)).toBe('Pin Pasta al pomodoro, Sun 15 Breakfast')
  })
  it('an empty Course: "Choose a Recipe for Side, Sun 15 Dinner"', () => {
    expect(actionName('choose', { course: 'Side', day: 'Sun 15', slot: 'Dinner' })).toBe('Choose a Recipe for Side, Sun 15 Dinner')
  })
  it('the slot header: "Cook Sun 15 Breakfast" and "More for Sun 15 Breakfast"', () => {
    expect(actionName('cook', { day: 'Sun 15', slot: 'Breakfast' })).toBe('Cook Sun 15 Breakfast')
    expect(actionName('more', { day: 'Sun 15', slot: 'Breakfast' })).toBe('More for Sun 15 Breakfast')
  })
  it('every action name includes the day and the Meal Slot, and the Recipe (or the Course for Choose)', () => {
    for (const kind of ['swap', 'pin'] as const) {
      const n = actionName(kind, ctx)
      for (const part of ['Pasta al pomodoro', 'Sun 15', 'Breakfast']) expect(n).toContain(part)
    }
    const n = actionName('choose', { course: 'Dessert', day: 'Mon 16', slot: 'Dinner' })
    for (const part of ['Dessert', 'Mon 16', 'Dinner']) expect(n).toContain(part)
  })
  it('two Recipes on the same slot, or one Recipe on two days, never share a name', () => {
    expect(actionName('swap', ctx)).not.toBe(actionName('swap', { ...ctx, recipe: 'Lentil soup' }))
    expect(actionName('swap', ctx)).not.toBe(actionName('swap', { ...ctx, day: 'Mon 16' }))
    expect(actionName('swap', ctx)).not.toBe(actionName('pin', ctx))
  })
})
