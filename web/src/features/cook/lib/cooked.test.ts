// B9-45 (PC-02): the words of the Cooked confirmation. 2026-11-14 is a Saturday.
import { describe, expect, it } from 'vitest'
import { cookedLine, cookedMealLabel, undoCookedName } from './cooked'

describe('cookedMealLabel', () => {
  it('is the short weekday and the Meal Slot name', () => {
    expect(cookedMealLabel('2026-11-14', 'Dinner')).toBe('Sat Dinner')
  })
  it('adds the Course when one Course of several was cooked', () => {
    expect(cookedMealLabel('2026-11-14', 'Dinner', 'Side')).toBe('Sat Dinner, Side')
  })
})

describe('cookedLine', () => {
  it('names the Recipe and the meal', () => {
    expect(cookedLine('Cauliflower al gorgonzola', 'Sat Dinner')).toBe('Cauliflower al gorgonzola · Sat Dinner')
  })
  it('names the meal alone when several Courses were cooked together', () => {
    expect(cookedLine(null, 'Sat Dinner')).toBe('Sat Dinner')
  })
})

describe('undoCookedName', () => {
  it('names the meal', () => {
    expect(undoCookedName('Sat Dinner')).toBe('Undo Cooked for Sat Dinner')
    expect(undoCookedName('Sat Dinner', 1)).toBe('Undo Cooked for Sat Dinner')
  })
  it('counts the Courses of a Mark all Cooked', () => {
    expect(undoCookedName('Sat Dinner', 3)).toBe('Undo Cooked for all 3 Courses')
  })
})
