// B9-43 (SSP-14, decision SSP 6 / D6-A): useSubstitute({ to, shopId }): "Get something else…".
//   start(entry)   sets `target` (the Add to Shopping List sheet is open while it is set); cancel() clears it.
//   submit(input, addedName)
//                  1. actions.addExtra(input)   (resolves with the new extra)
//                  2. actions.notNeeded({ ingredientId: the Line's, to, shopId })
//                  3. closes (target null) and shows ONE toast, through useUndoToast: headline "Onion is Not needed; Shallot added",
//                     whose Undo puts the Line back (neededAfterAll) AND deletes the new extra: it reverts both.
//                  A failure of 1 rejects (nothing is Not needed, no toast, the sheet stays); a failure of 2 deletes the extra again, rejects, no toast.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { lineEntry } from '../lib/lines'
import { makeOnion } from '../testData'

const actions = vi.hoisted(() => ({ addExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn(), deleteExtra: vi.fn() }))
vi.mock('./useShoppingActions', () => ({ useShoppingActions: () => actions }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))

import { useSubstitute } from './useSubstitute'

const TO = '2026-11-15'
const onion = lineEntry(makeOnion(), 'USD', 'metric')
const shallot = { ingredientId: 6, quantity: 12 }
const setup = () => renderHook(() => useSubstitute({ to: TO, shopId: 1 }))
const shown = () => undoToast.show.mock.calls.at(-1)![0] as { headline: string; undo: () => Promise<unknown> }

beforeEach(() => {
  actions.addExtra.mockReset().mockResolvedValue({ id: 31, text: null, ingredientId: 6 })
  actions.notNeeded.mockReset().mockResolvedValue(undefined)
  actions.neededAfterAll.mockReset().mockResolvedValue(undefined)
  actions.deleteExtra.mockReset().mockResolvedValue(undefined)
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
})

describe('useSubstitute', () => {
  it('start sets the target (the sheet opens), cancel clears it', () => {
    const { result } = setup()
    expect(result.current.target).toBeNull()
    act(() => result.current.start(onion))
    expect(result.current.target).toBe(onion)
    act(() => result.current.cancel())
    expect(result.current.target).toBeNull()
  })

  it('submit adds the extra, then marks the Line Not needed for the range and Shop, then one toast', async () => {
    const { result } = setup()
    act(() => result.current.start(onion))
    await act(() => result.current.submit(shallot, 'Shallot'))
    expect(actions.addExtra).toHaveBeenCalledExactlyOnceWith(shallot)
    expect(actions.notNeeded).toHaveBeenCalledExactlyOnceWith({ ingredientId: 5, to: TO, shopId: 1 })
    expect(actions.addExtra.mock.invocationCallOrder[0]).toBeLessThan(actions.notNeeded.mock.invocationCallOrder[0]!)
    expect(undoToast.show).toHaveBeenCalledTimes(1)
    expect(shown().headline).toBe('Onion is Not needed; Shallot added')
    expect(result.current.target).toBeNull()
  })

  it('a free-text extra works too: its text is the name', async () => {
    const { result } = setup()
    act(() => result.current.start(onion))
    await act(() => result.current.submit({ text: 'shallots from the market' }, 'shallots from the market'))
    expect(shown().headline).toBe('Onion is Not needed; shallots from the market added')
  })

  it('Undo reverts both: the Line is back on the list and the extra is deleted', async () => {
    const { result } = setup()
    act(() => result.current.start(onion))
    await act(() => result.current.submit(shallot, 'Shallot'))
    await act(async () => {
      await shown().undo()
    })
    expect(actions.neededAfterAll).toHaveBeenCalledExactlyOnceWith(5, TO, 1)
    expect(actions.deleteExtra).toHaveBeenCalledExactlyOnceWith(31)
  })

  it('when adding the extra fails: it rejects, the Line is not touched, no toast, and the sheet stays for another try', async () => {
    actions.addExtra.mockRejectedValue(new ApiError(422, 'validation_failed', 'bad'))
    const { result } = setup()
    act(() => result.current.start(onion))
    await expect(act(() => result.current.submit(shallot, 'Shallot'))).rejects.toMatchObject({ code: 'validation_failed' })
    expect(actions.notNeeded).not.toHaveBeenCalled()
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(result.current.target).toBe(onion)
  })

  it('when marking the Line fails after the extra was added: the extra is deleted again, it rejects, no toast (all or nothing)', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    const { result } = setup()
    act(() => result.current.start(onion))
    await expect(act(() => result.current.submit(shallot, 'Shallot'))).rejects.toMatchObject({ code: 'internal' })
    expect(actions.deleteExtra).toHaveBeenCalledExactlyOnceWith(31)
    expect(undoToast.show).not.toHaveBeenCalled()
  })

  it('does nothing without a target, or before the list has loaded (no range end)', async () => {
    const idle = setup()
    await act(() => idle.result.current.submit(shallot, 'Shallot'))
    expect(actions.addExtra).not.toHaveBeenCalled()
    const early = renderHook(() => useSubstitute({ to: undefined, shopId: 1 }))
    act(() => early.result.current.start(onion))
    await act(() => early.result.current.submit(shallot, 'Shallot'))
    expect(actions.addExtra).not.toHaveBeenCalled()
  })
})
