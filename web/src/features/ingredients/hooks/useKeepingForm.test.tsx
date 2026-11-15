// B9-48 (SET-05): useKeepingForm, the one draft behind the "Keeping" tile.
//
// API pinned here (hooks/useKeepingForm.ts):
//   useKeepingForm(saved: Ingredient, save: (patch: IngredientPatch) => Promise<unknown>): UseKeepingForm
//   UseKeepingForm = {
//     draft: KeepingDraft                      lib/keeping; starts as keepingDraft(saved)
//     dirty: boolean                           isKeepingDirty(saved, draft)
//     errors: KeepingErrors                    from the last submit; each key clears when its field changes
//     failure: string | null                   a server refusal worded by lib/errorMessage (no field of its own): the form's <FormError>
//     saving: boolean
//     submitCount: number                      grows by one on every submit() that finds errors or runs (useFocusFirstInvalid's trigger)
//     setBaseUnit(u) / setShelfLife(days|null) / setFrozenShelfLife(days|null) / setRestockText(text)
//     submit(): Promise<boolean>               invalid: errors set, nothing sent, false. Valid and dirty: ONE save(keepingPatch(...)), true.
//                                              Clean: nothing sent, true. A refusal: failure set, draft kept, false.
//     cancel(): void                           the draft goes back to what is saved, errors and failure cleared
//   }
//   When the saved Ingredient changes while the form is clean, the draft follows it; while dirty the person's edits are kept.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { Ingredient } from '../types'
import { useKeepingForm } from './useKeepingForm'

const setup = (saved: Ingredient = garlicJSON, save = vi.fn().mockResolvedValue({})) => {
  const hook = renderHook(({ s }: { s: Ingredient }) => useKeepingForm(s, save), { initialProps: { s: saved } })
  return { ...hook, save }
}

describe('useKeepingForm: the draft', () => {
  it('starts clean, as saved', () => {
    const { result } = setup()
    expect(result.current.dirty).toBe(false)
    expect(result.current.draft).toMatchObject({ baseUnit: 'g', shelfLifeDays: 30, frozenShelfLifeDays: null, restockText: '' })
  })
  it('is dirty after one change, clean again after cancel', () => {
    const { result } = setup()
    act(() => result.current.setShelfLife(10))
    expect(result.current.dirty).toBe(true)
    act(() => result.current.cancel())
    expect(result.current.dirty).toBe(false)
    expect(result.current.draft.shelfLifeDays).toBe(30)
  })
  it('follows the saved Ingredient while clean, keeps the edits while dirty', () => {
    const { result, rerender } = setup()
    rerender({ s: { ...garlicJSON, shelfLifeDays: 20 } })
    expect(result.current.draft.shelfLifeDays).toBe(20)
    act(() => result.current.setFrozenShelfLife(90))
    rerender({ s: { ...garlicJSON, shelfLifeDays: 25 } })
    expect(result.current.draft.frozenShelfLifeDays).toBe(90)
  })
})

describe('useKeepingForm.submit', () => {
  it('sends ONE save with both Shelf Lives and is clean afterwards', async () => {
    const { result, save } = setup()
    act(() => {
      result.current.setShelfLife(10)
      result.current.setFrozenShelfLife(90)
    })
    let ok = false
    await act(async () => {
      ok = await result.current.submit()
    })
    expect(ok).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ shelfLifeDays: 10, frozenShelfLifeDays: 90 })
    expect(result.current.dirty).toBe(false)
  })
  it('a clean form sends nothing', async () => {
    const { result, save } = setup()
    await act(async () => {
      expect(await result.current.submit()).toBe(true)
    })
    expect(save).not.toHaveBeenCalled()
  })
  it('an invalid draft sends nothing, names the field, and counts the submit for the focus hook', async () => {
    const { result, save } = setup()
    const before = result.current.submitCount
    act(() => result.current.setShelfLife(0))
    await act(async () => {
      expect(await result.current.submit()).toBe(false)
    })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.errors.shelfLife).toBe('Enter a whole number of days, 1 to 3650')
    expect(result.current.submitCount).toBe(before + 1)
  })
  it('an error clears as its field is fixed', async () => {
    const { result } = setup(dishSoapJSON)
    act(() => result.current.setRestockText('abc'))
    await act(async () => void (await result.current.submit()))
    expect(result.current.errors.restock).toBe('Enter an amount greater than 0')
    act(() => result.current.setRestockText('5'))
    expect(result.current.errors.restock).toBeUndefined()
  })
  it('a Supply saves its Restock level in Base Units', async () => {
    const { result, save } = setup(dishSoapJSON)
    act(() => result.current.setRestockText('750'))
    await act(async () => void (await result.current.submit()))
    expect(save).toHaveBeenCalledWith({ restockLevel: 750 })
  })
  it('a refusal is the form failure, in words; the draft stays for another try', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(422, 'validation_failed', 'x', { reason: 'supply_has_shelf_life' }))
    const { result } = setup(garlicJSON, save)
    act(() => result.current.setShelfLife(10))
    await act(async () => {
      expect(await result.current.submit()).toBe(false)
    })
    expect(result.current.failure).toBe('A Supply has no Shelf Life')
    expect(result.current.dirty).toBe(true)
    expect(result.current.saving).toBe(false)
  })
  it('the failure clears on the next edit', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'boom'))
    const { result } = setup(garlicJSON, save)
    act(() => result.current.setShelfLife(10))
    await act(async () => void (await result.current.submit()))
    expect(result.current.failure).not.toBeNull()
    act(() => result.current.setShelfLife(11))
    expect(result.current.failure).toBeNull()
  })
})
