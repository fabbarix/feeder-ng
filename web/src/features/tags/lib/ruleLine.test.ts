// Naming a Slot Rule in a confirm (spec 4.1): "Friday Dinner · Main = fish".
import { describe, expect, it } from 'vitest'
import { fishRule } from '../fixtures'
import { slotRuleLine, slotRuleWhere } from './ruleLine'

describe('slotRuleWhere', () => {
  it('is the weekday and Meal Slot name, then the Course', () => expect(slotRuleWhere(fishRule)).toBe('Friday Dinner · Main'))

  it.each([
    [1, 'Monday Dinner · Main'],
    [4, 'Thursday Dinner · Main'],
    [7, 'Sunday Dinner · Main'],
  ])('ISO weekday %i', (weekday, text) => expect(slotRuleWhere({ ...fishRule, weekday })).toBe(text))

  it('leaves out a missing Course, and a null one', () => {
    expect(slotRuleWhere({ ...fishRule, courseName: undefined })).toBe('Friday Dinner')
    expect(slotRuleWhere({ ...fishRule, courseName: null })).toBe('Friday Dinner')
  })

  it('leaves out a weekday that is missing or not 1 to 7', () => {
    expect(slotRuleWhere({ ...fishRule, weekday: undefined })).toBe('Dinner · Main')
    expect(slotRuleWhere({ ...fishRule, weekday: 0 })).toBe('Dinner · Main')
    expect(slotRuleWhere({ ...fishRule, weekday: 8 })).toBe('Dinner · Main')
  })

  it('falls back to "Meal Slot" when the API sent no names (a plain ImpactSlotRule)', () => {
    expect(slotRuleWhere({ id: 1, mealSlotId: 2, courseId: 1 })).toBe('Meal Slot')
  })
})

describe('slotRuleLine', () => {
  it('adds " = " and the Tag name', () => expect(slotRuleLine(fishRule, 'fish')).toBe('Friday Dinner · Main = fish'))
  it('uses the name it is given, not the rule key', () => expect(slotRuleLine(fishRule, 'Seafood')).toBe('Friday Dinner · Main = Seafood'))
})
