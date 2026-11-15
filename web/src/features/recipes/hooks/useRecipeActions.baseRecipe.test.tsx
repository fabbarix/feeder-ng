import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

// BR-D and ruling 3 (main session, B9-27): a Base recipe that Recipes call for can't be deleted. The detail says so (`deletable: false`,
// `deleteBlockedBy: "in_use"`), so Delete opens "<Name> can't be deleted" at once: "It is used in N Recipes.", those Recipes as rows,
// Cancel (focused) and Archive, no Close. A 409 base_recipe_in_use that still arrives opens the same dialog.
const confirm = vi.hoisted(() => ({ choose: vi.fn(), confirm: vi.fn() }))
const toast = vi.hoisted(() => ({ show: vi.fn(), hold: vi.fn() }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<typeof import('../../../ui')>()), useConfirm: () => confirm, useToast: () => toast, useUndoToast: () => undoToast }))

import { useRecipeActions } from './useRecipeActions'

const recipe = { setArchived: vi.fn(), remove: vi.fn() }
const onDeleted = vi.fn()
const usedBy = [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka', archived: true }]
const inUse = new ApiError(409, 'base_recipe_in_use', 'in use', { usedBy })
const setup = (meta: { deletable?: boolean; deleteBlockedBy?: 'planned' | 'in_use' } = {}) =>
  renderHook(() => useRecipeActions(recipe, { name: 'Béchamel', archived: false, usedBy, ...meta }, onDeleted))
const WHY = "Béchamel can't be deleted"

beforeEach(() => {
  vi.resetAllMocks()
  confirm.choose.mockResolvedValue('confirm')
  recipe.setArchived.mockResolvedValue(undefined)
  recipe.remove.mockRejectedValue(inUse)
})

describe('useRecipeActions: delete a Base recipe in use (ruling 3)', () => {
  it('says why at once: "It is used in 2 Recipes.", the Recipes as rows, Archive; never asks the danger question', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup({ deletable: false, deleteBlockedBy: 'in_use' })
    await act(() => result.current.remove())
    expect(confirm.choose).not.toHaveBeenCalled()
    expect(recipe.remove).not.toHaveBeenCalled()
    const options = confirm.confirm.mock.calls[0]![0] as Record<string, unknown>
    expect(options).toMatchObject({
      title: WHY,
      body: 'It is used in 2 Recipes.',
      groups: [{ label: 'Used in', rows: [{ key: 'Lasagne' }, { key: 'Moussaka', state: 'Archived' }] }],
      confirmLabel: 'Archive',
    })
    expect(options.alternateLabel).toBeUndefined()
    expect(options.tone ?? 'default').toBe('default')
    expect(options.focus ?? 'cancel').toBe('cancel')
    expect(String(options.body)).not.toMatch(/planned/)
  })
  it('archives on Archive (with the Undo toast), and does not delete or navigate', async () => {
    confirm.confirm.mockResolvedValue(true)
    const { result } = setup({ deletable: false, deleteBlockedBy: 'in_use' })
    await act(() => result.current.remove())
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(undoToast.show).toHaveBeenCalledOnce()
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('a 409 base_recipe_in_use that still arrives opens the same dialog with the Recipes the refusal names', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(confirm.choose).toHaveBeenCalledOnce()
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: WHY, body: 'It is used in 2 Recipes.' }))
  })
  it('does nothing more when Cancel is chosen, and shows no error toast: the dialog said it', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup({ deletable: false, deleteBlockedBy: 'in_use' })
    await act(() => result.current.remove())
    expect(recipe.setArchived).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
  })
  it('an unused Base recipe deletes as any Recipe does', async () => {
    recipe.remove.mockResolvedValue(undefined)
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(confirm.confirm).not.toHaveBeenCalled()
  })
})
