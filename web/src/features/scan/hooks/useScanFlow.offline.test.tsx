// r3-scan-fixes B5 (op), B6 (offline price shown and editable) and B7 (the line follows the sync).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import type { OfflineData, Op, ScanApplied, ScanResult } from '../types'
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

const applied = (over: Partial<ScanApplied> = {}): ScanApplied => ({
  ingredientId: 6,
  ingredientName: 'carrots',
  baseUnit: 'g',
  productId: 22,
  productName: 'Rule 21 Product',
  quantity: 850,
  lotId: 11,
  priceCents: 764,
  onList: true,
  remaining: 0,
  ticked: false,
  productCreated: false,
  ...over,
})

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

  it('450 g shows $4.05 in the toast', async () => {
    const { hook } = setup()
    await read(hook, '2112345004501')
    expect(hook.result.current.feedback?.text).toBe('carrots +450 g · $4.05')
  })

  it('a pack scan carries no weighed flag', async () => {
    const { deps, hook } = setup()
    await read(hook, '8000500310427')
    expect(vi.mocked(deps.submit).mock.calls[0]?.[0]).not.toHaveProperty('weighed')
  })
})

describe('an offline scan (B6)', () => {
  it('shows the price it will be recorded at, waiting to sync, and lets the User edit it', async () => {
    const { hook } = setup()
    await read(hook, '2112345008509')
    expect(hook.result.current.feedback).toMatchObject({ text: 'carrots +850 g · $7.64', queued: true, priceCents: 764, canEditPrice: true })
  })

  it('a pack scan offline shows its prefilled price too, and the edit is allowed', async () => {
    const { hook } = setup()
    await read(hook, '8000500310427')
    expect(hook.result.current.feedback).toMatchObject({ text: 'Passata +700 g · $1.59', canEditPrice: true })
  })

  it('opening the edit works while the scan is queued', async () => {
    const { hook } = setup()
    await read(hook, '8000500310427')
    act(() => hook.result.current.openEditPrice())
    expect(hook.result.current.sheet).toEqual({ kind: 'edit_price' })
  })

  it('editing a queued scan changes the queued operation, not the server, and updates the line', async () => {
    const { deps, hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.openEditPrice())
    await act(() => hook.result.current.editPrice(700))
    expect(deps.setQueuedPrice).toHaveBeenCalledWith('uuid-1', 700)
    expect(deps.setPrice).not.toHaveBeenCalled()
    expect(hook.result.current.feedback).toMatchObject({ text: 'carrots +850 g · $7.00', priceCents: 700, queued: true })
    expect(hook.result.current.sheet).toBeNull()
  })

  it('falls back to the server edit when the scan already left the queue', async () => {
    const { deps, hook } = setup({ setQueuedPrice: vi.fn(async () => false) })
    await read(hook, '2112345008509')
    await act(() => hook.result.current.editPrice(700))
    expect(deps.setPrice).toHaveBeenCalledWith('uuid-1', 700)
    expect(hook.result.current.feedback?.priceCents).toBe(700)
  })

  it('a queued edit that loses the race to a flush keeps the line synced, with the new price (B7 stale write-back)', async () => {
    let resolveQueued: (edited: boolean) => void = () => {}
    const setQueuedPrice = vi.fn(() => new Promise<boolean>((resolve) => (resolveQueued = resolve)))
    const { deps, hook } = setup({ setQueuedPrice })
    await read(hook, '2112345008509')
    let edit: Promise<void> = Promise.resolve()
    act(() => {
      edit = hook.result.current.editPrice(700) // waits on the queue lock while a flush runs
    })
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied({ priceCents: 764 }) }]))
    expect(hook.result.current.feedback?.queued).toBe(false)
    await act(async () => {
      resolveQueued(false) // the Op already left the queue: the edit goes to the server
      await edit
    })
    expect(deps.setPrice).toHaveBeenCalledWith('uuid-1', 700)
    expect(hook.result.current.feedback).toMatchObject({ queued: false, priceCents: 700 })
  })

  it('a queued edit that resolves after a rejection does not bring the line back', async () => {
    let resolveQueued: (edited: boolean) => void = () => {}
    const { hook } = setup({ setQueuedPrice: vi.fn(() => new Promise<boolean>((resolve) => (resolveQueued = resolve))) })
    await read(hook, '2112345008509')
    let edit: Promise<void> = Promise.resolve()
    act(() => {
      edit = hook.result.current.editPrice(700)
    })
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }]))
    await act(async () => {
      resolveQueued(false)
      await edit
    })
    expect(hook.result.current.feedback).toBeNull()
  })

  it('an applied (online) scan edits on the server only', async () => {
    const { deps, hook } = setup({ submit: vi.fn(async (op: Op) => ({ clientUuid: op.clientUuid, status: 'applied', scan: applied() }) as ScanResult) })
    await read(hook, '2112345008509')
    await act(() => hook.result.current.editPrice(700))
    expect(deps.setQueuedPrice).not.toHaveBeenCalled()
    expect(deps.setPrice).toHaveBeenCalledWith('uuid-1', 700)
  })
})

describe('the line follows the sync (B7)', () => {
  it('after the Result arrives the line is no longer waiting and shows what the server recorded', async () => {
    const { hook } = setup()
    await read(hook, '2112345008509')
    expect(hook.result.current.feedback?.queued).toBe(true)
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied({ priceCents: 764, onList: false }) }]))
    expect(hook.result.current.feedback).toMatchObject({ queued: false, canEditPrice: true, text: 'carrots +850 g · $7.64 · not on the list' })
  })

  it('a duplicate Result counts as synced', async () => {
    const { hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'duplicate', scan: applied() }]))
    expect(hook.result.current.feedback?.queued).toBe(false)
  })

  it('a rejected Result removes the line (the sync notice explains why)', async () => {
    const { hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }]))
    expect(hook.result.current.feedback).toBeNull()
  })

  it('Results of other scans do not touch the line', async () => {
    const { hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'other', status: 'applied', scan: applied() }]))
    expect(hook.result.current.feedback?.queued).toBe(true)
  })

  it('Undo after the sync goes to the server, not the queue', async () => {
    const { deps, hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied() }]))
    await act(() => hook.result.current.undo())
    expect(deps.undo).toHaveBeenCalledWith('uuid-1')
    expect(deps.cancelQueued).not.toHaveBeenCalled()
  })

  it('an edit after the sync goes to the server', async () => {
    const { deps, hook } = setup()
    await read(hook, '2112345008509')
    act(() => hook.result.current.applySyncResults([{ clientUuid: 'uuid-1', status: 'applied', scan: applied() }]))
    await act(() => hook.result.current.editPrice(700))
    expect(deps.setPrice).toHaveBeenCalledWith('uuid-1', 700)
    expect(deps.setQueuedPrice).not.toHaveBeenCalled()
  })
})
