import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

// BR-D: deleting a Base recipe that Recipes call for is refused (409 base_recipe_in_use); the dialog names them and offers Archive instead.
const confirm = vi.hoisted(() => ({ choose: vi.fn(), confirm: vi.fn() }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<typeof import('../../../ui')>()), useConfirm: () => confirm }))

import { useRecipeActions } from './useRecipeActions'

const recipe = { setArchived: vi.fn(), remove: vi.fn() }
const onDeleted = vi.fn()
const inUse = new ApiError(409, 'base_recipe_in_use', 'in use', { usedBy: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }] })
const setup = () => renderHook(() => useRecipeActions(recipe, { name: 'Béchamel', archived: false }, onDeleted))

beforeEach(() => {
  vi.resetAllMocks()
  confirm.choose.mockResolvedValue('confirm')
  recipe.remove.mockRejectedValue(inUse)
})

describe('useRecipeActions: delete a Base recipe in use', () => {
  it('names who uses it and offers Archive instead', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup()
    await act(() => result.current.remove())
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Béchamel is in use',
      body: 'Béchamel is used in Lasagne and Moussaka',
      confirmLabel: 'Archive instead',
    }))
  })
  it('archives on the offer, and does not delete or navigate', async () => {
    confirm.confirm.mockResolvedValue(true)
    const { result } = setup()
    await act(() => result.current.remove())
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('does nothing more when the offer is declined', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup()
    await act(() => result.current.remove())
    expect(recipe.setArchived).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('does not show the generic error text: the dialog said it', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup()
    await act(() => result.current.remove())
    expect(result.current.error).toBeNull()
  })
  it('an unused Base recipe deletes as any Recipe does', async () => {
    recipe.remove.mockResolvedValue(undefined)
    const { result } = setup()
    await act(() => result.current.remove())
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(confirm.confirm).not.toHaveBeenCalled()
  })
})
