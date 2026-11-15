// B9-41 (SSP-11): ticking an extra from To get is the Shop's tick of an extra (SSP-01's toast), one tap, nothing opens.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extraEntry } from '../../shop/lib/lines'
import { makeExtra } from '../../shop/testData'

const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn() }))
vi.mock('../../shop/hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }))

import { useToGetTick } from './useToGetTick'

const TO = '2026-11-15'
const napkins = extraEntry(makeExtra({ id: 1, text: 'napkins' }), 'metric')
const oil = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 9, name: 'olive oil', baseUnit: 'g', quantity: 500 }), 'metric')
const setup = () => renderHook(() => useToGetTick({ to: TO, shopId: 2, system: 'metric' }))
const toastInput = () => undoToast.show.mock.calls.at(-1)![0] as { headline: string; subline?: string; durationMs?: number; undo: () => Promise<unknown> }

beforeEach(() => {
  actions.tickExtra.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false, added: 0 })
  for (const f of [actions.tick, actions.untick, actions.untickExtra]) f.mockReset().mockResolvedValue(undefined)
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
  toast.show.mockReset()
})

describe('useToGetTick: extras', () => {
  it('a free-text extra is ticked with no amount (tick without adding) for the Shop, with a fresh client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(napkins))
    expect(actions.tickExtra).toHaveBeenCalledExactlyOnceWith(1, 0, 2, expect.stringMatching(/^[0-9a-f-]{36}$/))
    expect(actions.tick).not.toHaveBeenCalled()
  })

  it('an Ingredient extra is ticked with its quantity: one tap adds it to Stock', async () => {
    actions.tickExtra.mockResolvedValue({ ticked: true, lotId: 4, created: true, added: 500 })
    const { result } = setup()
    await act(() => result.current.tick(oil))
    expect(actions.tickExtra).toHaveBeenCalledExactlyOnceWith(2, 500, 2, expect.any(String))
    expect(toastInput()).toMatchObject({ headline: 'Olive oil ticked', subline: '500 g added to Stock', durationMs: 5000 })
  })

  it('the toast is Scan\'s 5 s Undo toast and Undo unticks the extra', async () => {
    const { result } = setup()
    await act(() => result.current.tick(napkins))
    expect(toastInput()).toMatchObject({ headline: 'napkins ticked', durationMs: 5000 })
    await act(() => toastInput().undo())
    expect(actions.untickExtra).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('the row is pending while the request runs, under its own key, and a failure is Scan\'s error toast', async () => {
    let fail!: (e: Error) => void
    actions.tickExtra.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const { result } = setup()
    let pending!: Promise<void>
    act(() => {
      pending = result.current.tick(napkins)
    })
    expect(result.current.pendingKeys.has('extra:1')).toBe(true)
    await act(async () => {
      fail(new Error('offline'))
      await pending
    })
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('napkins'), expect.objectContaining({ status: 'error' }))
    expect(undoToast.show).not.toHaveBeenCalled()
  })
})
