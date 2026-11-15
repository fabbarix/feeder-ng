// SAFE-05 + RX-04 toasts (R-D+): Archive and Unarchive act at once with an Undo toast; Delete of a Recipe that is not deletable says so BEFORE
// asking, and offers only Archive; any failure is an error toast with Retry. The hook returns { archive, remove } and no `error`: the toasts say it.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

const confirm = vi.hoisted(() => ({ choose: vi.fn(), confirm: vi.fn() }))
const toast = vi.hoisted(() => ({ show: vi.fn(), hold: vi.fn() }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<typeof import('../../../ui')>()), useConfirm: () => confirm, useToast: () => toast, useUndoToast: () => undoToast }))

import { useRecipeActions } from './useRecipeActions'

const recipe = { setArchived: vi.fn(), remove: vi.fn() }
const onDeleted = vi.fn()
const setup = (meta: { archived?: boolean; deletable?: boolean } = {}) => renderHook(() => useRecipeActions(recipe, { name: 'Roast tray', archived: false, ...meta }, onDeleted))
const title = (call: unknown[]) => (typeof call[0] === 'string' ? call[0] : (call[0] as { title: string }).title)
const lastToast = () => toast.show.mock.calls.at(-1)!
const lastToastContent = () => lastToast()[0] as { status?: string; title: string; actions?: { label: string; onClick: () => void }[] }

beforeEach(() => {
  vi.resetAllMocks()
  recipe.setArchived.mockResolvedValue(undefined)
  recipe.remove.mockResolvedValue(undefined)
})

describe('useRecipeActions: Delete of a deletable Recipe (the danger dialog)', () => {
  it('asks in a danger dialog: "Nobody has planned it yet.", the note "Nothing else changes. This can\'t be undone.", and three choices', async () => {
    confirm.choose.mockResolvedValue('cancel')
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(confirm.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Roast tray?',
        body: 'Nobody has planned it yet.',
        note: "Nothing else changes. This can't be undone.",
        tone: 'danger',
        confirmLabel: 'Delete',
        alternateLabel: 'Archive instead',
      }),
    )
  })
  it('a detail that does not say (deletable absent) asks the same', async () => {
    confirm.choose.mockResolvedValue('cancel')
    const { result } = setup()
    await act(() => result.current.remove())
    expect(confirm.choose).toHaveBeenCalledOnce()
  })
  it('deletes on confirm, reports it and says "Roast tray deleted" in a plain success toast with no Undo (the dialog said it can\'t be undone)', async () => {
    confirm.choose.mockResolvedValue('confirm')
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(recipe.remove).toHaveBeenCalledOnce()
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(title(lastToast())).toBe('Roast tray deleted')
    expect(undoToast.show).not.toHaveBeenCalled()
  })
  it('archives instead on the alternate choice and does not delete', async () => {
    confirm.choose.mockResolvedValue('alternate')
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(recipe.remove).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('does nothing on cancel', async () => {
    confirm.choose.mockResolvedValue('cancel')
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(recipe.remove).not.toHaveBeenCalled()
    expect(recipe.setArchived).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
  })
})

describe('useRecipeActions: Delete of a Recipe that is not deletable (SAFE-05)', () => {
  const WHY = "Roast tray can't be deleted"
  it('says why before asking: the title, the lead line, the note, and only Cancel and Archive', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup({ deletable: false })
    await act(() => result.current.remove())
    expect(confirm.choose).not.toHaveBeenCalled()
    expect(confirm.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: WHY,
        body: 'It was planned before, so Feeder keeps it in the history of what was Cooked.',
        note: 'Archive takes it out of the Recipes list, the pickers and the plan. You can unarchive it later.',
        confirmLabel: 'Archive',
      }),
    )
    const options = confirm.confirm.mock.calls[0]![0] as { tone?: string; alternateLabel?: string; focus?: string }
    expect(options.tone ?? 'default').toBe('default')
    expect(options.alternateLabel).toBeUndefined()
    expect(options.focus ?? 'cancel').toBe('cancel')
  })
  it('never calls remove: the promise it makes is the outcome it gives', async () => {
    confirm.confirm.mockResolvedValue(true)
    const { result } = setup({ deletable: false })
    await act(() => result.current.remove())
    expect(recipe.remove).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
  it('Archive archives it (with the Undo toast); Cancel does nothing', async () => {
    confirm.confirm.mockResolvedValueOnce(true)
    const { result } = setup({ deletable: false })
    await act(() => result.current.remove())
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(undoToast.show).toHaveBeenCalledOnce()
    recipe.setArchived.mockClear()
    undoToast.show.mockClear()
    confirm.confirm.mockResolvedValueOnce(false)
    await act(() => result.current.remove())
    expect(recipe.setArchived).not.toHaveBeenCalled()
    expect(undoToast.show).not.toHaveBeenCalled()
  })
  it('the old words are gone: no "can only be archived" error paragraph after the fact', async () => {
    confirm.confirm.mockResolvedValue(false)
    const { result } = setup({ deletable: false })
    await act(() => result.current.remove())
    expect(result.current).not.toHaveProperty('error')
    expect(toast.show).not.toHaveBeenCalled()
  })
  it('a 409 already_planned that still arrives (planned since the page loaded) opens the same dialog, once', async () => {
    confirm.choose.mockResolvedValue('confirm')
    confirm.confirm.mockResolvedValue(false)
    recipe.remove.mockRejectedValue(new ApiError(409, 'already_planned', 'planned', {}))
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: WHY }))
    expect(toast.show).not.toHaveBeenCalled()
  })
})

describe('useRecipeActions: Archive and Unarchive act at once, with an Undo toast', () => {
  it('Archive: no dialog; the toast says "Roast tray archived", its Undo is named "Undo: unarchive Roast tray" and unarchives', async () => {
    const { result } = setup({ archived: false })
    await act(() => result.current.archive())
    expect(confirm.choose).not.toHaveBeenCalled()
    expect(confirm.confirm).not.toHaveBeenCalled()
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
    expect(undoToast.show).toHaveBeenCalledWith(expect.objectContaining({ headline: 'Roast tray archived', undoAriaLabel: 'Undo: unarchive Roast tray' }))
    const input = undoToast.show.mock.calls[0]![0] as { undo: () => Promise<void> }
    recipe.setArchived.mockClear()
    await input.undo()
    expect(recipe.setArchived).toHaveBeenCalledWith(false)
  })
  it('Unarchive: "Roast tray unarchived", Undo archives it again', async () => {
    const { result } = setup({ archived: true })
    await act(() => result.current.archive())
    expect(recipe.setArchived).toHaveBeenCalledWith(false)
    expect(undoToast.show).toHaveBeenCalledWith(expect.objectContaining({ headline: 'Roast tray unarchived', undoAriaLabel: 'Undo: archive Roast tray' }))
    const input = undoToast.show.mock.calls[0]![0] as { undo: () => Promise<void> }
    recipe.setArchived.mockClear()
    await input.undo()
    expect(recipe.setArchived).toHaveBeenCalledWith(true)
  })
  it('shows the toast only after the change is saved', async () => {
    let finish: () => void = () => {}
    recipe.setArchived.mockReturnValue(new Promise<void>((r) => (finish = r)))
    const { result } = setup()
    let done: Promise<void>
    act(() => {
      done = result.current.archive()
    })
    expect(undoToast.show).not.toHaveBeenCalled()
    await act(async () => {
      finish()
      await done
    })
    expect(undoToast.show).toHaveBeenCalledOnce()
  })
})

describe('useRecipeActions: a failure is an error toast with Retry', () => {
  it('a failed Archive says "Couldn\'t archive Roast tray" and Retry tries again', async () => {
    recipe.setArchived.mockRejectedValueOnce(new ApiError(500, 'internal', 'boom', {}))
    const { result } = setup()
    await act(() => result.current.archive())
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(lastToastContent().status).toBe('error')
    expect(lastToastContent().title).toBe("Couldn't archive Roast tray")
    const retry = lastToastContent().actions!.find((a) => a.label === 'Retry')!
    expect(retry).toBeDefined()
    await act(async () => retry.onClick())
    expect(recipe.setArchived).toHaveBeenCalledTimes(2)
    expect(undoToast.show).toHaveBeenCalledOnce()
  })
  it('a failed Unarchive says "Couldn\'t unarchive Roast tray"', async () => {
    recipe.setArchived.mockRejectedValueOnce(new Error('offline'))
    const { result } = setup({ archived: true })
    await act(() => result.current.archive())
    expect(lastToastContent().title).toBe("Couldn't unarchive Roast tray")
  })
  it('a failed Delete says "Couldn\'t delete Roast tray", stays on the screen, and Retry deletes without asking again', async () => {
    confirm.choose.mockResolvedValue('confirm')
    recipe.remove.mockRejectedValueOnce(new Error('offline'))
    const { result } = setup({ deletable: true })
    await act(() => result.current.remove())
    expect(onDeleted).not.toHaveBeenCalled()
    expect(lastToastContent().status).toBe('error')
    expect(lastToastContent().title).toBe("Couldn't delete Roast tray")
    const retry = lastToastContent().actions!.find((a) => a.label === 'Retry')!
    await act(async () => retry.onClick())
    expect(confirm.choose).toHaveBeenCalledOnce()
    expect(recipe.remove).toHaveBeenCalledTimes(2)
    expect(onDeleted).toHaveBeenCalledOnce()
  })
})
