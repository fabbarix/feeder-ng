// WP-G: "Use this photo for the Recipe" logic (ai-recipe-import.md sections 3.5, 5.2, 7; ra-e-import.md section 4.5).
import { describe, expect, it } from 'vitest'
import { plan, recipe } from '../fixtures.test-helper'
import type { Decisions } from '../types'
import { confirmPhoto, initialPhotoChoice, normaliseChoice, photoRecipes, photoUrl } from './photoChoice'

const none: Decisions = { ingredients: [], conversions: [], recipes: [], courses: [] }
const two = [{ index: 0, name: 'Soup' }, { index: 1, name: 'Bread' }]

describe('initialPhotoChoice', () => {
  it('is off, photo 1, the first Recipe', () => {
    expect(initialPhotoChoice()).toEqual({ enabled: false, photo: 0, recipe: 0 })
  })
})

describe('photoRecipes', () => {
  it('lists every Recipe of the plan with its index and name', () => {
    const p = plan({ recipes: [recipe({ index: 0, name: 'Soup' }), recipe({ index: 1, name: 'Bread' })] })
    expect(photoRecipes(p, none)).toEqual(two)
  })
  it('leaves out Recipes the User skips (a skipped Recipe cannot get a photo)', () => {
    const p = plan({ recipes: [recipe({ index: 0, name: 'Soup', status: 'conflict', action: 'skip' }), recipe({ index: 1, name: 'Bread' })] })
    expect(photoRecipes(p, none)).toEqual([{ index: 1, name: 'Bread' }])
    const q = plan({ recipes: [recipe({ index: 0, name: 'Soup', status: 'conflict' }), recipe({ index: 1, name: 'Bread' })] })
    expect(photoRecipes(q, { ...none, recipes: [{ index: 0, action: 'skip' }] })).toEqual([{ index: 1, name: 'Bread' }])
  })
  it('a decision beats the plan\'s action (replace after skip)', () => {
    const p = plan({ recipes: [recipe({ index: 0, name: 'Soup', status: 'conflict', action: 'skip' })] })
    expect(photoRecipes(p, { ...none, recipes: [{ index: 0, action: 'replace' }] })).toEqual([{ index: 0, name: 'Soup' }])
  })
  it('is empty without a plan', () => {
    expect(photoRecipes(undefined, none)).toEqual([])
  })
})

describe('normaliseChoice', () => {
  it('keeps a valid choice as it is', () => {
    expect(normaliseChoice({ enabled: true, photo: 1, recipe: 1 }, 3, two)).toEqual({ enabled: true, photo: 1, recipe: 1 })
  })
  it('moves a photo out of range to the first photo', () => {
    expect(normaliseChoice({ enabled: true, photo: 5, recipe: 0 }, 2, two).photo).toBe(0)
  })
  it('moves a Recipe that is no longer an option (skipped) to the first option', () => {
    expect(normaliseChoice({ enabled: true, photo: 0, recipe: 0 }, 2, [{ index: 1, name: 'Bread' }])).toEqual({ enabled: true, photo: 0, recipe: 1 })
  })
  it('switches off when there is no Recipe to give the photo to, or no photo', () => {
    expect(normaliseChoice({ enabled: true, photo: 0, recipe: 0 }, 2, []).enabled).toBe(false)
    expect(normaliseChoice({ enabled: true, photo: 0, recipe: 0 }, 0, two).enabled).toBe(false)
  })
  it('does not switch itself on', () => {
    expect(normaliseChoice({ enabled: false, photo: 0, recipe: 0 }, 2, two).enabled).toBe(false)
  })
})

describe('confirmPhoto', () => {
  it('is undefined while the switch is off (nothing is kept)', () => {
    expect(confirmPhoto({ enabled: false, photo: 1, recipe: 1 }, 3, two)).toBeUndefined()
  })
  it('is { index, recipe } when on', () => {
    expect(confirmPhoto({ enabled: true, photo: 1, recipe: 1 }, 3, two)).toEqual({ index: 1, recipe: 1 })
  })
  it('is undefined for a choice that is no longer valid (never sends a bad index)', () => {
    expect(confirmPhoto({ enabled: true, photo: 3, recipe: 0 }, 3, two)).toBeUndefined()
    expect(confirmPhoto({ enabled: true, photo: 0, recipe: 0 }, 3, [{ index: 1, name: 'Bread' }])).toBeUndefined()
    expect(confirmPhoto({ enabled: true, photo: 0, recipe: 0 }, 0, two)).toBeUndefined()
  })
})

describe('photoUrl', () => {
  it('is the review photo endpoint with the id encoded', () => {
    expect(photoUrl('abc', 2)).toBe('/api/imports/abc/photos/2')
    expect(photoUrl('a/b c', 0)).toBe('/api/imports/a%2Fb%20c/photos/0')
  })
})
