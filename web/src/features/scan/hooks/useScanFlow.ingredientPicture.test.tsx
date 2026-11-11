// PE: the scan line shows the Product's Picture, else the Ingredient's: from the Result when the scan went through, from the cached offline Product while queued.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import type { OfflineData, Op, ScanApplied, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const url = (c: string) => `/api/images/${c.repeat(32)}`
const offline: OfflineData = {
  shopId: 1,
  shopName: 'Coop',
  products: [
    { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159, imageUrl: url('a'), ingredientImageUrl: url('i') },
    { id: 8, name: 'Own-brand milk 1 l', ingredientId: 3, ingredientName: 'Milk', baseUnit: 'ml', packSize: 1000, lastPriceCents: 99, ingredientImageUrl: url('m') },
    { id: 9, name: 'Plain salt 1 kg', ingredientId: 4, ingredientName: 'Salt', baseUnit: 'g', packSize: 1000, lastPriceCents: 49 },
  ],
  catalog: { globalBarcodes: { '08000500310427': 7, '04000000000013': 8, '05000000000010': 9 }, weightRules: [], weightProducts: {} },
}
const applied = (over: Partial<ScanApplied> = {}): ScanApplied => ({
  ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', productId: 7, productName: 'Mutti passata 700 g', quantity: 700, lotId: 1,
  priceCents: 159, onList: true, remaining: 0, ticked: false, productCreated: false, ...over,
})

function setup(submit: ScanFlowDeps['submit']) {
  let n = 0
  const deps: ScanFlowDeps = {
    mode: 'shop', shop: { id: 1, name: 'Coop' }, offline, currency: 'USD', system: 'metric', rangeTo: '2026-11-15',
    submit, cancelQueued: vi.fn(async () => true), undo: vi.fn(async () => {}), setPrice: vi.fn(async () => {}), setQueuedPrice: vi.fn(async () => true),
    feedback: { confirm: vi.fn(), reject: vi.fn() }, newUuid: () => `uuid-${++n}`, now: () => new Date('2026-11-09T12:00:00Z'),
  }
  return renderHook(() => useScanFlow(deps))
}
type Hook = ReturnType<typeof setup>
const read = (hook: Hook, code: string) => act(async () => hook.result.current.onScan(parse(code, 'ean_13')))
const ok = (scan: ScanApplied) => vi.fn(async (op: Op): Promise<ScanResult> => ({ clientUuid: op.clientUuid, status: 'applied', scan }))

describe('the scan line: Ingredient picture fallback', () => {
  it('a Result without a Product picture shows the Ingredient picture', async () => {
    const hook = setup(ok(applied({ ingredientImageUrl: url('i') })))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback?.imageUrl).toBe(url('i'))
  })

  it('the Product picture wins over the Ingredient picture', async () => {
    const hook = setup(ok(applied({ productImageUrl: url('b'), ingredientImageUrl: url('i') })))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback?.imageUrl).toBe(url('b'))
  })

  it('a queued scan of a Product without a picture uses the cached Ingredient picture', async () => {
    const hook = setup(vi.fn(async () => null))
    await read(hook, '4000000000013')
    expect(hook.result.current.feedback).toMatchObject({ queued: true, imageUrl: url('m') })
  })

  it('a queued scan of a pictured Product still uses the Product picture', async () => {
    const hook = setup(vi.fn(async () => null))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback?.imageUrl).toBe(url('a'))
  })

  it('neither picture: none', async () => {
    const hook = setup(vi.fn(async () => null))
    await read(hook, '5000000000010')
    expect(hook.result.current.feedback?.imageUrl).toBeUndefined()
  })

  it('the sync Result takes over a queued line with its Ingredient picture', async () => {
    const hook = setup(vi.fn(async () => null))
    await read(hook, '4000000000013')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied({ productId: 8, ingredientImageUrl: url('n') }) }]))
    expect(hook.result.current.feedback).toMatchObject({ queued: false, imageUrl: url('n') })
  })
})
