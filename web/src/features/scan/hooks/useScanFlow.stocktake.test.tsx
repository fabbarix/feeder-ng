// WP7 (QA): every Stock-take outcome is a toast, not an inline banner.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import type { OfflineData, Op, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

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

async function setup(submit: ScanFlowDeps['submit']) {
  const notify = vi.fn()
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
    notify,
    newUuid: () => 'uuid-1',
    now: () => new Date('2026-11-09T12:00:00Z'),
  }
  const hook = renderHook(() => useScanFlow(deps))
  await act(async () => hook.result.current.onScan(parse('8000500310427', 'ean_13')))
  return { deps, hook, notify }
}

describe('useScanFlow Stock-take toasts', () => {
  it('-1 pack says what the Stock is now', async () => {
    const { hook, notify } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 700)))
    await act(() => hook.result.current.stockTakeAction('minus_pack'))
    expect(notify).toHaveBeenCalledWith('−1 pack: Passata, 700 g in Stock', 'success')
    expect(hook.result.current.banner).toBeNull()
  })

  it('+1 pack and Set total too', async () => {
    const { hook, notify } = await setup(vi.fn(async (op: Op) => applied(op.clientUuid, 1500)))
    await act(() => hook.result.current.stockTakeAction('plus_pack'))
    expect(notify).toHaveBeenLastCalledWith('+1 pack: Passata, 1500 g in Stock', 'success')
    await act(async () => hook.result.current.onScan(parse('8000500310427', 'ean_13')))
    await act(() => hook.result.current.stockTakeAction('set_total', 1500))
    expect(notify).toHaveBeenLastCalledWith('Passata: 1500 g in Stock', 'success')
  })

  it('offline: a neutral "Waiting to sync" toast', async () => {
    const { hook, notify } = await setup(vi.fn(async () => null))
    await act(() => hook.result.current.stockTakeAction('minus_pack'))
    expect(notify).toHaveBeenCalledWith('Waiting to sync', 'info')
  })

  it('rejected: an error toast with the reason, and the reject cue', async () => {
    const rejected: ScanResult = { clientUuid: 'uuid-1', status: 'rejected', error: { code: 'unknown_product', message: 'no such Product' } }
    const { deps, hook, notify } = await setup(vi.fn(async () => rejected))
    await act(() => hook.result.current.stockTakeAction('plus_pack'))
    expect(notify).toHaveBeenCalledWith("Couldn't add that Scan: no such Product", 'error')
    expect(deps.feedback.reject).toHaveBeenCalled()
  })
})
