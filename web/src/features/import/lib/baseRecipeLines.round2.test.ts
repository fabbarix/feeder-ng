// BR-E round 2: the logic that used to sit in components, as pure helpers of lib/baseRecipeLines.ts. RED until they exist.
import { describe, expect, it } from 'vitest'
import { baseLine, fileSuggestion, takeOver } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import type { Problem, Warning } from '../types'
import { answerForLinkChoice, askForYield, baseRecipeRows, genericProblems, problemsFor, problemsOnTiles, standaloneAsks, warningsFor } from './baseRecipeLines'

const p = (path: string, code = 'x'): Problem => ({ path, code, message: `m ${path}` })
const w = (path: string): Warning => ({ path, code: 'same_name_ingredient', message: `w ${path}` })
const tiles = plan({ baseRecipeLines: [baseLine({ path: 'a' }), baseLine({ path: 'b' })] })

describe('problemsFor / warningsFor', () => {
  it('keep only the entries of one path, in order', () => {
    const list = [p('a'), p('b'), p('a', 'y')]
    expect(problemsFor('a', list).map((x) => x.code)).toEqual(['x', 'y'])
    expect(problemsFor('z', list)).toEqual([])
    expect(warningsFor('b', [w('a'), w('b')])).toEqual([w('b')])
  })
})

describe('problemsOnTiles / genericProblems', () => {
  const list = [p('a'), p('$.recipes[0].name'), p('b'), p('$.recipes[1]')]

  it('splits the Problems into those of a Base recipe tile and the rest, keeping the plan order', () => {
    expect(problemsOnTiles(tiles, list).map((x) => x.path)).toEqual(['a', 'b'])
    expect(genericProblems(tiles, list).map((x) => x.path)).toEqual(['$.recipes[0].name', '$.recipes[1]'])
  })

  it('every Problem is in exactly one of the two', () => {
    expect(problemsOnTiles(tiles, list).length + genericProblems(tiles, list).length).toBe(list.length)
  })

  it('with no tile everything is generic', () => {
    expect(problemsOnTiles(plan(), list)).toEqual([])
    expect(genericProblems(plan(), list)).toEqual(list)
  })
})

describe('standaloneAsks', () => {
  it('are the take-over asks that no tile carries (a Base recipe of the file: "$.recipes[i]")', () => {
    const p2 = plan({ baseRecipeLines: [baseLine({ path: 'a' })], takeOvers: [takeOver({ path: 'a' }), takeOver({ path: '$.recipes[1]', name: 'Roux' })] })
    expect(standaloneAsks(p2).map((a) => a.path)).toEqual(['$.recipes[1]'])
  })

  it('are none when every ask has its tile', () => {
    expect(standaloneAsks(plan({ baseRecipeLines: [baseLine({ path: 'a' })], takeOvers: [takeOver({ path: 'a' })] }))).toEqual([])
    expect(standaloneAsks(plan())).toEqual([])
  })
})

describe('askForYield', () => {
  const fileRow = (effective: object | undefined) =>
    baseRecipeRows(plan({ baseRecipeLines: [baseLine({ path: 'a', suggestions: [fileSuggestion(1, 'Roux', false)], effective: effective as never })] }))[0]!
  const invalid = [p('a', 'base_recipe_answer_invalid')]

  it('is true for a "file" answer the server refused (it needs a Yield)', () => {
    expect(askForYield(fileRow({ action: 'file', recipeIndex: 1 }), invalid)).toBe(true)
  })

  it('is false without that Problem, for another path, or for another answer', () => {
    expect(askForYield(fileRow({ action: 'file', recipeIndex: 1 }), [])).toBe(false)
    expect(askForYield(fileRow({ action: 'file', recipeIndex: 1 }), [p('b', 'base_recipe_answer_invalid')])).toBe(false)
    expect(askForYield(fileRow({ action: 'file', recipeIndex: 1 }), [p('a', 'other')])).toBe(false)
    expect(askForYield(fileRow({ action: 'keep' }), invalid)).toBe(false)
    expect(askForYield(fileRow(undefined), invalid)).toBe(false)
  })
})

describe('answerForLinkChoice (the shared picker\'s choice becomes an answer or a convert)', () => {
  it('an existing Base recipe answers use', () => {
    expect(answerForLinkChoice({ kind: 'existing', baseRecipe: { id: 4, name: 'Stock' } })).toEqual({ kind: 'answer', answer: { action: 'use', recipeId: 4 } })
  })

  it('"Add as a new Base recipe" answers create (Fill in later)', () => {
    expect(answerForLinkChoice({ kind: 'new', name: 'Béchamel' })).toEqual({ kind: 'answer', answer: { action: 'create' } })
  })

  it('a plannable Recipe asks the convert dialog first', () => {
    expect(answerForLinkChoice({ kind: 'convert', recipe: { id: 7, name: 'Pesto' } })).toEqual({ kind: 'convert', recipe: { id: 7, name: 'Pesto' } })
  })
})
