// B9-34 (SSP-01, SSP 2, SSP-18, RES-03): useTickFlow, the one-tap tick. Pinned here:
//   useTickFlow({ to, shopId, system, durationMs? }): { tick, pendingKeys, changing, openChange, closeChange, change, takeBack }
//   tick(entry)       one request (lib/tickAmount planTick: the default amount, the caller-made client id), then ONE Undo toast through
//                     useUndoToast: headline "<title> ticked", subline "<added> added to Stock" (the server's `added`; none when 0),
//                     actions [Change] (only when Stock was added), Undo. Duration: the Undo default (8 s); `durationMs` overrides (Scan: 5 s).
//                     A failure rejects (the screen's run() shows the failure toast), shows no toast and clears pending.
//   Undo              of a first tick: untick (ADR 0019); of a "more since your tick" tick: change that addition (by client id) to 0.
//   Change (toast)    opens the Change sheet's subject: { entry, added, tickedAt, clientUuid } of the tick just made.
//   change(q)         PATCH the subject's addition to q (0 = "Tick without adding"), closes the sheet, no toast.
//   takeBack(entry, addition)   PATCH that addition to 0 and a toast "Your 500 g of Garlic was taken back from Stock" ("Sam's 50 g of …"
//                     for another's) whose Undo PATCHes the old quantity back.
// B9-54: the queue replaces the one call `actions.tick/tickExtra` makes from a `TickPlan`; nothing else here changes.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { formatQuantity } from '../../../lib/units'
import { extraEntry, lineEntry, listEntries } from '../lib/lines'
import { makeAddition, makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'

const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn() }))
vi.mock('./useShoppingActions', () => ({ useShoppingActions: () => actions }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))

import { useTickFlow } from './useTickFlow'

const TO = '2026-11-15'
const UUID = /^[0-9a-f-]{36}$/
const garlic = lineEntry(makeGarlic(), 'USD', 'metric')
const passata = lineEntry(makeLine(), 'USD', 'metric')
const napkins = extraEntry(makeExtra({ text: 'napkins' }), 'metric')
const milk = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 }), 'metric')
const more = listEntries(makeList({ lines: [makeGarlic({ ticked: true, more: 750, quantity: 750, pack: null, tick: makeTick() })] }), 'metric').open[0]!

const setup = (over: Partial<Parameters<typeof useTickFlow>[0]> = {}) => renderHook(() => useTickFlow({ to: TO, shopId: 1, system: 'metric', ...over }))
const shown = () => undoToast.show.mock.calls.at(-1)![0] as {
  headline: string
  subline?: string
  actions?: { label: string; onClick: (c?: unknown) => void }[]
  undo: (ctx?: { focusWasInToast: boolean }) => Promise<unknown>
  durationMs?: number
}

beforeEach(() => {
  actions.tick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 500 })
  actions.tickExtra.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false, added: 0 })
  for (const f of [actions.untick, actions.untickExtra]) f.mockReset().mockResolvedValue(undefined)
  actions.changeTick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, quantity: 0 })
  actions.changeExtraTick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, quantity: 0 })
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
})

describe('useTickFlow: one tap', () => {
  it('ticks a Line with its default amount, the Shop, the range and a fresh client id (no sheet in between)', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    expect(actions.tick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 500, shopId: 1, clientUuid: expect.stringMatching(UUID) })
    expect(result.current.changing).toBeNull()
  })

  it('every tap has its own client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    await act(() => result.current.tick(passata))
    expect(actions.tick.mock.calls[0]![0].clientUuid).not.toBe(actions.tick.mock.calls[1]![0].clientUuid)
    expect(actions.tick.mock.calls[1]![0]).toMatchObject({ ingredientId: 2, quantity: 1400 })
  })

  it('an Ingredient extra ticks with its quantity, free text with none, through the extras API', async () => {
    const { result } = setup()
    await act(() => result.current.tick(milk))
    expect(actions.tickExtra).toHaveBeenLastCalledWith(2, 2000, 1, expect.stringMatching(UUID))
    await act(() => result.current.tick(napkins))
    expect(actions.tickExtra).toHaveBeenLastCalledWith(1, 0, 1, expect.stringMatching(UUID))
  })

  it('does nothing until the list has loaded (no range end)', async () => {
    const { result } = setup({ to: undefined })
    await act(() => result.current.tick(garlic))
    expect(actions.tick).not.toHaveBeenCalled()
    expect(undoToast.show).not.toHaveBeenCalled()
  })
})

describe('useTickFlow: the toast (SSP 2)', () => {
  it('"Garlic ticked", "500 g added to Stock", Change then Undo, no override of the Undo duration (8 s)', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    expect(undoToast.show).toHaveBeenCalledOnce()
    const toast = shown()
    expect(toast.headline).toBe('Garlic ticked')
    expect(toast.subline).toBe('500 g added to Stock')
    expect(toast.actions?.map((a) => a.label)).toEqual(['Change'])
    expect(toast.durationMs).toBeUndefined()
  })

  it('says what the server added, not what was sent, in the display system', async () => {
    actions.tick.mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 480 })
    const { result } = setup({ system: 'imperial' })
    await act(() => result.current.tick(garlic))
    expect(shown().subline).toBe(`${formatQuantity(480, 'g', 'imperial')} added to Stock`)
  })

  it('an Ingredient extra: "Milk ticked", "2 l added to Stock"', async () => {
    actions.tickExtra.mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 2000 })
    const { result } = setup()
    await act(() => result.current.tick(milk))
    expect(shown()).toMatchObject({ headline: 'Milk ticked', subline: `${formatQuantity(2000, 'ml', 'metric')} added to Stock` })
  })

  it('free text added nothing: one line "napkins ticked", only Undo (no Change, no subline)', async () => {
    const { result } = setup()
    await act(() => result.current.tick(napkins))
    const toast = shown()
    expect(toast.headline).toBe('napkins ticked')
    expect(toast.subline).toBeUndefined()
    expect(toast.actions ?? []).toEqual([])
  })

  it('Scan passes its own duration (5 s): `durationMs` is handed to the toast', async () => {
    const { result } = setup({ durationMs: 5000 })
    await act(() => result.current.tick(garlic))
    expect(shown().durationMs).toBe(5000)
  })
})

describe('useTickFlow: Undo', () => {
  it('Undo of a first tick unticks the Line for the same range (ADR 0019: it takes the Stock back)', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    await act(() => shown().undo({ focusWasInToast: false }))
    expect(actions.untick).toHaveBeenCalledExactlyOnceWith(9, TO)
  })

  it('Undo of an extra\'s tick unticks the extra', async () => {
    const { result } = setup()
    await act(() => result.current.tick(napkins))
    await act(() => shown().undo({ focusWasInToast: false }))
    expect(actions.untickExtra).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('Undo of a "more since your tick" tick takes back only that addition (by its client id): the Line stays ticked', async () => {
    const { result } = setup()
    await act(() => result.current.tick(more))
    const sent = actions.tick.mock.calls[0]![0]
    expect(sent).toMatchObject({ ingredientId: 9, quantity: 750 })
    await act(() => shown().undo({ focusWasInToast: false }))
    expect(actions.untick).not.toHaveBeenCalled()
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 0, shopId: 1, clientUuid: sent.clientUuid })
  })

  it('a refused Undo rejects, so the Undo toast shows "Nothing was undone" with the reason', async () => {
    actions.untick.mockRejectedValue(new ApiError(409, 'not_undoable', 'x'))
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    await expect(shown().undo({ focusWasInToast: false })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('useTickFlow: busy and failure', () => {
  it('a second tap on the same entry while the first is in flight sends nothing; pendingKeys names it until it settles', async () => {
    let finish!: (v: unknown) => void
    actions.tick.mockReturnValue(new Promise((r) => (finish = r)))
    const { result } = setup()
    let first!: Promise<void>
    act(() => {
      first = result.current.tick(garlic)
    })
    await waitFor(() => expect(result.current.pendingKeys.has('line:9')).toBe(true))
    await act(() => result.current.tick(garlic))
    expect(actions.tick).toHaveBeenCalledOnce()
    await act(async () => {
      finish({ ticked: true, lotId: 5, created: true, added: 500 })
      await first
    })
    expect(result.current.pendingKeys.size).toBe(0)
  })

  it('a failed tick rejects with the ApiError (the screen\'s failure toast), shows no Undo toast and clears pending', async () => {
    actions.tick.mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const { result } = setup()
    await expect(act(() => result.current.tick(garlic))).rejects.toBeInstanceOf(ApiError)
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(result.current.pendingKeys.size).toBe(0)
  })
})

describe('useTickFlow: Change', () => {
  it('the toast\'s Change opens the sheet for the tick just made: the entry, what was added, when, and its client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    const sent = actions.tick.mock.calls[0]![0]
    act(() => shown().actions![0]!.onClick())
    expect(result.current.changing).toEqual({ entry: garlic, added: 500, tickedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), clientUuid: sent.clientUuid })
  })

  it('Save sends the new amount for that addition, closes the sheet and shows no toast', async () => {
    const { result } = setup()
    await act(() => result.current.tick(garlic))
    const sent = actions.tick.mock.calls[0]![0]
    undoToast.show.mockClear()
    act(() => result.current.openChange({ entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: sent.clientUuid }))
    await act(() => result.current.change(300))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 300, shopId: 1, clientUuid: sent.clientUuid })
    expect(result.current.changing).toBeNull()
    expect(undoToast.show).not.toHaveBeenCalled()
  })

  it('"Tick without adding" is change(0): the same PATCH with 0 (the tick stays)', async () => {
    const { result } = setup()
    act(() => result.current.openChange({ entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: 'u-1' }))
    await act(() => result.current.change(0))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 0, shopId: 1, clientUuid: 'u-1' })
  })

  it('an extra\'s Change goes through the extras API', async () => {
    const { result } = setup()
    act(() => result.current.openChange({ entry: milk, added: 2000, tickedAt: '2026-11-14T10:12:00Z', clientUuid: null }))
    await act(() => result.current.change(1000))
    expect(actions.changeExtraTick).toHaveBeenCalledExactlyOnceWith(2, 1000)
  })

  it('a failed Change rejects (the screen shows the failure) and leaves the sheet\'s subject for a retry', async () => {
    actions.changeTick.mockRejectedValue(new ApiError(409, 'not_by_hand', 'x'))
    const { result } = setup()
    const target = { entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: 'u-1' }
    act(() => result.current.openChange(target))
    await expect(act(() => result.current.change(300))).rejects.toBeInstanceOf(ApiError)
    expect(result.current.changing).toEqual(target)
  })

  it('change() with no sheet open sends nothing', async () => {
    const { result } = setup()
    await act(() => result.current.change(300))
    expect(actions.changeTick).not.toHaveBeenCalled()
  })

  it('closeChange closes without sending', () => {
    const { result } = setup()
    act(() => result.current.openChange({ entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: 'u-1' }))
    act(() => result.current.closeChange())
    expect(result.current.changing).toBeNull()
    expect(actions.changeTick).not.toHaveBeenCalled()
  })
})

describe('useTickFlow: Take back (SSP-18, RES-03)', () => {
  const ticked = (adds = [makeAddition()]) => lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: adds }) }), 'USD', 'metric')

  it('takes one addition back (that addition, by client id, to 0) and says so with an Undo toast, no subline', async () => {
    const mine = makeAddition({ quantity: 500, clientUuid: 'u-1' })
    const { result } = setup()
    await act(() => result.current.takeBack(ticked([mine]), mine))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 0, shopId: 1, clientUuid: 'u-1' })
    expect(shown().headline).toBe('Your 500 g of Garlic was taken back from Stock')
    expect(shown().subline).toBeUndefined()
  })

  it('anyone may take back any hand addition: Sam\'s reads "Sam\'s 50 g of Garlic was taken back from Stock"', async () => {
    const sam = makeAddition({ who: 'Sam', mine: false, quantity: 50, clientUuid: 's-1' })
    const { result } = setup()
    await act(() => result.current.takeBack(ticked([sam]), sam))
    expect(shown().headline).toBe("Sam's 50 g of Garlic was taken back from Stock")
  })

  it('Undo of Take back is the same PATCH with the old quantity', async () => {
    const mine = makeAddition({ quantity: 500, clientUuid: 'u-1' })
    const { result } = setup()
    await act(() => result.current.takeBack(ticked([mine]), mine))
    actions.changeTick.mockClear()
    await act(() => shown().undo({ focusWasInToast: false }))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: TO, quantity: 500, shopId: 1, clientUuid: 'u-1' })
  })

  it('an extra\'s addition goes through the extras API, and so does its Undo', async () => {
    const mine = makeAddition({ quantity: 2000, clientUuid: null })
    const entry = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000, ticked: true, tick: makeTick({ additions: [mine] }) }), 'metric')
    const { result } = setup()
    await act(() => result.current.takeBack(entry, mine))
    expect(actions.changeExtraTick).toHaveBeenLastCalledWith(2, 0)
    await act(() => shown().undo({ focusWasInToast: false }))
    expect(actions.changeExtraTick).toHaveBeenLastCalledWith(2, 2000)
  })

  it('a refused Take back (409 not_by_hand) rejects and shows no toast', async () => {
    actions.changeTick.mockRejectedValue(new ApiError(409, 'not_by_hand', 'x'))
    const scan = makeAddition({ by: 'scan', clientUuid: 's-2' })
    const { result } = setup()
    await expect(act(() => result.current.takeBack(ticked([scan]), scan))).rejects.toBeInstanceOf(ApiError)
    expect(undoToast.show).not.toHaveBeenCalled()
  })
})
