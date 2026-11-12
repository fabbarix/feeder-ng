// CRS E2: Courses, Whole meal and the Slot Rules a save takes away, in the editor hook (docs/dev/design/crs-e2.md 3.1).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { courseChoices, recipe } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import type { Recipe } from '../types'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({
  recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn(), slotRules: vi.fn(), mealSlots: vi.fn() },
}))
const api = vi.mocked(recipesApi)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over,
})
const saved = { id: 11, name: 'Aioli' } as Recipe
type Hook = { current: ReturnType<typeof useRecipeEditor> }
const fill = (result: Hook, over = {}) =>
  act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line()], ...over })))

beforeEach(() => {
  vi.resetAllMocks()
  api.slotRules.mockResolvedValue([])
  api.mealSlots.mockResolvedValue([])
})

describe('useRecipeEditor: a new Recipe and its Courses', () => {
  it('starts with the main Course once the Courses are known', async () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
  })
  it('picks the main Course when the Courses arrive after the first render', async () => {
    const { result, rerender } = renderHook(({ list }) => useRecipeEditor(undefined, [], list), { wrapper, initialProps: { list: [] as typeof courseChoices } })
    expect(result.current.draft.courseIds).toEqual([])
    rerender({ list: courseChoices })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
  })
  it('does not overwrite a choice the User made', async () => {
    const { result, rerender } = renderHook(({ list }) => useRecipeEditor(undefined, [], list), { wrapper, initialProps: { list: courseChoices } })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [2] })))
    rerender({ list: [...courseChoices] })
    expect(result.current.draft.courseIds).toEqual([2])
  })
  it('sends the Courses and false for Whole meal', async () => {
    api.create.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    fill(result)
    await act(async () => {
      await result.current.save()
    })
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ courseIds: [1], wholeMeal: false }))
  })
  it('does not ask the Slot Rules of a Recipe that is not stored yet', async () => {
    renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.slotRules).not.toHaveBeenCalled()
  })
})

describe('useRecipeEditor: Whole meal', () => {
  it('ticking Ready Meal switches Whole meal on for a Recipe in the main Course, and the User can switch it off', async () => {
    api.create.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Lasagne pack', yield: '2', readyMeal: true })))
    expect(result.current.draft).toMatchObject({ wholeMeal: true, wholeMealSet: false })
    act(() => result.current.setDraft((d) => ({ ...d, wholeMeal: false })))
    expect(result.current.draft).toMatchObject({ wholeMeal: false, wholeMealSet: true })
    await act(async () => {
      await result.current.save()
    })
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ readyMeal: true, wholeMeal: false }))
  })
  it('a stored Whole meal survives taking the main Course off and putting it back', async () => {
    api.get.mockResolvedValue(recipe({ id: 11, courses: [{ id: 1, name: 'Main' }], wholeMeal: true }))
    api.replace.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(11, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [2] })))
    expect(result.current.draft.wholeMeal).toBe(true)
    await act(async () => {
      await result.current.save()
    })
    expect(api.replace).toHaveBeenCalledWith(11, expect.objectContaining({ courseIds: [2], wholeMeal: true }))
  })
})

describe('useRecipeEditor: checking the Courses', () => {
  it('refuses an empty choice, once the Courses are known, with the courses_empty code on the field', async () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    fill(result, { courseIds: [] })
    let out: unknown = 'unset'
    await act(async () => {
      out = await result.current.save()
    })
    expect(out).toBeNull()
    expect(result.current.errors).toEqual({ courses: 'courses_empty' })
    expect(api.create).not.toHaveBeenCalled()
  })
  it('leaves the check to the server while no Courses are known', async () => {
    api.create.mockRejectedValue(new ApiError(422, 'validation_failed', 'bad', { field: 'courses', reason: 'courses_empty' }))
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fill(result)
    await act(async () => {
      await result.current.save()
    })
    expect(api.create).toHaveBeenCalled()
    expect(result.current.errors).toEqual({ courses: 'courses_empty' })
  })
  it('shows a course_unknown answer of the server on the Courses field', async () => {
    api.create.mockRejectedValue(new ApiError(422, 'validation_failed', 'bad', { field: 'courses', reason: 'course_unknown' }))
    const { result } = renderHook(() => useRecipeEditor(undefined, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1]))
    fill(result)
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.errors).toEqual({ courses: 'course_unknown' })
  })
})

describe('useRecipeEditor: courseLoss', () => {
  const stored = recipe({ id: 11, name: 'Rice', courses: [{ id: 1, name: 'Main' }, { id: 2, name: 'Side' }] })
  const rules = [
    { id: 10, mealSlotId: 5, courseId: 2, recipeId: 11, recipeName: 'Rice' },
    { id: 11, mealSlotId: 5, courseId: 2, recipeId: 99, recipeName: 'Pasta' },
    { id: 12, mealSlotId: 5, courseId: 2, tag: 'fish' },
  ]
  beforeEach(() => {
    api.get.mockResolvedValue(stored)
    api.slotRules.mockResolvedValue(rules)
    api.mealSlots.mockResolvedValue([{ id: 5, name: 'Friday Dinner' }])
  })

  it('is null while the draft keeps every Course', async () => {
    const { result } = renderHook(() => useRecipeEditor(11, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1, 2]))
    await waitFor(() => expect(api.slotRules).toHaveBeenCalled())
    expect(result.current.courseLoss).toBeNull()
  })
  it('names the Slot Rules by this Recipe on a Course the draft takes off', async () => {
    const { result } = renderHook(() => useRecipeEditor(11, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1, 2]))
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [1] })))
    await waitFor(() =>
      expect(result.current.courseLoss).toEqual({ courseNames: ['Side'], rules: [{ id: 10, label: 'Friday Dinner · Side = Rice' }] }),
    )
  })
  it('goes away again when the Course is put back', async () => {
    const { result } = renderHook(() => useRecipeEditor(11, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1, 2]))
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [1] })))
    await waitFor(() => expect(result.current.courseLoss).not.toBeNull())
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [1, 2] })))
    expect(result.current.courseLoss).toBeNull()
  })
  it('is null when the Slot Rules cannot be read (the server still decides)', async () => {
    api.slotRules.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useRecipeEditor(11, [], courseChoices), { wrapper })
    await waitFor(() => expect(result.current.draft.courseIds).toEqual([1, 2]))
    act(() => result.current.setDraft((d) => ({ ...d, courseIds: [1] })))
    await waitFor(() => expect(api.slotRules).toHaveBeenCalled())
    expect(result.current.courseLoss).toBeNull()
  })
})
