import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

const confirm = vi.hoisted(() => ({ choose: vi.fn(), confirm: vi.fn() }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<typeof import('../../../ui')>()), useConfirm: () => confirm }))

import { useRecipeActions } from './useRecipeActions'

const recipe = { setArchived: vi.fn(), remove: vi.fn() }
const onDeleted = vi.fn()
const setup = (archived = false) => renderHook(() => useRecipeActions(recipe, { name: 'Roast tray', archived }, onDeleted))

beforeEach(() => vi.resetAllMocks())

describe('useRecipeActions', () => {
  it('asks in a danger ConfirmDialog with an Archive instead choice (never window.confirm)', async () => {
    confirm.choose.mockResolvedValue('cancel')
    const { result } = setup()
    await act(() => result.current.remove())
    expect(confirm.choose).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete Roast tray?', tone: 'danger', confirmLabel: 'Delete', alternateLabel: 'Archive instead' }),
    )
  })
  it('deletes on confirm and then reports it', async () => {
    confirm.choose.mockResolvedValue('confirm')
    const { result } = setup()
    await act(() => result.current.remove())
    expect(recipe.remove).toHaveBeenCalledOnce()
    expect(onDeleted).toHaveBeenCalledOnce()
  })
  it('archives instead on the alternate choice and does not delete', async () => {
    confirm.choose.mockResolvedValue('alternate')
    const { result } = setup()
    await act(() => result.current.remove())
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(recipe.remove).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('does nothing on cancel', async () => {
    confirm.choose.mockResolvedValue('cancel')
    const { result } = setup()
    await act(() => result.current.remove())
    expect(recipe.remove).not.toHaveBeenCalled()
    expect(recipe.setArchived).not.toHaveBeenCalled()
  })
  it('says why a planned Recipe cannot be deleted and stays on the screen', async () => {
    confirm.choose.mockResolvedValue('confirm')
    recipe.remove.mockRejectedValue(new ApiError(409, 'already_planned', 'planned', {}))
    const { result } = setup()
    await act(() => result.current.remove())
    expect(result.current.error).toBe('This Recipe was planned, so it can only be archived.')
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('archive toggles: an archived Recipe is unarchived', async () => {
    const { result } = setup(true)
    await act(() => result.current.archive())
    expect(recipe.setArchived).toHaveBeenCalledWith(false)
  })
})
