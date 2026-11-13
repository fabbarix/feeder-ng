// R8 (merged): an archived Product owns the barcode. The unknown-barcode flow offers "Unarchive <Product>" before
// creating a new Product, and a barcode_archived rejection opens the same offer.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { ArchivedProduct } from '../lib/archivedProduct'
import { parse } from '../lib/barcode'
import { emptyForm } from '../lib/unknownForm'
import type { OfflineData, Op, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const offline: OfflineData = { shopId: 1, shopName: 'Coop', products: [], catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} } }
const archived: ArchivedProduct = { id: 9, name: 'Old passata 500 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 500, archived: true }
const CODE = '5012345678900'
const CANON = '05012345678900'

const ok = (op: Op): ScanResult => ({
  clientUuid: op.clientUuid,
  status: 'applied',
  scan: { ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', productId: 9, productName: 'Old passata 500 g', quantity: 500, lotId: 3, priceCents: null, onList: true, remaining: 0, ticked: false, productCreated: false },
})

function setup(over: Partial<ScanFlowDeps> = {}) {
  let n = 0
  const deps: ScanFlowDeps = {
    mode: 'shop',
    shop: { id: 1, name: 'Coop' },
    offline,
    currency: 'USD',
    system: 'metric',
    submit: vi.fn(async (op: Op) => ok(op)),
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    notify: vi.fn(),
    findArchived: vi.fn(async () => archived),
    fetchProduct: vi.fn(async () => archived),
    unarchive: vi.fn(async () => {}),
    newUuid: () => `uuid-${++n}`,
    now: () => new Date('2026-11-09T12:00:00Z'),
    ...over,
  }
  const hook = renderHook(() => useScanFlow(deps))
  return { deps, hook }
}

const read = (hook: ReturnType<typeof setup>['hook']) => act(async () => hook.result.current.onScan(parse(CODE, 'ean_13')))

describe('useScanFlow, archived Product owns the barcode', () => {
  it('offers to unarchive it before the unknown-barcode sheet', async () => {
    const { deps, hook } = setup()
    await read(hook)
    expect(deps.findArchived).toHaveBeenCalledWith(CANON, 1)
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unarchive', product: { id: 9, name: 'Old passata 500 g' }, target: { mode: 'pack', code: CANON } })
    expect(hook.result.current.paused).toBe(true)
  })

  it('Unarchive unarchives, then scans the Product as if it were known (one pack, no price)', async () => {
    const { deps, hook } = setup()
    await read(hook)
    await act(() => hook.result.current.unarchiveProduct())
    expect(deps.unarchive).toHaveBeenCalledWith(9)
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_scan', shopId: 1, productId: 9, quantity: 500 }))
    expect((deps.submit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toHaveProperty('priceCents')
    expect(hook.result.current.sheet).toBeNull()
    expect(deps.feedback.confirm).toHaveBeenCalledTimes(1)
  })

  it('a double tap on Unarchive records the scan once (pending guard)', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const { deps, hook } = setup({ unarchive: vi.fn(async () => { await gate }) })
    await read(hook)
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = hook.result.current.unarchiveProduct()
      second = hook.result.current.unarchiveProduct()
    })
    await act(async () => {
      release()
      await Promise.all([first, second])
    })
    expect(deps.unarchive).toHaveBeenCalledTimes(1)
    expect(deps.submit).toHaveBeenCalledTimes(1)
  })

  it('exposes the pending state so the sheet can show busy', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const { hook } = setup({ unarchive: vi.fn(async () => { await gate }) })
    await read(hook)
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = hook.result.current.unarchiveProduct() })
    expect(hook.result.current.unarchiving).toBe(true)
    await act(async () => { release(); await pending })
    expect(hook.result.current.unarchiving).toBe(false)
  })

  it('Create a new Product instead shows the unknown sheet for the same code', async () => {
    const { deps, hook } = setup()
    await read(hook)
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unarchive' })
    act(() => hook.result.current.createNewInstead())
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: CANON } })
    expect(deps.unarchive).not.toHaveBeenCalled()
  })

  it('an unarchive that fails keeps the offer and says why', async () => {
    const { hook, deps } = setup({ unarchive: vi.fn(async () => { throw new ApiError(500, 'internal', 'boom') }) })
    await read(hook)
    await act(() => hook.result.current.unarchiveProduct())
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unarchive' })
    expect(deps.notify).toHaveBeenCalledWith('boom', 'error')
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('no archived owner: the unknown sheet opens as before', async () => {
    const { hook } = setup({ findArchived: vi.fn(async () => null) })
    await read(hook)
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack' })
  })

  it('cannot reach the server (or no lookup wired): the unknown sheet opens, nothing is blocked', async () => {
    const offlineLookup = setup({ findArchived: vi.fn(async () => { throw new ApiError(0, 'network', 'offline') }) })
    await read(offlineLookup.hook)
    expect(offlineLookup.hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack' })
    const none = setup({ findArchived: undefined })
    await read(none.hook)
    expect(none.hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack' })
  })

  it('a barcode_archived rejection of a new Product opens the offer (the offline-created case)', async () => {
    const rejected = (op: Op): ScanResult => ({ clientUuid: op.clientUuid, status: 'rejected', error: { code: 'barcode_archived', message: 'barcode already belongs to product 9' } })
    const { deps, hook } = setup({ findArchived: vi.fn(async () => null), submit: vi.fn(async (op: Op) => rejected(op)) })
    await read(hook)
    await act(() => hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { id: 2, name: 'Passata', baseUnit: 'g' }, packSize: '500', packUnit: 'g', productName: 'Passata 500 g' }))
    expect(deps.fetchProduct).toHaveBeenCalledWith(9)
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unarchive', product: { id: 9 }, target: { mode: 'pack', code: CANON } })
    expect(hook.result.current.banner).toBeNull()
  })

  it('after "create a new Product instead", a second barcode_archived is a warning, not another offer', async () => {
    const rejected = (op: Op): ScanResult => ({ clientUuid: op.clientUuid, status: 'rejected', error: { code: 'barcode_archived', message: 'barcode already belongs to product 9' } })
    const { hook } = setup({ submit: vi.fn(async (op: Op) => rejected(op)) })
    await read(hook)
    act(() => hook.result.current.createNewInstead())
    await act(() => hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { id: 2, name: 'Passata', baseUnit: 'g' }, packSize: '500', packUnit: 'g', productName: 'Passata 500 g' }))
    expect(hook.result.current.sheet).toBeNull()
    expect(hook.result.current.banner).toEqual({ tone: 'warn', text: 'This barcode belongs to the archived Product Old passata 500 g. Unarchive it in Products.' })
  })

  it('a Stock-take does not look for archived Products (unknown barcodes just point to a Shop)', async () => {
    const { deps, hook } = setup({ mode: 'stocktake', shop: null })
    await read(hook)
    expect(deps.findArchived).not.toHaveBeenCalled()
    expect(hook.result.current.banner?.text).toBe('Unknown barcode: add it by scanning in a Shop')
  })
})
