// The wording of the Merge and Delete confirms (spec 4.1), from lib/tags summaries.
import { describe, expect, it } from 'vitest'
import { deleteSummary, mergeSummary, type DeleteSummary, type MergeSummary } from '../../../lib/tags'
import { fish, fishImpact, fishRule, roastImpact, seafood, seafoodImpact, tagRow } from '../fixtures'
import { deleteConfirmCopy, mergeConfirmCopy } from './confirmCopy'

const merge = (over: Partial<MergeSummary> = {}): MergeSummary => ({
  source: 'fish',
  target: 'Seafood',
  recipes: 12,
  bothRecipes: 4,
  movedRules: [],
  droppedRules: [],
  varietyRule: 'none',
  ...over,
})

describe('mergeConfirmCopy', () => {
  it('the spec example, in full', () => {
    const summary = mergeSummary({ source: fish, target: seafood, sourceImpact: fishImpact, targetImpact: seafoodImpact, bothRecipes: 4 })
    expect(mergeConfirmCopy(summary)).toEqual({
      title: 'Merge fish into Seafood?',
      body: "fish comes off its 12 Recipes and Seafood goes on instead (4 already have both). Slot Rule Friday Dinner · Main = fish becomes = Seafood. fish's Variety Rule goes, because Seafood has its own.",
    })
  })

  it('names the Recipes; the "already have both" clause is left out when it is 0 or unknown', () => {
    expect(mergeConfirmCopy(merge({ bothRecipes: 0 })).body).toBe('fish comes off its 12 Recipes and Seafood goes on instead.')
  })

  it('singular forms', () => {
    expect(mergeConfirmCopy(merge({ recipes: 1, bothRecipes: 1 })).body).toBe('fish comes off its 1 Recipe and Seafood goes on instead (1 already has both).')
  })

  it('a Tag with no Recipe says so', () => {
    expect(mergeConfirmCopy(merge({ recipes: 0, bothRecipes: 0 })).body).toBe('No Recipe has fish.')
  })

  it('each moved Slot Rule gets a sentence', () => {
    const second = { ...fishRule, id: 8, weekday: 6, mealSlotName: 'Lunch' }
    const body = mergeConfirmCopy(merge({ bothRecipes: 0, movedRules: [fishRule, second] })).body
    expect(body).toContain('Slot Rule Friday Dinner · Main = fish becomes = Seafood.')
    expect(body).toContain('Slot Rule Saturday Lunch · Main = fish becomes = Seafood.')
  })

  it('a dropped Slot Rule says why', () => {
    expect(mergeConfirmCopy(merge({ bothRecipes: 0, droppedRules: [fishRule] })).body).toContain(
      'Slot Rule Friday Dinner · Main = fish goes, because Seafood already has a Slot Rule there.',
    )
  })

  it('the Variety Rule moves, goes or is not mentioned', () => {
    expect(mergeConfirmCopy(merge({ varietyRule: 'moves' })).body).toContain("fish's Variety Rule moves to Seafood.")
    expect(mergeConfirmCopy(merge({ varietyRule: 'goes' })).body).toContain("fish's Variety Rule goes, because Seafood has its own.")
    expect(mergeConfirmCopy(merge({ varietyRule: 'none' })).body).not.toContain('Variety Rule')
  })

  it('never uses a word GLOSSARY avoids for Tag: label, category', () => {
    const { title, body } = mergeConfirmCopy(merge({ varietyRule: 'goes', movedRules: [fishRule] }))
    expect(`${title} ${body}`).not.toMatch(/\b(label|category|categories)\b/i)
  })
})

describe('deleteConfirmCopy', () => {
  const del = (over: Partial<DeleteSummary> = {}): DeleteSummary => ({ name: 'fish', recipes: 12, rules: [], varietyRule: null, hasRules: false, ...over })

  it('the spec example, in full', () => {
    expect(deleteConfirmCopy(deleteSummary({ tag: fish, impact: fishImpact }))).toEqual({
      title: 'Delete fish?',
      body: 'fish is on 12 Recipes. Deleting it takes it off them. These go too: the Slot Rule Friday Dinner · Main = fish; the Variety Rule for fish.',
    })
  })

  it('without rules there is no "These go too"', () => {
    expect(deleteConfirmCopy(del()).body).toBe('fish is on 12 Recipes. Deleting it takes it off them.')
  })

  it('only a Variety Rule', () => {
    const body = deleteConfirmCopy(del({ varietyRule: { tag: 'fish', maxPerWeek: 2, notConsecutiveDays: true }, hasRules: true })).body
    expect(body).toBe('fish is on 12 Recipes. Deleting it takes it off them. These go too: the Variety Rule for fish.')
  })

  it('several Slot Rules are separated by semicolons', () => {
    const body = deleteConfirmCopy(del({ rules: [fishRule, { ...fishRule, id: 8, weekday: 2 }], hasRules: true })).body
    expect(body).toContain('These go too: the Slot Rule Friday Dinner · Main = fish; the Slot Rule Tuesday Dinner · Main = fish.')
  })

  it('one Recipe, and no Recipe', () => {
    expect(deleteConfirmCopy(del({ recipes: 1 })).body).toBe('fish is on 1 Recipe. Deleting it takes it off that Recipe.')
    expect(deleteConfirmCopy(deleteSummary({ tag: tagRow(4, 'Roast'), impact: roastImpact })).body).toBe('Roast is on no Recipes.')
  })

  it('never refuses: an unused Tag still has a title and a body', () => {
    const copy = deleteConfirmCopy(del({ recipes: 0 }))
    expect(copy.title).toBe('Delete fish?')
    expect(copy.body).not.toBe('')
  })
})
