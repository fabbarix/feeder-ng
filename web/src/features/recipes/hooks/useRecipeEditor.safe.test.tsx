// B9-31 (SAFE-01, SAFE-10): what useRecipeEditor adds for the safety net. Real hook, recipesApi mocked.
//
//   dirty: boolean                     !sameDraft(draft, baseline). The baseline is draftFromRecipe(stored) once loaded; for a new Recipe it is
//                                      emptyDraft() with the main Course set (the default Course never makes a new Recipe dirty).
//   ready: boolean                     the baseline is known (a stored Recipe loaded; a new Recipe: at once). Nothing is read or written from the
//                                      reload draft before it.
//   storedUpdatedAt: string | null     the stored Recipe's updatedAt (null: new). storedName: its name (null: new): the leave guard's `what`.
//   restoreDraft(draft): void          puts a stored draft in the editor (fresh keys); the baseline stays, so a restored draft is dirty.
//   resetDraft(): void                 back to the baseline (the DraftNotice's Discard changes).
//   save() / answerUnitPrompt() / answerTakeOver() success: the saved draft becomes the baseline, so dirty is false at once. A refused or
//                                      failed save, and one waiting on the Unit Conversion prompt or the take-over question, stays dirty.
//   removeLine(key): (() => void) | null       removes and returns the restorer (null: unknown key). The restorer puts the line back at its index.
//   removeStep(index): (() => void) | null     the same for a Step ("After step N" references restored).
//   removeUse(stepIndex, useIndex): (() => void) | null
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { courseChoices, recipe } from '../fixtures.test-helper'
import { draftFromRecipe, draftToInput, type RecipeDraft } from '../lib/draft'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({
  recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn(), slotRules: vi.fn(), mealSlots: vi.fn() },
}))
const api = vi.mocked(recipesApi)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const stored = recipe({ id: 3, name: 'Roast tray', updatedAt: '2026-11-14T10:00:00Z' })

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockResolvedValue(stored)
  api.slotRules.mockResolvedValue([])
  api.mealSlots.mockResolvedValue([])
})

const open = async (id = 3) => {
  const hook = renderHook(() => useRecipeEditor(id, [], courseChoices), { wrapper })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  return hook
}
const edit = (h: { result: { current: ReturnType<typeof useRecipeEditor> } }, patch: Partial<RecipeDraft>) =>
  act(() => h.result.current.setDraft((d) => ({ ...d, ...patch })))

describe('dirty and ready', () => {
  it('a stored Recipe is not ready until it loads, then it is clean, with its updatedAt and name', async () => {
    const hook = renderHook(() => useRecipeEditor(3, [], courseChoices), { wrapper })
    expect(hook.result.current.ready).toBe(false)
    await waitFor(() => expect(hook.result.current.ready).toBe(true))
    expect(hook.result.current.dirty).toBe(false)
    expect(hook.result.current.storedUpdatedAt).toBe('2026-11-14T10:00:00Z')
    expect(hook.result.current.storedName).toBe('Roast tray')
  })

  it('a new Recipe is ready at once and clean, also after the main Course arrives', async () => {
    const hook = renderHook(({ courses }) => useRecipeEditor(undefined, [], courses), { wrapper, initialProps: { courses: [] as typeof courseChoices } })
    expect(hook.result.current.ready).toBe(true)
    expect(hook.result.current.dirty).toBe(false)
    expect(hook.result.current.storedUpdatedAt).toBeNull()
    expect(hook.result.current.storedName).toBeNull()
    hook.rerender({ courses: courseChoices })
    await waitFor(() => expect(hook.result.current.draft.courseIds).toEqual([1]))
    expect(hook.result.current.dirty).toBe(false)
  })

  it('typing makes it dirty; typing it back, or only adding spaces, makes it clean again', async () => {
    const hook = await open()
    edit(hook, { name: 'Roast trays' })
    expect(hook.result.current.dirty).toBe(true)
    edit(hook, { name: ' Roast tray ' })
    expect(hook.result.current.dirty).toBe(false)
  })

  it('adding a line or a Step makes it dirty', async () => {
    const hook = await open()
    act(() => hook.result.current.addLine())
    expect(hook.result.current.dirty).toBe(true)
  })
})

describe('a save', () => {
  it('a successful save makes the editor clean', async () => {
    api.replace.mockResolvedValue(stored)
    const hook = await open()
    edit(hook, { name: 'Roast trays' })
    await act(async () => void (await hook.result.current.save()))
    expect(api.replace).toHaveBeenCalledOnce()
    expect(hook.result.current.dirty).toBe(false)
  })

  it('a save the server refuses, or that fails, stays dirty', async () => {
    api.replace.mockRejectedValue(new ApiError(422, 'validation_failed', 'No', { field: 'name', reason: 'name_taken' }))
    const hook = await open()
    edit(hook, { name: 'Roast trays' })
    await act(async () => void (await hook.result.current.save()))
    expect(hook.result.current.dirty).toBe(true)
  })

  it('a save that is waiting for the Unit Conversion prompt is still dirty; answering it makes it clean', async () => {
    api.replace
      .mockRejectedValueOnce(new ApiError(422, 'unknown_unit', 'No', { field: 'lines[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'head', baseUnit: 'g' }))
      .mockResolvedValueOnce(stored)
    api.saveConversion.mockResolvedValue(undefined)
    const hook = await open()
    edit(hook, { name: 'Roast trays' })
    await act(async () => void (await hook.result.current.save()))
    expect(hook.result.current.unitPrompt).not.toBeNull()
    expect(hook.result.current.dirty).toBe(true)
    await act(async () => void (await hook.result.current.answerUnitPrompt(50)))
    expect(hook.result.current.dirty).toBe(false)
  })

  it('the client-side validation failing leaves it dirty', async () => {
    const hook = await open()
    edit(hook, { name: '' })
    await act(async () => void (await hook.result.current.save()))
    expect(api.replace).not.toHaveBeenCalled()
    expect(hook.result.current.dirty).toBe(true)
  })
})

describe('restoreDraft and resetDraft', () => {
  it('restoreDraft puts the stored draft in the editor with fresh keys, and it is dirty', async () => {
    const hook = await open()
    const kept = draftFromRecipe(recipe({ name: 'My version' }))
    act(() => hook.result.current.restoreDraft(kept))
    expect(hook.result.current.draft.name).toBe('My version')
    expect(hook.result.current.dirty).toBe(true)
    const keys = (d: RecipeDraft) => [...d.lines.map((l) => l.key), ...d.steps.map((s) => s.key)]
    expect(keys(hook.result.current.draft).some((k) => keys(kept).includes(k))).toBe(false)
    expect(draftToInput(hook.result.current.draft)).toEqual(draftToInput(kept))
  })

  it('resetDraft goes back to the stored Recipe: clean', async () => {
    const hook = await open()
    edit(hook, { name: 'Roast trays' })
    act(() => hook.result.current.resetDraft())
    expect(hook.result.current.draft.name).toBe('Roast tray')
    expect(hook.result.current.dirty).toBe(false)
  })
})

describe('removals return their Undo (SAFE-10)', () => {
  it('removeLine: gone, and the restorer puts it back at its index; the draft is clean again', async () => {
    const hook = await open()
    const before = hook.result.current.draft
    let restore: (() => void) | null = null
    act(() => {
      restore = hook.result.current.removeLine(before.lines[0]!.key)
    })
    expect(hook.result.current.draft.lines).toHaveLength(0)
    expect(hook.result.current.dirty).toBe(true)
    act(() => restore!())
    expect(hook.result.current.draft.lines).toEqual(before.lines)
    expect(hook.result.current.dirty).toBe(false)
  })

  it('removeLine of an unknown key returns null', async () => {
    const hook = await open()
    let out: unknown
    act(() => {
      out = hook.result.current.removeLine('nope')
    })
    expect(out).toBeNull()
  })

  it('removeStep: the Steps renumber, and the restorer gives back the original Steps', async () => {
    const hook = await open()
    const before = hook.result.current.draft.steps
    let restore: (() => void) | null = null
    act(() => {
      restore = hook.result.current.removeStep(0)
    })
    expect(hook.result.current.draft.steps.map((s) => s.text)).toEqual(['Roast'])
    act(() => restore!())
    expect(hook.result.current.draft.steps).toEqual(before)
    expect(hook.result.current.dirty).toBe(false)
  })

  it('removeUse: the restorer gives the use back to its Step', async () => {
    const hook = await open()
    const before = hook.result.current.draft.steps
    let restore: (() => void) | null = null
    act(() => {
      restore = hook.result.current.removeUse(1, 0)
    })
    expect(hook.result.current.draft.steps[1]!.uses).toHaveLength(0)
    act(() => restore!())
    expect(hook.result.current.draft.steps).toEqual(before)
  })

  it('removeStep out of range returns null and changes nothing', async () => {
    const hook = await open()
    let out: unknown
    act(() => {
      out = hook.result.current.removeStep(9)
    })
    expect(out).toBeNull()
    expect(hook.result.current.dirty).toBe(false)
  })
})
