// WP-E/G: adopting a finished read, candidate photos and the `photo` of Confirm in useImportReview (ra-e-import.md section 5.2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { match, photos, plan, recipe } from '../fixtures.test-helper'
import type { Plan } from '../types'

const api = vi.hoisted(() => ({ open: vi.fn(), plan: vi.fn(), confirm: vi.fn(), discard: vi.fn(), agentPrompt: vi.fn(), recipes: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useImportReview } from './useImportReview'

const twoRecipes = plan({ ready: true, recipes: [recipe({ index: 0, name: 'Soup' }), recipe({ index: 1, name: 'Bread' })] })
const oneRecipe = plan({ ready: true, recipes: [recipe({ index: 0, name: 'Soup' })] })
const result = { recipes: [{ index: 0, id: 1, name: 'Soup', action: 'created' as const }], ingredientsCreated: 0, conversionsAdded: 0 }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useImportReview(), { wrapper })
}
const adopt = (h: ReturnType<typeof setup>, p: Plan = oneRecipe, n = 2) =>
  act(() => h.result.current.adopt({ id: 'imp1', plan: p, photos: photos(n), source: { kind: 'photo', photoCount: n }, model: { id: 'm', name: 'Claude Haiku 5.5' } }))
const confirmedPhoto = () => api.confirm.mock.calls.at(-1)?.[2]

beforeEach(() => {
  vi.clearAllMocks()
  api.confirm.mockResolvedValue(result)
  api.plan.mockImplementation(async (id: string) => ({ id, plan: oneRecipe }))
  api.discard.mockResolvedValue(undefined)
})

describe('useImportReview.adopt', () => {
  it('opens the review of a finished read without any request', () => {
    const h = setup()
    adopt(h)
    expect(h.result.current).toMatchObject({ phase: 'reviewing', plan: oneRecipe, reviewId: 'imp1', error: undefined })
    expect(h.result.current.photos).toEqual(photos(2))
    expect(api.open).not.toHaveBeenCalled()
    expect(api.plan).not.toHaveBeenCalled()
  })
  it('keeps what it was told about the read: the model and, for a page, that its recipe data was a hint', () => {
    const h = setup()
    act(() => h.result.current.adopt({ id: 'imp1', plan: oneRecipe, source: { kind: 'page', structuredData: true }, model: { id: 'm', name: 'Claude Haiku 5.5' } }))
    expect(h.result.current.readNote).toEqual({ modelName: 'Claude Haiku 5.5', structuredData: true })
    expect(h.result.current.photos).toEqual([])
  })
  it('a file opened with open() has no photos and no read note', async () => {
    api.open.mockResolvedValue({ id: 'f1', plan: oneRecipe })
    const h = setup()
    adopt(h)
    await act(() => h.result.current.open('{}'))
    expect(h.result.current).toMatchObject({ reviewId: 'f1', photos: [], readNote: undefined })
  })
  it('later answers use the adopted review id', async () => {
    const h = setup()
    adopt(h, plan({ ready: false, ingredients: [match({ key: 'onion', status: 'conflict', resolved: false })] }))
    act(() => h.result.current.chooseExisting('onion', 5))
    await vi.waitFor(() => expect(api.plan).toHaveBeenCalled())
    expect(api.plan.mock.calls[0]![0]).toBe('imp1')
  })
})

describe('the photo choice', () => {
  it('is off by default: Confirm sends no photo', async () => {
    const h = setup()
    adopt(h)
    expect(h.result.current.photoChoice).toEqual({ enabled: false, photo: 0, recipe: 0 })
    await act(() => h.result.current.confirm())
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(api.confirm.mock.calls[0]![0]).toBe('imp1')
    expect(confirmedPhoto()).toBeUndefined()
  })
  it('switched on: Confirm sends the first photo for the first Recipe', async () => {
    const h = setup()
    adopt(h)
    act(() => h.result.current.setPhotoEnabled(true))
    expect(h.result.current.photoChoice.enabled).toBe(true)
    await act(() => h.result.current.confirm())
    expect(confirmedPhoto()).toEqual({ index: 0, recipe: 0 })
  })
  it('with several photos the chosen one is sent', async () => {
    const h = setup()
    adopt(h, oneRecipe, 3)
    act(() => h.result.current.setPhotoEnabled(true))
    act(() => h.result.current.choosePhoto(2))
    await act(() => h.result.current.confirm())
    expect(confirmedPhoto()).toEqual({ index: 2, recipe: 0 })
  })
  it('with several Recipes the chosen one gets it', async () => {
    const h = setup()
    adopt(h, twoRecipes)
    expect(h.result.current.photoRecipes).toEqual([{ index: 0, name: 'Soup' }, { index: 1, name: 'Bread' }])
    act(() => h.result.current.setPhotoEnabled(true))
    act(() => h.result.current.choosePhotoRecipe(1))
    act(() => h.result.current.choosePhoto(1))
    await act(() => h.result.current.confirm())
    expect(confirmedPhoto()).toEqual({ index: 1, recipe: 1 })
  })
  it('switched off again: no photo', async () => {
    const h = setup()
    adopt(h)
    act(() => h.result.current.setPhotoEnabled(true))
    act(() => h.result.current.setPhotoEnabled(false))
    await act(() => h.result.current.confirm())
    expect(confirmedPhoto()).toBeUndefined()
  })
  it('skipping the chosen Recipe moves the photo to the next one; skipping all of them sends none', async () => {
    api.plan.mockImplementation(async (id: string) => ({ id, plan: twoRecipes }))
    const h = setup()
    adopt(h, twoRecipes)
    act(() => h.result.current.setPhotoEnabled(true))
    act(() => h.result.current.chooseRecipeAction(0, 'skip'))
    expect(h.result.current.photoRecipes).toEqual([{ index: 1, name: 'Bread' }])
    expect(h.result.current.photoChoice).toMatchObject({ enabled: true, recipe: 1 })
    act(() => h.result.current.chooseRecipeAction(1, 'skip'))
    expect(h.result.current.photoRecipes).toEqual([])
    await act(() => h.result.current.confirm())
    expect(confirmedPhoto()).toBeUndefined()
  })
  it('a Confirm that fails with import_not_ready keeps the choice, so the retry still sends the photo', async () => {
    api.confirm.mockRejectedValueOnce(new ApiError(422, 'import_not_ready', 'x', { plan: oneRecipe })).mockResolvedValue(result)
    const h = setup()
    adopt(h)
    act(() => h.result.current.setPhotoEnabled(true))
    await act(() => h.result.current.confirm())
    expect(h.result.current.phase).toBe('reviewing')
    expect(h.result.current.photoChoice.enabled).toBe(true)
    await act(() => h.result.current.confirm())
    expect(api.confirm.mock.calls[1]![2]).toEqual({ index: 0, recipe: 0 })
    expect(h.result.current.phase).toBe('done')
  })
  it('Start over (reset) drops the photos, the choice and the read note, and discards the server review', async () => {
    const h = setup()
    adopt(h)
    act(() => h.result.current.setPhotoEnabled(true))
    await act(() => h.result.current.reset())
    expect(api.discard).toHaveBeenCalledWith('imp1')
    expect(h.result.current).toMatchObject({ phase: 'source', photos: [], readNote: undefined, reviewId: undefined, photoChoice: { enabled: false, photo: 0, recipe: 0 } })
  })
  it('adopting a second read starts a fresh choice (off)', () => {
    const h = setup()
    adopt(h)
    act(() => h.result.current.setPhotoEnabled(true))
    adopt(h)
    expect(h.result.current.photoChoice.enabled).toBe(false)
  })
})
