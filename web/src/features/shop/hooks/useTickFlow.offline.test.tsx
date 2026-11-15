// B9-54 (RES-03, decision RES 1): useTickFlow offline. The flow reads the shared queue (scan/components/SyncQueueProvider `useSharedSyncQueue`) and
// sends the SAME TickPlan either directly or, when the phone is offline or the send fails with status 0 / 5xx, as a queued shop_tick under the
// SAME client id (lib/pendingTicks tickOp, covers = the quantity the row showed, `more` for the more-since-your-tick row). Pinned here:
//   tick       offline (provider says so) → no request, the Op is queued, and ONE toast: headline "Garlic ticked", status 'pending' (Clock),
//              subline "Waiting to sync · 500 g goes to Stock when it syncs" ("Waiting to sync" when no amount), actions [Change] (only with
//              an amount) and Undo. Online + the send fails with status 0 or 5xx → the same (queued with the id the request carried; no failure
//              reaches the screen). A 4xx still rejects and queues nothing.
//   Undo       of a waiting Tick: cancel from the queue (nothing reaches the server, no Stock Lot is ever made), no request; if the Tick had
//              already left the queue (sent), the server's untick (the More row: untickAddition by client id) as before. `onUndone` runs either way.
//   Change     while waiting: change(q) rewrites the queued Op (OfflineQueue.updateTick; 0 = Tick without adding) and sends nothing; once the Tick
//              left the queue it is the PATCH as before.
//   untick     (the row's tick / the sheet's Untick): a waiting addition is cancelled; synced additions offline queue ONE shop_untick for the Line
//              (extras: one per hand addition by its client id); online it is the direct call as before. Nothing is lost silently.
//   takeBack   is NOT queued: offline it rejects (the screen's warning toast names it) and nothing is enqueued; a WAITING addition is
//              taken back by cancelling it (no request, no toast).
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemoryOpStore, OfflineQueue } from '../../scan/lib/queue'
import { SyncQueueProvider } from '../../scan/components/SyncQueueProvider'
import type { Op, ScanResult } from '../../scan/types'
import { extraEntry, lineEntry, listEntries } from '../lib/lines'
import { makeAddition, makeExtra, makeGarlic, makeList, makeTick } from '../testData'

const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn(), untickAddition: vi.fn() }))
vi.mock('./useShoppingActions', () => ({ useShoppingActions: () => actions }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))

import { useTickFlow } from './useTickFlow'

const TO = '2026-11-15'
const UUID = /^[0-9a-f-]{36}$/
const garlic = lineEntry(makeGarlic(), 'USD', 'metric')
const napkins = extraEntry(makeExtra({ text: 'napkins' }), 'metric')
const milk = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 }), 'metric')
const more = listEntries(makeList({ lines: [makeGarlic({ ticked: true, more: 750, quantity: 750, pack: null, tick: makeTick() })] }), 'metric').open[0]!

const down = () => new ApiError(0, 'network', 'The network is unreachable')
const ok = async (ops: Op[]): Promise<ScanResult[]> => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult)

function setup({ online = false, sync = async (): Promise<ScanResult[]> => { throw down() } }: { online?: boolean; sync?: (ops: Op[]) => Promise<ScanResult[]> } = {}) {
  const queue = new OfflineQueue(createMemoryOpStore())
  const api = { sync: vi.fn(sync) }
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <SyncQueueProvider queue={queue} api={api} isOnline={() => online}>
      {children}
    </SyncQueueProvider>
  )
  const onUndone = vi.fn()
  const hook = renderHook(() => useTickFlow({ to: TO, shopId: 1, system: 'metric', onUndone }), { wrapper })
  const pending = async () => (await queue.pending()).map((e) => e.op)
  return { queue, api, hook, pending, onUndone }
}
const shown = () => undoToast.show.mock.calls.at(-1)![0] as {
  headline: string
  subline?: string
  status?: string
  actions?: { label: string; onClick: (c?: unknown) => void }[]
  undo: (ctx?: { focusWasInToast: boolean }) => Promise<unknown>
}

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 500, quantity: 0 })
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
})

describe('useTickFlow offline: one tap queues the Tick', () => {
  it('no request; the shop_tick is queued with the plan\'s id, the covered amount and the phone\'s time', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(garlic))
    expect(actions.tick).not.toHaveBeenCalled()
    const [op, ...rest] = await pending()
    expect(rest).toEqual([])
    expect(op).toEqual({
      clientUuid: expect.stringMatching(UUID),
      scannedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
      kind: 'shop_tick',
      shopId: 1,
      ingredientId: 9,
      rangeTo: TO,
      quantity: 500,
      covers: 150,
    })
  })

  it('ONE toast: "Garlic ticked", Clock status, "Waiting to sync · 500 g goes to Stock when it syncs", Change and Undo (no toast storm)', async () => {
    const { hook } = setup()
    await act(() => hook.result.current.tick(garlic))
    expect(undoToast.show).toHaveBeenCalledTimes(1)
    const t = shown()
    expect(t).toMatchObject({ headline: 'Garlic ticked', status: 'pending', subline: 'Waiting to sync · 500 g goes to Stock when it syncs' })
    expect(t.actions?.map((a) => a.label)).toEqual(['Change'])
  })

  it('free text has no amount: "Waiting to sync", no Change; an Ingredient extra queues its extra id and no range', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(napkins))
    expect(shown()).toMatchObject({ headline: 'napkins ticked', status: 'pending', subline: 'Waiting to sync' })
    expect(shown().actions ?? []).toEqual([])
    await act(() => hook.result.current.tick(milk))
    const ops = await pending()
    expect(ops[0]).toMatchObject({ kind: 'shop_tick', extraId: 1, quantity: 0, covers: 0 })
    expect(ops[1]).toMatchObject({ kind: 'shop_tick', extraId: 2, quantity: 2000, covers: 2000 })
    expect('rangeTo' in ops[1]!).toBe(false)
    expect(actions.tickExtra).not.toHaveBeenCalled()
  })

  it('the more-since-your-tick row queues a tick marked `more`, covering the More', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(more))
    expect((await pending())[0]).toMatchObject({ kind: 'shop_tick', ingredientId: 9, quantity: 750, covers: 750, more: true })
  })

  it('every tap has its own client id, and a double tap on the same row queues once', async () => {
    const { hook, pending } = setup()
    await act(async () => {
      await Promise.all([hook.result.current.tick(garlic), hook.result.current.tick(garlic)])
    })
    expect(await pending()).toHaveLength(1)
  })
})

describe('useTickFlow online: a send that cannot reach the server falls into the queue with the same id', () => {
  it.each([
    ['status 0', new ApiError(0, 'network', 'The network is unreachable')],
    ['a 5xx', new ApiError(503, 'unavailable', 'try later')],
  ])('%s: the Tick is queued with the id the request carried, and the screen sees no failure', async (_n, err) => {
    actions.tick.mockRejectedValue(err)
    const { hook, pending } = setup({ online: true })
    await act(() => hook.result.current.tick(garlic))
    const sentId = actions.tick.mock.calls[0]![0].clientUuid
    expect((await pending())[0]).toMatchObject({ clientUuid: sentId, kind: 'shop_tick', ingredientId: 9, quantity: 500 })
    expect(shown()).toMatchObject({ headline: 'Garlic ticked', status: 'pending' })
  })

  it('a 4xx refusal is still a failure: it rejects and queues nothing', async () => {
    actions.tick.mockRejectedValue(new ApiError(422, 'validation_failed', 'no'))
    const { hook, pending } = setup({ online: true })
    await expect(act(() => hook.result.current.tick(garlic))).rejects.toThrow()
    expect(await pending()).toEqual([])
    expect(undoToast.show).not.toHaveBeenCalled()
  })

  it('online and answered: nothing is queued and the toast is the usual one (no pending status)', async () => {
    const { hook, pending } = setup({ online: true })
    await act(() => hook.result.current.tick(garlic))
    expect(await pending()).toEqual([])
    expect(shown().status).toBeUndefined()
    expect(shown().subline).toBe('500 g added to Stock')
  })
})

describe('useTickFlow offline: Undo of a waiting Tick', () => {
  it('removes it from the queue: nothing is sent, no Stock Lot is ever made, the row comes back (onUndone)', async () => {
    const { hook, pending, onUndone, api } = setup()
    await act(() => hook.result.current.tick(garlic))
    await act(async () => void (await shown().undo()))
    expect(await pending()).toEqual([])
    expect(actions.untick).not.toHaveBeenCalled()
    expect(actions.untickAddition).not.toHaveBeenCalled()
    expect(api.sync).not.toHaveBeenCalled()
    expect(onUndone).toHaveBeenCalledWith(garlic)
  })

  it('the More row\'s waiting Tick is cancelled the same way', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(more))
    await act(async () => void (await shown().undo()))
    expect(await pending()).toEqual([])
    expect(actions.untickAddition).not.toHaveBeenCalled()
  })

  it('a Tick that had already left the queue (it synced meanwhile) is unticked on the server, as before', async () => {
    const { hook, queue } = setup()
    await act(() => hook.result.current.tick(garlic))
    await act(async () => void (await queue.flush({ sync: ok })))
    await act(async () => void (await shown().undo()))
    expect(actions.untick).toHaveBeenCalledWith(9, TO)
  })

  it('a Tick whose send was tried (the server may have it) is unticked on the server', async () => {
    const { hook } = setup({ online: true })
    actions.tick.mockRejectedValue(down())
    await act(() => hook.result.current.tick(garlic))
    await act(async () => void (await shown().undo()))
    // enqueue's flush failed once (attempts > 0): cancel says the server may have it, so the server is asked to untick as well
    expect(actions.untick).toHaveBeenCalledWith(9, TO)
  })
})

describe('useTickFlow offline: Change while the Tick waits', () => {
  it('Save rewrites the waiting amount and sends nothing; the sheet closes', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(garlic))
    act(() => shown().actions![0]!.onClick())
    await waitFor(() => expect(hook.result.current.changing).toMatchObject({ added: 500 }))
    await act(() => hook.result.current.change(120))
    expect((await pending())[0]).toMatchObject({ kind: 'shop_tick', quantity: 120, covers: 150 })
    expect(actions.changeTick).not.toHaveBeenCalled()
    expect(hook.result.current.changing).toBeNull()
  })

  it('"Tick without adding" sets the waiting amount to 0 and keeps the Tick', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.tick(garlic))
    act(() => shown().actions![0]!.onClick())
    await act(() => hook.result.current.change(0))
    expect((await pending())[0]).toMatchObject({ kind: 'shop_tick', quantity: 0 })
    expect(actions.changeTick).not.toHaveBeenCalled()
  })

  it('once the Tick left the queue while the sheet was open, Save falls back to the PATCH of the synced Tick', async () => {
    const { hook, queue } = setup()
    await act(() => hook.result.current.tick(garlic))
    const id = (await queue.pending())[0]!.op.clientUuid
    act(() => shown().actions![0]!.onClick())
    await act(async () => void (await queue.flush({ sync: ok })))
    await act(() => hook.result.current.change(120))
    expect(actions.changeTick).toHaveBeenCalledWith({ ingredientId: 9, to: TO, quantity: 120, shopId: 1, clientUuid: id })
    expect(hook.result.current.changing).toBeNull()
  })
})

describe('useTickFlow offline: untick and Take back', () => {
  const synced = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'metric')
  const waitingAddition = (uuid: string) => makeAddition({ clientUuid: uuid, quantity: 50, syncedAt: null })

  it('untick of a synced Line while offline queues ONE shop_untick of the Line for the range; no request, no error', async () => {
    const { hook, pending } = setup()
    await act(() => hook.result.current.untick(synced))
    expect(actions.untick).not.toHaveBeenCalled()
    const ops = await pending()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'shop_untick', ingredientId: 9, rangeTo: TO, clientUuid: expect.stringMatching(UUID) })
  })

  it('untick of an entry with only a waiting addition cancels it: nothing queued, nothing sent', async () => {
    const { hook, queue, pending } = setup()
    await act(() => hook.result.current.tick(garlic))
    const id = (await queue.pending())[0]!.op.clientUuid
    const entry = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [waitingAddition(id)] }) }), 'USD', 'metric')
    await act(() => hook.result.current.untick(entry))
    expect(await pending()).toEqual([])
    expect(actions.untick).not.toHaveBeenCalled()
  })

  it('online untick is the direct call, as before', async () => {
    const { hook, pending } = setup({ online: true })
    await act(() => hook.result.current.untick(synced))
    expect(actions.untick).toHaveBeenCalledWith(9, TO)
    expect(await pending()).toEqual([])
  })

  it('an Ingredient extra\'s synced hand additions are unticked offline one shop_untick each, by the addition\'s client id', async () => {
    const { hook, pending } = setup()
    const entry = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000, ticked: true, tick: makeTick({ additions: [makeAddition({ clientUuid: 'h-1' }), makeAddition({ clientUuid: 'h-2' })] }) }), 'metric')
    await act(() => hook.result.current.untick(entry))
    expect((await pending()).map((o) => [o.kind, o.tickClientUuid])).toEqual([
      ['shop_untick', 'h-1'],
      ['shop_untick', 'h-2'],
    ])
    expect(actions.untickExtra).not.toHaveBeenCalled()
  })

  it('Take back is not queued: offline it rejects (the screen\'s warning names it), enqueues nothing and shows no toast', async () => {
    actions.changeTick.mockRejectedValue(down())
    const { hook, pending } = setup()
    const addition = makeAddition({ clientUuid: 'h-1', quantity: 500 })
    await expect(act(() => hook.result.current.takeBack(synced, addition))).rejects.toThrow()
    expect(await pending()).toEqual([])
    expect(undoToast.show).not.toHaveBeenCalled()
  })

  it('Take back of a WAITING addition cancels it from the queue: no request, no toast', async () => {
    const { hook, queue, pending } = setup()
    await act(() => hook.result.current.tick(garlic))
    undoToast.show.mockClear()
    const id = (await queue.pending())[0]!.op.clientUuid
    const entry = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [waitingAddition(id)] }) }), 'USD', 'metric')
    await act(() => hook.result.current.takeBack(entry, waitingAddition(id)))
    expect(await pending()).toEqual([])
    expect(actions.changeTick).not.toHaveBeenCalled()
    expect(undoToast.show).not.toHaveBeenCalled()
  })
})
