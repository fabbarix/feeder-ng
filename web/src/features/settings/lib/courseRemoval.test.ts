import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { choices, sideCourse, sideImpact } from '../components/courseFixtures'
import {
  defaultReplacement,
  isPlannedRefusal,
  needsReplacement,
  plannedMealLines,
  plannedMealText,
  removalErrorMessage,
  replacementChoices,
  replacementLine,
  shortDate,
  slotRuleLines,
  usageLine,
} from './courseRemoval'

describe('needsReplacement', () => {
  it.each([
    [{ recipesOnlyThis: 0, mealSlotsOnlyThis: 0 }, false],
    [{ recipesOnlyThis: 1, mealSlotsOnlyThis: 0 }, true],
    [{ recipesOnlyThis: 0, mealSlotsOnlyThis: 2 }, true],
  ])('%j is %s', (impact, expected) => expect(needsReplacement(impact)).toBe(expected))
})

describe('replacement choices', () => {
  it('are the active Courses except the Course itself, household order', () => {
    expect(replacementChoices(choices, sideCourse).map((c) => c.name)).toEqual(['Main', 'Starter', 'Dessert'])
  })
  it('default to the main Course, else the first choice, else nothing', () => {
    expect(defaultReplacement(replacementChoices(choices, sideCourse))).toBe(1)
    expect(defaultReplacement([{ id: 7, name: 'Cheese', main: false }])).toBe(7)
    expect(defaultReplacement([])).toBeNull()
  })
})

describe('usageLine', () => {
  it.each([
    [{ recipes: 12, mealSlots: 5 }, 'Side is on 12 Recipes and 5 Meal Slots.'],
    [{ recipes: 1, mealSlots: 1 }, 'Side is on 1 Recipe and 1 Meal Slot.'],
    [{ recipes: 12, mealSlots: 0 }, 'Side is on 12 Recipes.'],
    [{ recipes: 0, mealSlots: 5 }, 'Side is on 5 Meal Slots.'],
    [{ recipes: 0, mealSlots: 0 }, 'Side is not on any Recipe or Meal Slot.'],
  ])('%j reads %s', (impact, text) => expect(usageLine('Side', impact)).toBe(text))
})

describe('replacementLine', () => {
  it.each([
    [{ recipesOnlyThis: 3, mealSlotsOnlyThis: 2 }, '3 Recipes and 2 Meal Slots have only Side: give them Main'],
    [{ recipesOnlyThis: 1, mealSlotsOnlyThis: 1 }, '1 Recipe and 1 Meal Slot have only Side: give them Main'],
    [{ recipesOnlyThis: 1, mealSlotsOnlyThis: 0 }, '1 Recipe has only Side: give it Main'],
    [{ recipesOnlyThis: 0, mealSlotsOnlyThis: 1 }, '1 Meal Slot has only Side: give it Main'],
    [{ recipesOnlyThis: 0, mealSlotsOnlyThis: 2 }, '2 Meal Slots have only Side: give them Main'],
  ])('%j reads %s', (impact, text) => expect(replacementLine('Side', impact, 'Main')).toBe(text))

  it('is null when nothing has only this Course', () => {
    expect(replacementLine('Side', { recipesOnlyThis: 0, mealSlotsOnlyThis: 0 }, 'Main')).toBeNull()
  })
})

describe('dates and Planned Meals', () => {
  it('shortDate is the short weekday, the day and the short month', () => {
    expect(shortDate('2026-11-12', 'en')).toBe('Thu 12 Nov')
    expect(shortDate('2026-01-05', 'en')).toBe('Mon 5 Jan')
  })

  it('plannedMealText is "Recipe · Meal Slot · date"', () => {
    expect(plannedMealText(sideImpact.plannedMeals[1]!, 'en')).toBe('Roast potatoes · Dinner · Thu 12 Nov')
  })

  it('plannedMealLines lists Pinned meals first, each group in the order given, with unique keys', () => {
    const lines = plannedMealLines(sideImpact.plannedMeals, 'en')
    expect(lines.map((l) => [l.text, l.pinned])).toEqual([
      ['Roast potatoes · Dinner · Thu 12 Nov', true],
      ['Green salad · Dinner · Tue 10 Nov', false],
    ])
    expect(new Set(lines.map((l) => l.key)).size).toBe(2)
  })

  it('does not reorder the meals it was given', () => {
    const meals = [...sideImpact.plannedMeals]
    plannedMealLines(meals, 'en')
    expect(meals).toEqual(sideImpact.plannedMeals)
  })

  it('slotRuleLines names a rule by its Recipe or by "Tag <tag>"', () => {
    const lines = slotRuleLines(sideImpact.slotRules)
    expect(lines.map((l) => l.text)).toEqual(['Roast potatoes', 'Tag vegetarian'])
    expect(new Set(lines.map((l) => l.key)).size).toBe(2)
  })
})

describe('refusals', () => {
  const refusal = (status: number, code: string, details: Record<string, unknown> = {}) => new ApiError(status, code, 'server text', details)

  it('course_planned is the refusal that offers Archive', () => {
    expect(isPlannedRefusal(refusal(409, 'course_planned'))).toBe(true)
    expect(isPlannedRefusal(refusal(409, 'course_main'))).toBe(false)
    expect(isPlannedRefusal(new Error('x'))).toBe(false)
  })

  it.each([
    [refusal(409, 'course_main'), 'Make another Course main first.'],
    [refusal(409, 'course_last'), 'A Household needs at least one Course.'],
    [refusal(422, 'validation_failed', { field: 'replacement', reason: 'replacement_invalid' }), 'Choose a replacement Course.'],
    [refusal(500, 'internal'), 'Something went wrong. Please try again.'],
    [new Error('boom'), 'Something went wrong. Please try again.'],
  ])('%j reads %s', (err, text) => expect(removalErrorMessage(err)).toBe(text))
})
