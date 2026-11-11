import { describe, expect, it } from 'vitest'
import { anna, ben, cara, prefs } from '../household.test-helper'
import type { RecipeLine } from '../types'
import { excludersOf, preferenceRows } from './preferenceRows'

const line = (ingredientId: number, ingredient: string, optional = false): RecipeLine => ({ ingredientId, ingredient, quantity: 1, unit: 'g', optional, note: '' })
const lines = [line(7, 'garlic'), line(8, 'flour'), line(9, 'peanut', true)]

describe('preferenceRows', () => {
  it('gives one row per Member, the Member linked to the signed-in User first and marked you', () => {
    const rows = preferenceRows([anna, ben, cara], {}, 3, lines, 12)
    expect(rows.map((r) => r.member.name)).toEqual(['Cara', 'Anna', 'Ben'])
    expect(rows.map((r) => r.you)).toEqual([true, false, false])
  })
  it('keeps the Members order after the linked Member', () => {
    expect(preferenceRows([anna, ben, cara], {}, 3, lines, 10).map((r) => r.member.id)).toEqual([1, 2, 3])
    expect(preferenceRows([cara, ben, anna], {}, 3, lines, 10).map((r) => r.member.id)).toEqual([1, 3, 2])
  })
  it('has no you row when the User has no linked Member or is signed out', () => {
    for (const me of [99, null]) {
      const rows = preferenceRows([anna, ben], {}, 3, lines, me)
      expect(rows.map((r) => r.member.id)).toEqual([1, 2])
      expect(rows.some((r) => r.you)).toBe(false)
    }
  })
  it('reads each Member\'s own state for this Recipe, none when absent or not loaded', () => {
    const rows = preferenceRows([anna, ben, cara], { 1: prefs(1, { recipes: { '3': 'favourite', '4': 'dislike' } }), 2: prefs(2, { recipes: { '3': 'exclusion' } }) }, 3, lines, 10)
    expect(rows.map((r) => r.state)).toEqual(['favourite', 'exclusion', 'none'])
  })
  it('names the Ingredients a Member excludes via the Recipe\'s lines, optional lines too, in line order', () => {
    const rows = preferenceRows([anna, ben], { 1: prefs(1, { excludedIngredients: [9, 7, 99] }), 2: prefs(2, { excludedIngredients: [8] }) }, 3, lines, 10)
    expect(rows[0]!.via).toEqual(['garlic', 'peanut'])
    expect(rows[1]!.via).toEqual(['flour'])
  })
  it('lists an Ingredient once even when the Recipe has two lines of it', () => {
    const twice = [line(7, 'garlic'), line(8, 'flour'), line(7, 'garlic')]
    const rows = preferenceRows([anna], { 1: prefs(1, { excludedIngredients: [7] }) }, 3, twice, 10)
    expect(rows[0]!.via).toEqual(['garlic'])
  })
  it('keeps a direct Exclusion and the via names side by side', () => {
    const rows = preferenceRows([ben], { 2: prefs(2, { recipes: { '3': 'exclusion' }, excludedIngredients: [7] }) }, 3, lines, null)
    expect(rows[0]).toMatchObject({ state: 'exclusion', via: ['garlic'] })
  })
  it('has empty via for Members who exclude nothing in this Recipe or have no preferences loaded', () => {
    const rows = preferenceRows([anna, ben], { 1: prefs(1, { excludedIngredients: [50] }) }, 3, lines, 10)
    expect(rows.map((r) => r.via)).toEqual([[], []])
  })
  it('gives no rows when there are no Members', () => {
    expect(preferenceRows([], {}, 3, lines, 10)).toEqual([])
  })
})

describe('excludersOf', () => {
  it('lists the Members who exclude the Ingredient, in Members order', () => {
    const by = { 1: prefs(1, { excludedIngredients: [7] }), 2: prefs(2, { excludedIngredients: [8] }), 3: prefs(3, { excludedIngredients: [7, 8] }) }
    expect(excludersOf([anna, ben, cara], by, 7).map((m) => m.name)).toEqual(['Anna', 'Cara'])
    expect(excludersOf([anna, ben, cara], by, 8).map((m) => m.name)).toEqual(['Ben', 'Cara'])
    expect(excludersOf([anna, ben, cara], by, 99)).toEqual([])
  })
  it('skips Members whose preferences are not loaded', () => {
    expect(excludersOf([anna, ben], { 2: prefs(2, { excludedIngredients: [7] }) }, 7).map((m) => m.name)).toEqual(['Ben'])
  })
})
