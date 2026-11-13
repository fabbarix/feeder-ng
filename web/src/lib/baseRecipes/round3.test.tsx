import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readSource } from '../../features/plan/test-css'
import { mockApi, wrapper } from './test-utils'
import { useLineLink, type SavedLine } from './useLineLink'
import { useLinkCandidates } from './useLinkCandidates'

// BR-D round 3: Use as a plain Ingredient with a choice; providers are required; and the review's code nits as source contracts.
const line = (over: Partial<SavedLine> = {}): SavedLine => ({ id: 71, ingredientName: 'Béchamel', quantity: 500, unit: 'ml', linkedFromIngredientId: null, baseRecipe: { id: 3, name: 'Béchamel' }, ...over })

describe('useLineLink.useAsPlain with a chosen Ingredient', () => {
  it('sends { ingredientId } when nothing is remembered and the User chose one', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/71/base': { id: 7 } })
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.useAsPlain(line(), 7) })
    expect(out).toBe('done')
    expect(api.callsTo('DELETE', '/api/recipes/7/lines/71/base')[0]?.body).toEqual({ ingredientId: 7 })
  })
  it('still answers "pick" without a choice and nothing remembered, with no request', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.useAsPlain(line()) })
    expect(out).toBe('pick')
    expect(api.calls).toEqual([])
  })
})

describe('the hooks need their providers (no useOptionalToast / useOptionalConfirm)', () => {
  it('useLineLink throws outside a ToastProvider and ConfirmProvider', () => {
    expect(() => renderHook(() => useLineLink({ recipeId: 7 }))).toThrow()
  })
  it('useLinkCandidates throws outside a ToastProvider', () => {
    expect(() => renderHook(() => useLinkCandidates({ baseRecipeId: 3, baseName: 'B', baseUnit: 'ml', baseIngredientId: 30, onDone: () => {} }))).toThrow()
  })
  it.each([
    'ui/Toast.tsx', 'ui/ConfirmDialog.tsx', 'lib/baseRecipes/useLineLink.ts', 'lib/baseRecipes/useLinkCandidates.ts',
    'features/recipes/hooks/useEditorLineLinks.ts', 'features/recipes/hooks/useBaseRecipeChange.ts',
  ])('%s has no useOptional*', (file) => {
    const text = readSource(file)
    expect(text).not.toBe('')
    expect(text).not.toMatch(/useOptional(Toast|Confirm)/)
  })
})

describe('code contracts from the review', () => {
  it('useLineLink creates the Base recipe with newBaseRecipeInput and no `as never`', () => {
    const text = readSource('lib/baseRecipes/useLineLink.ts')
    expect(text).toContain('newBaseRecipeInput')
    expect(text).not.toContain('as never')
  })
  it('Select has no unused typedText branch in exactFirst (rank is the search text)', () => {
    expect(readSource('ui/Select/Select.tsx')).not.toContain('typedText')
  })
  it('the screens have no `ml` fallback for the base unit (it comes from the Base recipe)', () => {
    expect(readSource('features/recipes/screens/RecipeEditorScreen.tsx')).not.toMatch(/\?\?\s*'ml'/)
    expect(readSource('features/recipes/screens/RecipeDetailScreen.tsx')).not.toMatch(/\?\?\s*'ml'/)
  })
  it('BaseRecipeSection and BaseName read their words from recipeStrings, no hard-coded English', () => {
    const detail = readSource('features/recipes/screens/RecipeDetailScreen.tsx')
    expect(detail).not.toMatch(/`Yield \$\{/)
    expect(detail).not.toContain('Recipes with an Ingredient named')
    const lines = readSource('features/recipes/components/IngredientLinesList.tsx')
    expect(lines).not.toContain('No Ingredients yet')
    expect(lines).not.toMatch(/, archived\)/)
    const strings = readSource('features/recipes/strings.ts')
    expect(strings).toContain('No Ingredients yet')
    expect(strings).toContain('Recipes with an Ingredient named')
  })
  it('yield.ts no longer says a cup gives a portion', () => {
    const text = readSource('lib/baseRecipes/yield.ts')
    expect(text).not.toMatch(/\(a "cup"/)
    expect(text).not.toMatch(/"cup", a "clove"/)
  })
})
