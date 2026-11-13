import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'
import type { LineDraft } from '../lib/draft'
import type { IngredientRef } from '../types'
import { useEditorLineLinks } from './useEditorLineLinks'

// BR-D round 3: "Use as a plain Ingredient" in the editor: the remembered-or-dialog choice lives in the hook, not in the screen.
const plain: IngredientRef = { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }
const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'k', ingredientId: 30, ingredientName: 'Béchamel', quantity: '500', unit: 'ml', optional: false, note: '', baseRecipeId: 3, baseRecipeName: 'Béchamel', linkedFromIngredientId: 5, ...over,
})
const setup = (known: IngredientRef[] = [plain]) => {
  const linkLine = vi.fn()
  const unlinkLine = vi.fn()
  const hook = renderHook(() => useEditorLineLinks({ ingredientOf: (id) => known.find((i) => i.id === id), linkLine, unlinkLine }), { wrapper })
  return { ...hook, linkLine, unlinkLine }
}

describe('useEditorLineLinks.asPlain', () => {
  it('goes back to the remembered Ingredient when it still exists', () => {
    const { result, unlinkLine } = setup()
    act(() => result.current.asPlain(line()))
    expect(unlinkLine).toHaveBeenCalledWith('k', plain)
    expect(result.current.plainKey).toBeNull()
  })
  it('opens the plain Ingredient dialog for the line when nothing is remembered', () => {
    const { result, unlinkLine } = setup()
    act(() => result.current.asPlain(line({ linkedFromIngredientId: null })))
    expect(unlinkLine).not.toHaveBeenCalled()
    expect(result.current.plainKey).toBe('k')
    expect(result.current.pickerKey).toBeNull()
  })
  it('opens it too when the remembered Ingredient is gone', () => {
    const { result, unlinkLine } = setup([])
    act(() => result.current.asPlain(line()))
    expect(unlinkLine).not.toHaveBeenCalled()
    expect(result.current.plainKey).toBe('k')
  })
  it('the chosen Ingredient then unlinks the line and closes the dialog', () => {
    const { result, unlinkLine } = setup([])
    act(() => result.current.asPlain(line({ linkedFromIngredientId: null })))
    act(() => result.current.choosePlain(plain))
    expect(unlinkLine).toHaveBeenCalledWith('k', plain)
    expect(result.current.plainKey).toBeNull()
  })
})

describe('useEditorLineLinks take-over Yes', () => {
  it('links the line to the Base recipe\'s Ingredient (the one the line already had) and the draft remembers nothing', async () => {
    const ask = { status: 409, json: { error: { code: 'base_recipe_take_over', message: 'x', ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true } } }
    mockApi({ 'POST /api/recipes': (c: { body: unknown }) => ((c.body as { takeOver?: boolean }).takeOver === undefined ? ask : { status: 201, json: { id: 9, name: 'Béchamel', baseIngredientId: 5 } }) })
    const { result, linkLine } = setup()
    await act(async () => { await result.current.linkTo(line({ ingredientId: 5, ingredientName: 'béchamel', baseRecipeId: undefined, linkedFromIngredientId: undefined }), { kind: 'new', name: 'Béchamel' }) })
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(linkLine).toHaveBeenCalledWith('k', { id: 9, name: 'Béchamel', ingredientId: 5 })
  })
})
