// mergeSummary and deleteSummary: the facts behind the confirms (spec 4.1), following the Go tag.Merge table.
import { describe, expect, it } from 'vitest'
import { deleteSummary, mergeSummary } from './summaries'
import type { ImpactSlotRule, ImpactVarietyRule, TagImpact } from './types'

const rule = (id: number, mealSlotId: number, courseId: number | null | undefined, tag: string): ImpactSlotRule => ({ id, mealSlotId, courseId, tag })
const variety = (tag: string): ImpactVarietyRule => ({ tag, maxPerWeek: 1, notConsecutiveDays: false })
const impact = (recipes: number, slotRules: ImpactSlotRule[] = [], varietyRule: ImpactVarietyRule | null = null): TagImpact => ({ recipes, slotRules, varietyRule })
const fish = { name: 'fish' }
const seafood = { name: 'Seafood' }

describe('mergeSummary', () => {
  it('names both Tags and counts the source Recipes', () => {
    const s = mergeSummary({ source: fish, target: seafood, sourceImpact: impact(12), targetImpact: impact(5), bothRecipes: 4 })
    expect(s).toMatchObject({ source: 'fish', target: 'Seafood', recipes: 12, bothRecipes: 4, movedRules: [], droppedRules: [], varietyRule: 'none' })
  })
  it('bothRecipes is 0 when the caller does not know it', () => {
    expect(mergeSummary({ source: fish, target: seafood, sourceImpact: impact(3), targetImpact: impact(0) }).bothRecipes).toBe(0)
  })
  it('a source Slot Rule moves when the target has none on that Meal Slot and Course', () => {
    const r = rule(1, 10, 1, 'fish')
    const s = mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1, [r]), targetImpact: impact(1, [rule(2, 11, 1, 'seafood')]) })
    expect(s.movedRules).toEqual([r])
    expect(s.droppedRules).toEqual([])
  })
  it('a duplicate on the same Meal Slot and Course goes; one on another Course moves', () => {
    const dup = rule(1, 10, 1, 'fish')
    const other = rule(2, 10, 2, 'fish')
    const s = mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1, [dup, other]), targetImpact: impact(1, [rule(3, 10, 1, 'seafood')]) })
    expect(s.droppedRules).toEqual([dup])
    expect(s.movedRules).toEqual([other])
  })
  it('a missing Course and a null Course are the same Course', () => {
    const a = rule(1, 10, undefined, 'fish')
    const s = mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1, [a]), targetImpact: impact(1, [rule(2, 10, null, 'seafood')]) })
    expect(s.droppedRules).toEqual([a])
  })
  it('the source Variety Rule goes when the target has its own', () => {
    expect(mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1, [], variety('fish')), targetImpact: impact(1, [], variety('seafood')) }).varietyRule).toBe('goes')
  })
  it('the source Variety Rule moves when the target has none', () => {
    expect(mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1, [], variety('fish')), targetImpact: impact(1) }).varietyRule).toBe('moves')
  })
  it('no source Variety Rule: none, whether or not the target has one', () => {
    expect(mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1), targetImpact: impact(1, [], variety('seafood')) }).varietyRule).toBe('none')
    expect(mergeSummary({ source: fish, target: seafood, sourceImpact: impact(1), targetImpact: impact(1) }).varietyRule).toBe('none')
  })
})

describe('deleteSummary', () => {
  it('a Tag with no rules', () => {
    expect(deleteSummary({ tag: fish, impact: impact(12) })).toEqual({ name: 'fish', recipes: 12, rules: [], varietyRule: null, hasRules: false })
  })
  it('a Tag with Slot Rules and a Variety Rule lists both', () => {
    const r = rule(1, 10, 1, 'fish')
    const v = variety('fish')
    expect(deleteSummary({ tag: fish, impact: impact(12, [r], v) })).toEqual({ name: 'fish', recipes: 12, rules: [r], varietyRule: v, hasRules: true })
  })
  it('a Variety Rule alone counts as rules', () => {
    expect(deleteSummary({ tag: fish, impact: impact(0, [], variety('fish')) }).hasRules).toBe(true)
  })
  it('a Slot Rule alone counts as rules', () => {
    expect(deleteSummary({ tag: fish, impact: impact(0, [rule(1, 10, 1, 'fish')]) }).hasRules).toBe(true)
  })
})
