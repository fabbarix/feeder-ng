// CRS E2: the copy of the Courses field, chips, filter and the confirm.
import { describe, expect, it } from 'vitest'
import { codeMessage, courseStrings } from './strings'

describe('courseStrings', () => {
  it('uses the glossary words', () => {
    expect(courseStrings.label).toBe('Courses')
    expect(courseStrings.wholeMeal).toBe('Whole meal')
    expect(courseStrings.wholeMealHelper('Main')).toBe("Planned as Main, it leaves the slot's other Courses empty")
  })
  it('titles the confirm by the number of Slot Rules', () => {
    expect(courseStrings.lossTitle('Side', 1)).toBe('Taking Side off removes a Slot Rule')
    expect(courseStrings.lossTitle('Side and Dessert', 3)).toBe('Taking Side and Dessert off removes 3 Slot Rules')
  })
})

describe('codeMessage', () => {
  it('has copy for the two Course validation reasons of the API', () => {
    expect(codeMessage('courses_empty')).toBe('Choose at least one Course')
    expect(codeMessage('course_unknown')).toBe('That Course is no longer there. Choose again.')
  })
})
