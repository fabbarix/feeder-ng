// B9-34 (SSP-01): Scan's To get row is the tick (beta.8), and it is the SAME tick as the Shop's: the same default amount (the pack, else
// what is to get), the same toast with Undo and Change ("Passata ticked", "1.4 kg added to Stock"), the same Change sheet (mounted by the
// screen from `flow`). Scan keeps its own 5 s toast (the Shop's is 8 s), and its own failure toast. A row in flight is pending.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { lineEntry } from '../../shop/lib/lines'
import { makeGarlic, makeLine } from '../../shop/testData'

const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn() }))
vi.mock('../../shop/hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }))

import { useToGetTick } from './useToGetTick'

const passata = lineEntry(makeLine(), 'USD', 'metric')
const garlic = lineEntry(makeGarlic(), 'USD', 'metric')
const TO = '2026-11-15'
const setup = (over: { to?: string | undefined; shopId?: number | null } = {}) => renderHook(() => useToGetTick({ to: TO, shopId: 2, system: 'metric', ...over }))
const toastInput = () => undoToast.show.mock.calls.at(-1)![0] as { headline: string; subline?: string; durationMs?: number; actions?: { label: string; onClick: () => void }[]; undo: () => Promise<unknown> }

beforeEach(() => {
  actions.tick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 1400 })
  for (const f of [actions.untick, actions.untickExtra, actions.changeTick, actions.changeExtraTick, actions.tickExtra]) f.mockReset().mockResolvedValue(undefined)
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
  toast.show.mockReset()
})

describe('useToGetTick', () => {
  it('ticks the Line with the Shop\'s default amount (the pack: 2 × 700 g), for the Shop and the range, with a fresh client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    expect(actions.tick).toHaveBeenCalledWith({ ingredientId: 2, to: TO, quantity: 1400, shopId: 2, clientUuid: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    await act(() => result.current.tick(garlic))
    expect(actions.tick.mock.calls[1]?.[0]).toMatchObject({ ingredientId: 9, quantity: 500 })
    expect(actions.tick.mock.calls[0]?.[0].clientUuid).not.toBe(actions.tick.mock.calls[1]?.[0].clientUuid)
  })

  it('answers with the Shop\'s toast (headline, what was added, Change) lasting 5 s, not the Shop\'s 8 s', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    expect(toastInput()).toMatchObject({ headline: 'Passata ticked', subline: '1.4 kg added to Stock', durationMs: 5000 })
    expect(toastInput().actions?.map((a) => a.label)).toEqual(['Change'])
  })

  it('Undo unticks the Line for the same range', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    await act(() => toastInput().undo())
    expect(actions.untick).toHaveBeenCalledExactlyOnceWith(2, TO)
  })

  it('Change opens the same sheet: the flow\'s `changing` is the tick just made, and change() PATCHes it', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    const sent = actions.tick.mock.calls[0]![0]
    act(() => toastInput().actions![0]!.onClick())
    expect(result.current.flow!.changing).toMatchObject({ added: 1400, clientUuid: sent.clientUuid })
    await act(() => result.current.flow!.change(700))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 2, to: TO, quantity: 700, shopId: 2, clientUuid: sent.clientUuid })
  })

  it('the Line is pending while the request runs, and a second tap of it is ignored', async () => {
    let finish!: () => void
    actions.tick.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ticked: true, lotId: null, created: false, added: 0 }))))
    const { result } = setup()
    let first!: Promise<void>
    act(() => {
      first = result.current.tick(passata)
    })
    expect(result.current.pendingKeys.has('line:2')).toBe(true)
    await act(() => result.current.tick(passata))
    expect(actions.tick).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await first
    })
    expect(result.current.pendingKeys.size).toBe(0)
  })

  it('offline (or any failure): Scan\'s own error toast, no Undo toast, and the Line is free to tick again', async () => {
    // B9-54 (RES-03): a send that cannot reach the server (status 0 or 5xx) now queues the Tick (shop/hooks/useTickFlow.offline.test);
    // a refusal with an answer is still a failure
    actions.tick.mockRejectedValueOnce(new ApiError(422, 'validation_failed', 'no'))
    const { result } = setup()
    await act(() => result.current.tick(passata))
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(toast.show).toHaveBeenCalledExactlyOnceWith("Couldn't tick Passata. Try again.", { status: 'error' })
    expect(result.current.pendingKeys.size).toBe(0)
    await act(() => result.current.tick(passata))
    expect(toastInput().headline).toBe('Passata ticked')
  })

  it('does nothing before the Shopping List is in (no range yet) or for an entry without an Ingredient', async () => {
    const early = setup({ to: undefined })
    await act(() => early.result.current.tick(passata))
    const free = setup()
    await act(() => free.result.current.tick({ ...passata, ingredientId: null }))
    expect(actions.tick).not.toHaveBeenCalled()
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
  })

  it('no Shop picked ticks for any Shop (null)', async () => {
    const { result } = setup({ shopId: null })
    await act(() => result.current.tick(passata))
    expect(actions.tick).toHaveBeenCalledWith(expect.objectContaining({ shopId: null }))
  })
})
