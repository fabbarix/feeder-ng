// CRS E2: Courses and Whole meal in the editor's draft and in what it sends (docs/dev/design/crs-e2.md 2.2).
import { describe, expect, it } from 'vitest'
import { recipe } from '../fixtures.test-helper'
import { draftFromRecipe, draftToInput, emptyDraft, serverErrorKey } from './draft'

describe('emptyDraft', () => {
  it('starts with no Courses (the hook adds the main Course once the Courses are known), Whole meal off and not set by the User', () => {
    expect(emptyDraft()).toMatchObject({ courseIds: [], wholeMeal: false, wholeMealSet: false })
  })
})

describe('draftFromRecipe', () => {
  it('takes the ids of the stored Courses in their order and the stored Whole meal', () => {
    const d = draftFromRecipe(recipe({ courses: [{ id: 1, name: 'Main' }, { id: 3, name: 'Starter' }], wholeMeal: true }))
    expect(d.courseIds).toEqual([1, 3])
    expect(d.wholeMeal).toBe(true)
    expect(d.wholeMealSet).toBe(false)
  })
  it('does not share the list with the Recipe', () => {
    const r = recipe({ courses: [{ id: 1, name: 'Main' }] })
    const d = draftFromRecipe(r)
    d.courseIds.push(2)
    expect(r.courses).toHaveLength(1)
  })
})

describe('draftToInput', () => {
  it('sends the Courses and Whole meal as they stand', () => {
    const body = draftToInput({ ...emptyDraft(), courseIds: [1, 2], wholeMeal: true })
    expect(body.courseIds).toEqual([1, 2])
    expect(body.wholeMeal).toBe(true)
  })
  it('sends the stored Whole meal even when the switch is hidden (no main Course chosen)', () => {
    const d = draftFromRecipe(recipe({ courses: [{ id: 1, name: 'Main' }], wholeMeal: true }))
    const hidden = { ...d, courseIds: [2] }
    expect(draftToInput(hidden)).toMatchObject({ courseIds: [2], wholeMeal: true })
  })
  it('a new Recipe sends false', () => {
    expect(draftToInput({ ...emptyDraft(), courseIds: [1] })).toMatchObject({ courseIds: [1], wholeMeal: false })
  })
  it('does not send wholeMealSet', () => {
    expect(draftToInput({ ...emptyDraft(), wholeMealSet: true })).not.toHaveProperty('wholeMealSet')
  })
  it('copies the list', () => {
    const d = { ...emptyDraft(), courseIds: [1] }
    expect(draftToInput(d).courseIds).not.toBe(d.courseIds)
  })
})

describe('serverErrorKey', () => {
  it('puts a Courses validation error on the Courses field', () => {
    expect(serverErrorKey('courses', 'courses_empty')).toBe('courses')
  })
})
