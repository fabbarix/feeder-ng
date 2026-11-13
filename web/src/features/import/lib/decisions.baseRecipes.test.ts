// BR-E: the Base recipe answers in Decisions (baseRecipeLines, takeOvers). RED until lib/decisions.ts has them.
import { describe, expect, it } from 'vitest'
import { chooseBaseRecipeLine, chooseTakeOver, clearBaseRecipeLine, emptyDecisions } from './decisions'

describe('Base recipe answers', () => {
  it('starts without them: an old plan\'s decisions are unchanged', () => {
    expect(emptyDecisions()).toEqual({ ingredients: [], conversions: [], recipes: [], courses: [] })
  })

  it('answers a tile by its path', () => {
    const d = chooseBaseRecipeLine(emptyDecisions(), '$.recipes[0].ingredients[1]', { action: 'use', recipeId: 3 })
    expect(d.baseRecipeLines).toEqual({ '$.recipes[0].ingredients[1]': { action: 'use', recipeId: 3 } })
  })

  it('replaces an earlier answer of the same tile and keeps the others', () => {
    let d = chooseBaseRecipeLine(emptyDecisions(), 'a', { action: 'keep' })
    d = chooseBaseRecipeLine(d, 'b', { action: 'create' })
    d = chooseBaseRecipeLine(d, 'a', { action: 'create', readNext: true })
    expect(d.baseRecipeLines).toEqual({ a: { action: 'create', readNext: true }, b: { action: 'create' } })
  })

  it('does not change the decisions it was given', () => {
    const before = emptyDecisions()
    chooseBaseRecipeLine(before, 'a', { action: 'keep' })
    expect(before).toEqual(emptyDecisions())
  })

  it('a new answer for a tile drops the take-over answer of that path (the ask may no longer apply)', () => {
    let d = chooseTakeOver(emptyDecisions(), 'a', true)
    d = chooseTakeOver(d, 'b', false)
    d = chooseBaseRecipeLine(d, 'a', { action: 'keep' })
    expect(d.takeOvers).toEqual({ b: false })
  })

  it('answers a take-over ask by path: true takes it over, false keeps it apart', () => {
    let d = chooseTakeOver(emptyDecisions(), 'a', true)
    expect(d.takeOvers).toEqual({ a: true })
    d = chooseTakeOver(d, 'a', false)
    expect(d.takeOvers).toEqual({ a: false })
  })

  it('clears a tile\'s answer (and its take-over answer)', () => {
    let d = chooseBaseRecipeLine(emptyDecisions(), 'a', { action: 'create' })
    d = chooseTakeOver(d, 'a', true)
    d = clearBaseRecipeLine(d, 'a')
    expect(d.baseRecipeLines ?? {}).toEqual({})
    expect(d.takeOvers ?? {}).toEqual({})
  })
})
