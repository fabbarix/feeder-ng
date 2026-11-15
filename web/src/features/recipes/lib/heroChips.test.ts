import { describe, expect, it } from 'vitest'
import { heroLeadChips } from './heroChips'

const main = [{ id: 1, main: true }, { id: 2, main: false }]
const r = (over: Partial<Parameters<typeof heroLeadChips>[0]> = {}) => ({ archived: false, readyMeal: false, wholeMeal: false, courses: [], ...over })

describe('heroLeadChips (RX-04: the hero line before the Tags)', () => {
  it('is Archived, the Courses, Whole meal, then Ready Meal', () => {
    expect(heroLeadChips(r({ archived: true, readyMeal: true, wholeMeal: true, courses: [{ id: 1, name: 'Main' }, { id: 2, name: 'Side' }] }), main)).toEqual([
      'Archived', 'Main', 'Side', 'Whole meal', 'Ready Meal',
    ])
  })
  it('has no Whole meal chip when the Courses do not include the main Course', () => {
    expect(heroLeadChips(r({ wholeMeal: true, courses: [{ id: 2, name: 'Side' }] }), main)).toEqual(['Side'])
  })
  it('is empty for a Recipe with none of them', () => {
    expect(heroLeadChips(r(), main)).toEqual([])
  })
})
