// CRS F (ADR 0009 point 9): the line under the chips that turns a relaxed pick into an action.
import { describe, expect, it } from 'vitest'
import { relaxedLine } from './relaxed'
import { courseMeal } from '../test-utils'
import type { Why } from '../types'

const cool: Why = { code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 7 }
const variety: Why = { code: 'variety_relaxed', tag: 'fish', value: 3 }
const side = { courseId: 2, courseName: 'Side', main: false, severalCourses: true }
const main = { courseId: 1, courseName: 'Main', main: true, severalCourses: true }
const only = { courseId: 1, courseName: 'Main', main: true, severalCourses: false }

describe('relaxedLine', () => {
  it('is null for a Planned Meal that is not relaxed', () => {
    expect(relaxedLine(courseMeal(2, 'Side', { why: [cool] }), side)).toBeNull()
  })

  it('a relaxed Side: the Course in the sentence, and Mark Recipes as Side', () => {
    expect(relaxedLine(courseMeal(2, 'Side', { relaxed: true, why: [cool] }), side)).toEqual({
      text: 'Few Side Recipes, so this comes round sooner. Add Side Recipes for more variety.',
      action: { kind: 'markRecipes', label: 'Mark Recipes as Side', courseId: 2 },
    })
  })

  it('the main Course of several: the Course in the sentence, and Add Recipes', () => {
    expect(relaxedLine(courseMeal(1, 'Main', { relaxed: true, why: [cool] }), main)).toEqual({
      text: 'Few Main Recipes, so this comes round sooner. Add Main Recipes for more variety.',
      action: { kind: 'addRecipes', label: 'Add Recipes' },
    })
  })

  it('a slot that serves one Course names no Course', () => {
    expect(relaxedLine(courseMeal(1, 'Main', { relaxed: true, why: [cool] }), only)).toEqual({
      text: 'Few Recipes, so this comes round sooner. Add Recipes for more variety.',
      action: { kind: 'addRecipes', label: 'Add Recipes' },
    })
  })

  it('only a Variety Rule gave way: names the Tag and offers Review Variety Rules', () => {
    expect(relaxedLine(courseMeal(2, 'Side', { relaxed: true, why: [variety] }), side)).toEqual({
      text: 'Few Recipes without fish fit here, so this breaks a Variety Rule.',
      action: { kind: 'reviewVarietyRules', label: 'Review Variety Rules' },
    })
  })

  it('both gave way: the Cool-down line wins', () => {
    expect(relaxedLine(courseMeal(2, 'Side', { relaxed: true, why: [variety, cool] }), side)?.action.kind).toBe('markRecipes')
  })
})
