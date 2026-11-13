// BR-E: the hook behind the Base recipe line tiles and the convert dialog (design §3.6, §11.3). RED until hooks/useBaseRecipeLines.ts exists.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'
import { baseLine, plannableSuggestion, takeOver, useSuggestion } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import { useBaseRecipeLines } from './useBaseRecipeLines'

const path = '$.recipes[0].ingredients[1]'
const dryRun = {
  plannedMeals: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: true, bought: false }],
  slotRules: [],
  leftovers: 2,
  preferences: 1,
}

function setup(over: { unit?: string; quantity?: number } = {}) {
  const p = plan({
    baseRecipeLines: [baseLine({ unit: over.unit ?? 'ml', quantity: over.quantity ?? 500, suggestions: [useSuggestion(3, 'Béchamel', false), plannableSuggestion(7, 'Pesto')] })],
    takeOvers: [takeOver()],
  })
  const onAnswer = vi.fn()
  const hook = renderHook(() => useBaseRecipeLines({ plan: p, onAnswer }), { wrapper })
  return { ...hook, onAnswer, plan: p }
}

describe('useBaseRecipeLines', () => {
  it('has the rows of the plan and the take-over ask of each', () => {
    const { result } = setup()
    expect(result.current.rows.map((r) => r.path)).toEqual([path])
    expect(result.current.askFor(path)?.name).toBe('Béchamel')
    expect(result.current.askFor('other')).toBeUndefined()
    expect(result.current.convert).toBeNull()
  })

  it('answers a tile through onAnswer', () => {
    const { result, onAnswer } = setup()
    act(() => result.current.answer(path, { action: 'keep' }))
    expect(onAnswer).toHaveBeenCalledWith(path, { action: 'keep' })
  })

  describe('convert a plannable Recipe', () => {
    it('asks the server what the conversion takes away, links nothing, and prefills the Yield from the line', async () => {
      const api = mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result } = setup()
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      expect(api.calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/api/recipes/7/to-base?dryRun=1'])
      expect(result.current.convert).toMatchObject({
        path,
        recipe: { id: 7, name: 'Pesto' },
        status: 'ready',
        yield: 500,
        yieldUnit: 'ml',
        confirm: { title: 'Turn Pesto into a Base recipe?', confirmLabel: 'Turn into a Base recipe' },
      })
      expect(result.current.convert!.confirm!.body).toContain('Its 2 Leftovers stay until you answer them.')
    })

    it('a unit outside the Yield units gives 1 portion', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result } = setup({ unit: 'clove', quantity: 3 })
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      expect(result.current.convert).toMatchObject({ yield: 1, yieldUnit: 'portion' })
    })

    it('is loading while the dry run is asked', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result } = setup()
      let started: Promise<void>
      act(() => {
        started = result.current.startConvert(path, { id: 7, name: 'Pesto' })
      })
      expect(result.current.convert).toMatchObject({ status: 'loading' })
      await act(() => started)
    })

    it('Turn into a Base recipe takes the answer with the Yield, and closes the dialog', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result, onAnswer } = setup()
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      act(() => result.current.setYield(250))
      act(() => result.current.setYieldUnit('g'))
      act(() => result.current.confirmConvert())
      expect(onAnswer).toHaveBeenCalledWith(path, { action: 'convert', recipeId: 7, yield: 250, yieldUnit: 'g' })
      expect(result.current.convert).toBeNull()
    })

    it('refuses a Yield that is blank or not above 0', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result, onAnswer } = setup()
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      act(() => result.current.setYield(null))
      expect(result.current.canConfirmConvert).toBe(false)
      act(() => result.current.confirmConvert())
      act(() => result.current.setYield(0))
      expect(result.current.canConfirmConvert).toBe(false)
      expect(onAnswer).not.toHaveBeenCalled()
    })

    it('Cancel goes back to the tile with nothing chosen', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': dryRun })
      const { result, onAnswer } = setup()
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      act(() => result.current.cancelConvert())
      expect(result.current.convert).toBeNull()
      expect(onAnswer).not.toHaveBeenCalled()
    })

    it('says so when the dry run fails, with nothing chosen and Turn into a Base recipe off', async () => {
      mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': refusal(422, 'validation_failed', { field: 'baseRecipe', reason: 'base_recipe_ready_meal' }) })
      const { result, onAnswer } = setup()
      await act(() => result.current.startConvert(path, { id: 7, name: 'Pesto' }))
      await waitFor(() => expect(result.current.convert?.status).toBe('error'))
      expect(result.current.convert!.error).toBe('A Ready Meal cannot be a Base recipe.')
      expect(result.current.canConfirmConvert).toBe(false)
      expect(onAnswer).not.toHaveBeenCalled()
    })
  })
})
