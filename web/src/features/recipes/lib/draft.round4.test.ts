import { describe, expect, it } from 'vitest'
import { recipe } from '../fixtures.test-helper'
import * as baseRecipeLib from './baseRecipe'
import { linkDraftLine, unlinkDraftLine } from './baseRecipe'
import { draftFromRecipe, draftToInput, emptyDraft, type LineDraft } from './draft'
import type { RecipeLine } from '../types'

// BR-D round 4: neededAtDefault comes from the server (line.neededAtDefault); the client no longer works the default out.
const plain: RecipeLine = { id: 11, ingredientId: 9, ingredient: 'milk', quantity: 1000, unit: 'ml', optional: false, note: '', neededAtDefault: null }
const based: RecipeLine = {
  id: 12, ingredientId: 31, ingredient: 'Roux', quantity: 100, unit: 'g', optional: false, note: '',
  baseRecipe: { id: 4, name: 'Roux', archived: false }, neededAtStep: 3, neededAt: 3, neededAtDefault: 1, linkedFromIngredientId: 6,
}
const stored = (lines: RecipeLine[]) => recipe({ id: 2, name: 'Lasagne', lines })

describe('neededAtDefault in the draft', () => {
  it('the draft line carries the server\'s default Step, beside the explicit neededAtStep', () => {
    const [p, b] = draftFromRecipe(stored([plain, based])).lines
    expect(b).toMatchObject({ neededAtStep: 3, neededAtDefault: 1 })
    expect(p?.neededAtDefault ?? null).toBeNull()
  })
  it('a Base recipe line with no override keeps the default and a null override', () => {
    const [b] = draftFromRecipe(stored([{ ...based, neededAtStep: null, neededAt: 1 }])).lines
    expect(b).toMatchObject({ neededAtStep: null, neededAtDefault: 1 })
  })
  it('is output only: never sent on a save', () => {
    const [p, b] = draftToInput(draftFromRecipe(stored([plain, based]))).lines as unknown as Array<Record<string, unknown>>
    expect('neededAtDefault' in p!).toBe(false)
    expect('neededAtDefault' in b!).toBe(false)
    expect(b).toMatchObject({ neededAtStep: 3 })
  })
  it('linking a line in the editor has no default until the server has seen it (null, never guessed)', () => {
    const line: LineDraft = { key: 'k', ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: false, note: '' }
    const linked = linkDraftLine({ ...emptyDraft(), lines: [line] }, 'k', { id: 3, name: 'Béchamel', ingredientId: 30 })
    expect(linked.lines[0]?.neededAtDefault ?? null).toBeNull()
  })
  it('unlinking clears it', () => {
    const d = draftFromRecipe(stored([based]))
    const next = unlinkDraftLine(d, d.lines[0]!.key, { id: 6, name: 'roux', baseUnit: 'g', conversions: [] })
    expect(next.lines[0]?.neededAtDefault ?? null).toBeNull()
  })
})

describe('the client default rule is gone', () => {
  it('lib/baseRecipe no longer exports defaultNeededAt', () => {
    expect('defaultNeededAt' in baseRecipeLib).toBe(false)
  })
})
