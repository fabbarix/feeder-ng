// CRS E2: the view-model of the Course rows (docs/dev/design/crs-e2.md 4.1).
import { describe, expect, it } from 'vitest'
import { courseRow, recipe } from '../fixtures.test-helper'
import type { Problem } from '../types'
import { questionRows, splitProblems, usedByRecipes } from './courseRows'

describe('questionRows', () => {
  it('keeps the unknown and archived rows in plan order and drops the matched ones', () => {
    const rows = [
      courseRow({ key: 'side', status: 'exact' }),
      courseRow({ key: 'soup', status: 'unknown' }),
      courseRow({ key: 'brunch', status: 'archived' }),
    ]
    expect(questionRows(rows).map((r) => r.key)).toEqual(['soup', 'brunch'])
  })
  it('is empty for no rows', () => {
    expect(questionRows([])).toEqual([])
  })
})

describe('usedByRecipes', () => {
  const recipes = [recipe({ index: 0, name: 'Pancakes' }), recipe({ index: 1, name: 'Rice' }), recipe({ index: 2, name: 'Trifle' })]
  it('names the Recipe of each path, once, in first-seen order', () => {
    expect(usedByRecipes(['$.recipes[2].courses[0]', '$.recipes[0].courses[1]', '$.recipes[2].courses[1]'], recipes)).toEqual(['Trifle', 'Pancakes'])
  })
  it('finds a Recipe by its index, not its position in the list', () => {
    expect(usedByRecipes(['$.recipes[5].courses[0]'], [recipe({ index: 5, name: 'Soup' })])).toEqual(['Soup'])
  })
  it('leaves out a path that names no listed Recipe or is not a Recipe path', () => {
    expect(usedByRecipes(['$.recipes[9].courses[0]', '$.version', ''], recipes)).toEqual([])
  })
})

describe('splitProblems', () => {
  const p = (code: string, path = '$.x'): Problem => ({ path, code, message: code })
  it('separates the too_many_courses Problem from the others', () => {
    const out = splitProblems([p('course_name_invalid'), p('too_many_courses', '$.recipes[3].courses[0]'), p('other')])
    expect(out.courseLimit).toMatchObject({ code: 'too_many_courses', path: '$.recipes[3].courses[0]' })
    expect(out.others.map((x) => x.code)).toEqual(['course_name_invalid', 'other'])
  })
  it('has no limit Problem when there is none', () => {
    expect(splitProblems([p('other')])).toEqual({ courseLimit: undefined, others: [p('other')] })
    expect(splitProblems([])).toEqual({ courseLimit: undefined, others: [] })
  })
})
