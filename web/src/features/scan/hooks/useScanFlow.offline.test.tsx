// r3-scan-fixes B5: the Op of a weighed scan. B6 (the offline Price, editable) and B7 (it follows the sync) are now the
// Scanned list's: a waiting row, its Price entry in the queue, and the sync Result settling it (useScanFlow.session.test).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import type { OfflineData } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const offline: OfflineData = {
  shopId: 1,
  shopName: 'Coop',
  products: [
    { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159 },
    { id: 22, name: 'Rule 21 Product', ingredientId: 6, ingredientName: 'carrots', baseUnit: 'g', packSize: 1000, lastPriceCents: 899 },
  ],
  catalog: {
    globalBarcodes: { '08000500310427': 7 },
    weightRules: [{ id: 3, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'g', decimalPlaces: 0 }],
    weightProducts: { '3:12345': 22 },
  },
}

function setup(over: Partial<ScanFlowDeps> = {}) {
  let n = 0
  const deps: ScanFlowDeps = {
    mode: 'shop',
    shop: { id: 1, name: 'Coop' },
    offline,
    currency: 'USD',
    system: 'metric',
    rangeTo: '2026-11-15',
    submit: vi.fn(async () => null), // offline: queued
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    setQueuedPrice: vi.fn(async () => true),
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    newUuid: () => `uuid-${++n}`,
    now: () => new Date('2026-11-09T12:00:00Z'),
    ...over,
  }
  return { deps, hook: renderHook(() => useScanFlow(deps)) }
}
const read = (hook: ReturnType<typeof setup>['hook'], code: string) => act(async () => hook.result.current.onScan(parse(code, 'ean_13')))

describe('a weighed scan (B5)', () => {
  it('sends the weighed flag, the weight, the price per kg and the price by weight', async () => {
    const { deps, hook } = setup()
    await read(hook, '2112345008509')
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_scan', productId: 22, quantity: 850, priceCents: 764, pricePerKgCents: 899, weighed: true }))
  })

  it('450 g is priced $4.05 by its weight', async () => {
    const { deps, hook } = setup()
    await read(hook, '2112345004501')
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ quantity: 450, priceCents: 405, pricePerKgCents: 899, weighed: true }))
  })

  it('a pack scan carries no weighed flag', async () => {
    const { deps, hook } = setup()
    await read(hook, '8000500310427')
    expect(vi.mocked(deps.submit).mock.calls[0]?.[0]).not.toHaveProperty('weighed')
  })
})
