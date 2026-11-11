// PP: the scan line carries the Product's Picture: from the Result when the scan went through, from the offline Product while it is queued.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import { emptyForm } from '../lib/unknownForm'
import type { OfflineData, Op, ScanApplied, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const url = (c: string) => `/api/images/${c.repeat(32)}`
const offline: OfflineData = {
  shopId: 1,
  shopName: 'Coop',
  products: [
    { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159, imageUrl: url('a') },
    { id: 8, name: 'Own-brand milk 1 l', ingredientId: 3, ingredientName: 'Milk', baseUnit: 'ml', packSize: 1000, lastPriceCents: 99 },
  ],
  catalog: { globalBarcodes: { '08000500310427': 7, '04000000000013': 8 }, weightRules: [], weightProducts: {} },
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
  return { deps, hook: renderHook(() => useScanFlow(deps)) }
}
const read = (hook: ReturnType<typeof setup>['hook'], code: string) => act(async () => hook.result.current.onScan(parse(code, 'ean_13')))
const ok = (scan: ScanApplied) => vi.fn(async (op: Op): Promise<ScanResult> => ({ clientUuid: op.clientUuid, status: 'applied', scan }))

describe('the scan line: Product picture', () => {
  it('takes the picture from the server Result', async () => {
    const { hook } = setup(ok(applied({ productImageUrl: url('b') })))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback?.imageUrl).toBe(url('b'))
  })

  it('a Result without a picture shows none, even if the offline Product had one', async () => {
    const { hook } = setup(ok(applied()))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback?.imageUrl).toBeUndefined()
  })

  it('a queued scan (offline) takes the picture from the cached offline Product', async () => {
    const { hook } = setup(vi.fn(async () => null))
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback).toMatchObject({ queued: true, imageUrl: url('a') })
  })

  it('a queued scan of a Product without a picture has none', async () => {
    const { hook } = setup(vi.fn(async () => null))
    await read(hook, '4000000000013')
    expect(hook.result.current.feedback?.imageUrl).toBeUndefined()
  })

  it('the sync Result then takes over the line, picture included', async () => {
    const { hook } = setup(vi.fn(async () => null))
    await read(hook, '8000500310427')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied({ productImageUrl: url('c') }) }]))
    expect(hook.result.current.feedback).toMatchObject({ queued: false, imageUrl: url('c') })
  })

  it('a Product created from the what-is-this sheet shows the Picture it was saved with', async () => {
    const created = applied({ productCreated: true, productName: 'Tinned tomatoes 400 g', productImageUrl: url('d') })
    const { hook } = setup(ok(created))
    await read(hook, '5012345678900')
    await act(() =>
      hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, packSize: '400', packUnit: 'g', productName: 'Tinned tomatoes 400 g', image: 'd'.repeat(32) }),
    )
    expect(hook.result.current.feedback?.imageUrl).toBe(url('d'))
  })
})
