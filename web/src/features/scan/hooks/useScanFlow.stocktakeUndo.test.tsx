// B9-41 (SAFE-09): every Stock-take action is done at once and its toast has Undo (B9-05: POST /api/scan/{clientUuid}/undo takes back a
// +1 pack, gives back a -1 pack, resets a Set total). The toast is the Scan Undo toast (5 s, no icon); a refused Undo is the shared warning
// toast "Nothing was undone", which useUndoToast makes when the toast's undo REJECTS: so the flow's undo must let the server's refusal through.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { parse } from '../lib/barcode'
import type { OfflineData, Op, ScanResult } from '../types'
import { useScanFlow, type AddedToast, type ScanFlowDeps } from './useScanFlow'

const offline: OfflineData = {
  shopId: null,
  shopName: '',
  products: [{ id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159 }],
  catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} },
}
const applied = (uuid: string, total: number): ScanResult => ({
  clientUuid: uuid,
  status: 'applied',
  scan: { ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', productId: 7, productName: 'Mutti passata 700 g', quantity: 700, lotId: null, priceCents: null, onList: false, remaining: 0, ticked: false, productCreated: false, total },
})

async function setup(submit: ScanFlowDeps['submit'], over: Partial<ScanFlowDeps> = {}) {
  const added: AddedToast[] = []
  const handle = { id: 1, dismiss: vi.fn() }
  const deps: ScanFlowDeps = {
    mode: 'stocktake',
    shop: null,
    offline,
    currency: 'USD',
    system: 'metric',
    submit,
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    notify: vi.fn(),
    announceAdded: vi.fn((t: AddedToast) => {
      added.push(t)
      return handle
    }),
    newUuid: () => 'uuid-1',
    now: () => new Date('2026-11-09T12:00:00Z'),
    ...over,
  }
  const hook = renderHook(() => useScanFlow(deps))
  await act(async () => hook.result.current.onScan(parse('8000500310427', 'ean_13')))
  return { deps, hook, added }
}
const act1 = (hook: Awaited<ReturnType<typeof setup>>['hook'], action: 'plus_pack' | 'minus_pack' | 'set_total', total?: number) => act(() => hook.result.current.stockTakeAction(action, total))

describe('Stock-take: the toast with Undo', () => {
  it('+1 pack: "+1 pack of Passata: 1.4 kg in Stock", Undo named "Undo +1 pack of Passata", Scan\'s 5 s', async () => {
    const { hook, added, deps } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1400)))
    await act1(hook, 'plus_pack')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ headline: '+1 pack of Passata: 1.4 kg in Stock', undoAriaLabel: 'Undo +1 pack of Passata', durationMs: 5000 })
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('-1 pack and Set total say what they did, and what Undo undoes', async () => {
    const { hook, added } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 750)))
    await act1(hook, 'minus_pack')
    expect(added.at(-1)).toMatchObject({ headline: '−1 pack of Passata: 750 g in Stock', undoAriaLabel: 'Undo −1 pack of Passata', durationMs: 5000 })
    await act(async () => hook.result.current.onScan(parse('8000500310427', 'ean_13')))
    await act1(hook, 'set_total', 750)
    expect(added.at(-1)).toMatchObject({ headline: 'Passata set to 750 g', undoAriaLabel: 'Undo set total of Passata', durationMs: 5000 })
  })

  it('Undo is the server Undo of that scan, once; a second press does nothing', async () => {
    const { hook, added, deps } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1400)))
    await act1(hook, 'plus_pack')
    await act(async () => {
      await added[0]!.undo()
      await added[0]!.undo()
    })
    expect(deps.undo).toHaveBeenCalledExactlyOnceWith('uuid-1')
  })

  it('a refused Undo rejects, so the toast says "Nothing was undone" (the 409 is not swallowed); nothing else is shown', async () => {
    const refusal = new ApiError(409, 'not_undoable', 'This cannot be undone')
    const { hook, added, deps } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1400)), { undo: vi.fn(async () => Promise.reject(refusal)) })
    await act1(hook, 'plus_pack')
    await expect(added[0]!.undo()).rejects.toBe(refusal)
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('a second Undo after a refusal does not ask the server again (the toast runs it once)', async () => {
    const { hook, added, deps } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1400)), { undo: vi.fn(async () => Promise.reject(new ApiError(409, 'undo_window_over', 'late'))) })
    await act1(hook, 'plus_pack')
    await expect(added[0]!.undo()).rejects.toBeInstanceOf(ApiError)
    await added[0]!.undo()
    expect(deps.undo).toHaveBeenCalledTimes(1)
  })

  it('a Stock-take that waits to sync has no Undo toast, only "Waiting to sync"; a rejected one is an error toast', async () => {
    const waiting = await setup(vi.fn(async () => null))
    await act1(waiting.hook, 'minus_pack')
    expect(waiting.added).toHaveLength(0)
    expect(waiting.deps.notify).toHaveBeenCalledWith('Waiting to sync', 'info')
    const rejected = await setup(vi.fn(async () => ({ clientUuid: 'uuid-1', status: 'rejected', error: { code: 'unknown_product', message: 'no such Product' } }) as ScanResult))
    await act1(rejected.hook, 'plus_pack')
    expect(rejected.added).toHaveLength(0)
    expect(rejected.deps.notify).toHaveBeenCalledWith("Couldn't add that Scan: no such Product", 'error')
  })

  it('Undo of a Stock-take does not touch a Scanned list (Stock-take has none)', async () => {
    const { hook, added } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1400)))
    await act1(hook, 'plus_pack')
    await act(async () => {
      await added[0]!.undo()
    })
    expect(hook.result.current.sheet).toBeNull()
    expect(hook.result.current.banner).toBeNull()
  })
})
