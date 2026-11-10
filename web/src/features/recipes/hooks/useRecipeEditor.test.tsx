import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import type { LineDraft } from '../lib/draft'
import type { Recipe } from '../types'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({
  recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn() },
}))
const api = vi.mocked(recipesApi)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over,
})

const saved = { id: 11, name: 'Aioli' } as Recipe

function fill(result: { current: ReturnType<typeof useRecipeEditor> }, over = {}) {
  act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line()], ...over })))
}

beforeEach(() => vi.resetAllMocks())

describe('useRecipeEditor', () => {
  it('does not call the API while the draft is invalid and reports the errors', async () => {
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    let out: Recipe | null = saved
    await act(async () => {
      out = await result.current.save()
    })
    expect(out).toBeNull()
    expect(result.current.errors).toMatchObject({ name: 'name_required', lines: 'lines_required' })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('creates a new Recipe from the parsed draft', async () => {
    api.create.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fill(result)
    let out: Recipe | null = null
    await act(async () => {
      out = await result.current.save()
    })
    expect(out).toBe(saved)
    expect(api.create).toHaveBeenCalledOnce()
    expect(api.create.mock.calls[0]![0]).toMatchObject({ name: 'Aioli', yield: 4, lines: [{ ingredientId: 7, quantity: 3, unit: 'clove' }] })
    expect(result.current.errors).toEqual({})
  })

  it('asks for a Unit Conversion, saves it, then saves the Recipe again', async () => {
    api.create
      .mockRejectedValueOnce(new ApiError(422, 'unknown_unit', 'No', { field: 'lines[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'clove', baseUnit: 'g' }))
      .mockResolvedValueOnce(saved)
    api.saveConversion.mockResolvedValue(undefined)
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fill(result)

    let first: Recipe | null = saved
    await act(async () => {
      first = await result.current.save()
    })
    expect(first).toBeNull()
    expect(result.current.unitPrompt).toMatchObject({ lineIndex: 0, ingredientId: 7, unit: 'clove', baseUnit: 'g' })

    let second: Recipe | null = null
    await act(async () => {
      second = await result.current.answerUnitPrompt(5)
    })
    expect(api.saveConversion).toHaveBeenCalledWith(7, 'clove', 5)
    expect(api.create).toHaveBeenCalledTimes(2)
    expect(second).toBe(saved)
    expect(result.current.unitPrompt).toBeNull()
  })

  it('dismissing the prompt keeps the draft', async () => {
    api.create.mockRejectedValue(new ApiError(422, 'unknown_unit', 'No', { field: 'lines[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'clove', baseUnit: 'g' }))
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fill(result)
    await act(async () => {
      await result.current.save()
    })
    act(() => result.current.dismissUnitPrompt())
    expect(result.current.unitPrompt).toBeNull()
    expect(result.current.draft.lines).toHaveLength(1)
    expect(api.saveConversion).not.toHaveBeenCalled()
  })

  it('maps a server validation error onto the form field', async () => {
    api.create.mockRejectedValue(new ApiError(422, 'validation_failed', 'Quantity', { field: 'lines[2].quantity', reason: 'quantity_invalid' }))
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fill(result)
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.errors).toEqual({ 'lines.2.quantity': 'quantity_invalid' })
  })

  it('replaces an existing Recipe with PUT', async () => {
    api.get.mockResolvedValue({
      id: 11, name: 'Aioli', description: '', yield: 4, readyMeal: false, tags: [], cooldownDays: null, leftoverUseByDays: null, reheatMinutes: null,
      source: { url: '', attribution: '' }, image: '', imageUrl: '', archived: false, totalMinutes: 0, advanceMinutes: 0, advance: [],
      lines: [{ ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'g', optional: false, note: '' }], steps: [], createdAt: '', updatedAt: '',
    })
    api.replace.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(11), { wrapper })
    await vi.waitFor(() => expect(result.current.draft.name).toBe('Aioli'))
    await act(async () => {
      await result.current.save()
    })
    expect(api.replace).toHaveBeenCalledWith(11, expect.objectContaining({ name: 'Aioli', yield: 4 }))
    expect(api.create).not.toHaveBeenCalled()
  })
})
