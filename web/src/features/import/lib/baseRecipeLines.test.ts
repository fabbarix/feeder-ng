// BR-E (docs/dev/design/base-recipes.md §11.3): the rows, answers and "Confirm needs an answer" of the Base recipe line tiles. Pure; RED until lib/baseRecipeLines.ts exists.
import { describe, expect, it } from 'vitest'
import { baseLine, fileSuggestion, plannableSuggestion, takeOver, useSuggestion } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import { baseRecipeRows, confirmNeedsAnswer, takeOverFor, takeOverText, unansweredCount } from './baseRecipeLines'

describe('baseRecipeRows', () => {
  it('has no rows when the plan has no Base recipe line', () => {
    expect(baseRecipeRows(plan())).toEqual([])
  })

  it('reads the line as "500 ml béchamel", with the cue after a dot', () => {
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [baseLine({ cue: 'see page 42' })] }))
    expect(row!.path).toBe('$.recipes[0].ingredients[1]')
    expect(row!.reading).toBe('500 ml béchamel · see page 42')
    expect(baseRecipeRows(plan({ baseRecipeLines: [baseLine()] }))[0]!.reading).toBe('500 ml béchamel')
  })

  it('lists the answers in order: existing Base recipes, this file, new (Fill in later, Read it next), plannable Recipes, keep', () => {
    const [row] = baseRecipeRows(
      plan({
        baseRecipeLines: [
          baseLine({
            suggestions: [plannableSuggestion(7, 'Pesto'), fileSuggestion(1, 'Béchamel'), useSuggestion(3, 'Béchamel')],
          }),
        ],
      }),
    )
    expect(row!.options.map((o) => o.label)).toEqual([
      'Use Base recipe Béchamel',
      'Use Béchamel from this import',
      'Add it as a new Base recipe · Fill in later',
      'Add it as a new Base recipe · Read it next',
      'Turn Pesto into a Base recipe',
      'Keep it as an Ingredient',
    ])
    expect(row!.options.map((o) => o.kind)).toEqual(['use', 'file', 'create', 'create', 'convert', 'keep'])
  })

  it('always offers the new Base recipe and keep, even with no suggestion', () => {
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [baseLine()] }))
    expect(row!.options.map((o) => o.kind)).toEqual(['create', 'create', 'keep'])
  })

  it('shows the plain Ingredient of the same name next to Keep it as an Ingredient', () => {
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [baseLine({ keepIngredient: { id: 5, name: 'béchamel', baseUnit: 'ml' } })] }))
    expect(row!.options.find((o) => o.kind === 'keep')!.detail).toBe('béchamel')
  })

  it('gives each option the answer it sends; the plannable one sends none (the convert dialog asks the Yield first)', () => {
    const [row] = baseRecipeRows(
      plan({ baseRecipeLines: [baseLine({ suggestions: [useSuggestion(3, 'Béchamel'), fileSuggestion(1, 'Roux'), plannableSuggestion(7, 'Pesto')] })] }),
    )
    const decisions = row!.options.map((o) => o.decision)
    expect(decisions).toEqual([
      { action: 'use', recipeId: 3 },
      { action: 'file', recipeIndex: 1 },
      { action: 'create' },
      { action: 'create', readNext: true },
      null,
      { action: 'keep' },
    ])
  })

  it('marks the answer in force (the User\'s, or the preselected exact match) as selected, and only that one', () => {
    const line = baseLine({
      suggestions: [useSuggestion(3, 'Béchamel'), useSuggestion(4, 'Béchamel blanche', false)],
      effective: { action: 'use', recipeId: 3 },
      resolved: true,
    })
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [line] }))
    expect(row!.options.filter((o) => o.selected).map((o) => o.label)).toEqual(['Use Base recipe Béchamel'])
    expect(row!.resolved).toBe(true)
  })

  it.each([
    [{ action: 'create' as const }, 'Add it as a new Base recipe · Fill in later'],
    [{ action: 'create' as const, readNext: true }, 'Add it as a new Base recipe · Read it next'],
    [{ action: 'keep' as const }, 'Keep it as an Ingredient'],
    [{ action: 'file' as const, recipeIndex: 1 }, 'Use Roux from this import'],
    [{ action: 'convert' as const, recipeId: 7, yield: 1, yieldUnit: 'portion' }, 'Turn Pesto into a Base recipe'],
  ])('selects the matching option for the answer %j', (effective, label) => {
    const line = baseLine({ suggestions: [fileSuggestion(1, 'Roux'), plannableSuggestion(7, 'Pesto')], effective, resolved: true })
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [line] }))
    expect(row!.options.filter((o) => o.selected).map((o) => o.label)).toEqual([label])
  })

  it('selects nothing and is not resolved while the line has no answer', () => {
    const [row] = baseRecipeRows(plan({ baseRecipeLines: [baseLine({ suggestions: [useSuggestion(3, 'Béchamel', false)] })] }))
    expect(row!.options.some((o) => o.selected)).toBe(false)
    expect(row!.resolved).toBe(false)
  })

  it('keeps the plan order of the tiles', () => {
    const rows = baseRecipeRows(plan({ baseRecipeLines: [baseLine({ path: 'a', name: 'roux' }), baseLine({ path: 'b', name: 'stock' })] }))
    expect(rows.map((r) => r.path)).toEqual(['a', 'b'])
  })
})

describe('unanswered tiles block Confirm', () => {
  it('counts the unresolved tiles and the unresolved take-over asks', () => {
    const p = plan({
      baseRecipeLines: [baseLine({ path: 'a', resolved: true, effective: { action: 'keep' } }), baseLine({ path: 'b' }), baseLine({ path: 'c' })],
      takeOvers: [takeOver({ path: 'a', resolved: false }), takeOver({ path: 'b', resolved: true, answer: false })],
    })
    expect(unansweredCount(p)).toBe(3)
  })

  it('is 0 when every tile and every ask is resolved', () => {
    expect(unansweredCount(plan({ baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'keep' } })] }))).toBe(0)
  })

  it('says nothing when all is answered', () => {
    expect(confirmNeedsAnswer(plan())).toBeNull()
  })

  it('names the line when one is open', () => {
    expect(confirmNeedsAnswer(plan({ baseRecipeLines: [baseLine()] }))).toBe('Confirm needs an answer to "500 ml béchamel"')
  })

  it('counts them when several are open', () => {
    expect(confirmNeedsAnswer(plan({ baseRecipeLines: [baseLine({ path: 'a' }), baseLine({ path: 'b' })] }))).toBe('Confirm needs an answer to 2 Base recipe questions')
  })
})

describe('the take-over ask (P7 = B)', () => {
  it('finds the ask of a tile by path', () => {
    const p = plan({ takeOvers: [takeOver({ path: 'x' }), takeOver({ path: 'y' })] })
    expect(takeOverFor(p, 'y')?.path).toBe('y')
    expect(takeOverFor(p, 'z')).toBeUndefined()
  })

  it('names the Ingredient, its Recipes and its Stock Lots, then asks', () => {
    expect(takeOverText(takeOver())).toBe(
      'An Ingredient named béchamel exists. It is on Moussaka and Lasagne, and 1 Stock Lot of it is in the Pantry. Should the new Base recipe Béchamel take it over?',
    )
  })

  it('pluralises the Stock Lots', () => {
    expect(takeOverText(takeOver({ stockLots: 2 }))).toContain('and 2 Stock Lots of it are in the Pantry.')
  })

  it('says it has no Stock', () => {
    expect(takeOverText(takeOver({ stockLots: 0 }))).toContain('It is on Moussaka and Lasagne and has no Stock.')
  })

  it('says it is on no Recipe', () => {
    expect(takeOverText(takeOver({ recipes: [], stockLots: 0 }))).toContain('It is on no Recipe and has no Stock.')
  })
})
