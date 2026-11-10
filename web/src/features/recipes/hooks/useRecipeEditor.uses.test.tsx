import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import type { Recipe } from '../types'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({ recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn() } }))
const api = vi.mocked(recipesApi)
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

beforeEach(() => vi.resetAllMocks())

describe('useRecipeEditor: unknown unit in a Step use (G2)', () => {
  it('prompts for the use, saves the Unit Conversion and saves the Recipe again', async () => {
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() =>
      result.current.setDraft((d) => ({
        ...d,
        name: 'Aioli',
        lines: [{ key: 'l', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }],
        steps: [{ key: 's', text: 'Crush', kind: 'active', durationMinutes: '', leadTimeMinutes: '', after: [], image: '', uses: [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'head' }] }],
      })),
    )
    api.create.mockRejectedValueOnce(
      new ApiError(422, 'unknown_unit', 'No', { field: 'steps[0].uses[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'head', baseUnit: 'g' }),
    )
    await act(async () => {
      expect(await result.current.save()).toBeNull()
    })
    expect(result.current.unitPrompt).toMatchObject({ useRef: [0, 0], unit: 'head', baseUnit: 'g' })

    api.create.mockResolvedValueOnce({ id: 5 } as Recipe)
    await act(async () => {
      expect(await result.current.answerUnitPrompt(50)).toMatchObject({ id: 5 })
    })
    expect(api.saveConversion).toHaveBeenCalledWith(7, 'head', 50)
    expect(result.current.unitPrompt).toBeNull()
  })
})
