// SR3: the scan flow with the Scanned session: scan, rescan, +1, −1 / Undo, Remove (with a confirm from ×2), group Price
// (spec §10.1 "Quantity, Undo and Remove", "Price entry"; shop-scan-proposals.md §13.4, §13.6, §13.9).
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { makeList } from '../../shop/testData'
import { parse } from '../lib/barcode'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { createSessionStore } from '../lib/sessionStore'
import { applied, cheese, okResult, passata, products, scanOp, toiletPaper } from '../lib/scannedList.testData'
import type { SessionEntry } from '../lib/scannedList'
import type { OfflineData, Op, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'
import { useScannedList } from './useScannedList'

const offline: OfflineData = {
  shopId: 1,
  shopName: 'Coop',
  products,
  catalog: { globalBarcodes: { '08000500310427': 7, '08000500310434': 31 }, weightRules: [], weightProducts: {} },
}

function setup(over: Partial<ScanFlowDeps> = {}) {
  let n = 0
  const store = createSessionStore(createMemorySnapshotStore())
  const deps = {
    mode: 'shop',
    shop: { id: 1, name: 'Coop' },
    offline,
    currency: 'USD',
    system: 'metric',
    rangeTo: '2026-11-15',
    submit: vi.fn(async (op: Op): Promise<ScanResult | null> => okResult(op, products.find((p) => p.id === op.productId) ?? passata)),
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    setQueuedPrice: vi.fn(async () => true),
    setPrices: vi.fn(async (body: { clientUuids: string[]; priceCents: number; pricePerKgCents?: number }): Promise<ScanResult[]> =>
      body.clientUuids.map((u) => ({ clientUuid: u, status: 'applied', scan: { ...okResult(scanOp(u, passata), passata).scan!, priceCents: body.priceCents } }) as ScanResult),
    ),
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    notify: vi.fn(),
    newUuid: () => `uuid-${++n}`,
    now: () => new Date('2026-11-13T12:00:00Z'),
    ...over,
  } as ScanFlowDeps & { notify: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; setPrices: ReturnType<typeof vi.fn>; setQueuedPrice: ReturnType<typeof vi.fn>; cancelQueued: ReturnType<typeof vi.fn> }
  const hook = renderHook(() => {
    const session = useScannedList({ shopId: 1, day: '2026-11-13', store, offline, list: makeList({ lines: [], extras: [] }), system: 'metric' })
    const flow = useScanFlow({ ...deps, session })
    return { session, flow }
  })
  return { deps, hook, store }
}
type Harness = ReturnType<typeof setup>

async function seed(h: Harness, entries: SessionEntry[]) {
  await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
  for (const e of entries) act(() => h.hook.result.current.session.record(e.op, e.result))
}
const scanCode = (h: Harness, code = '8000500310427') => act(async () => h.hook.result.current.flow.onScan(parse(code, 'ean_13')))
const rows = (h: Harness) => h.hook.result.current.session.rows
const flow = (h: Harness) => h.hook.result.current.flow
const lastNotify = (h: Harness) => h.deps.notify.mock.calls.at(-1) as [string, string, { actionLabel?: string; onAction?: () => void; durationMs?: number }?]

beforeEach(() => vi.clearAllMocks())

describe('a scan lands in the Scanned list', () => {
  it('records the Op and its Result as a row', async () => {
    const h = setup()
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    expect(rows(h).map((r) => [r.key, r.count, r.clientUuids])).toEqual([['7', 1, ['uuid-1']]])
  })

  it('scanning the same barcode again makes ×2 and moves the row to the top', async () => {
    const h = setup()
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    await scanCode(h, '8000500310434')
    await scanCode(h)
    expect(rows(h).map((r) => [r.key, r.count])).toEqual([['7', 2], ['31', 1]])
  })

  it('the Price of a known Product is prefilled from the last Price at this Shop, as before', async () => {
    const h = setup()
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    expect(h.deps.submit.mock.calls[0]![0]).toMatchObject({ productId: 7, priceCents: 129 })
  })

  it('a scan made offline (no Result) is a waiting row', async () => {
    const h = setup({ submit: vi.fn(async () => null) })
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    expect(rows(h)[0]).toMatchObject({ waiting: true, name: 'Mutti passata 700 g' })
  })

  it('a scan the server rejects is not a row (the banner says why)', async () => {
    const h = setup({ submit: vi.fn(async (op: Op): Promise<ScanResult> => ({ clientUuid: op.clientUuid, status: 'rejected', error: { code: 'x', message: 'no' } })) })
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    expect(rows(h)).toEqual([])
    expect(flow(h).banner?.tone).toBe('warn')
  })

  it('the sync Result of a waiting scan settles its row', async () => {
    const h = setup({ submit: vi.fn(async () => null) })
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    act(() => flow(h).applySyncResults([okResult(scanOp('uuid-1', passata), passata, { onList: true, ticked: true })]))
    expect(rows(h)[0]).toMatchObject({ waiting: false, ticked: true })
  })

  it('a rejected sync Result takes the waiting row away', async () => {
    const h = setup({ submit: vi.fn(async () => null) })
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    act(() => flow(h).applySyncResults([{ clientUuid: 'uuid-1', status: 'rejected', error: { code: 'x', message: 'no' } }]))
    expect(rows(h)).toEqual([])
  })

  it('says "Added Mutti passata 700 g" with Undo for 5 s', async () => {
    const h = setup()
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    const [message, status, options] = lastNotify(h)
    expect([message, status]).toEqual(['Added Mutti passata 700 g', 'success'])
    expect(options).toMatchObject({ actionLabel: 'Undo', durationMs: 5000 })
  })

  it('the Undo of that toast undoes that scan on the server and takes it off the row', async () => {
    const h = setup()
    await waitFor(() => expect(h.hook.result.current.session.loaded).toBe(true))
    await scanCode(h)
    await scanCode(h)
    await act(async () => lastNotify(h)[2]!.onAction!())
    expect(h.deps.undo).toHaveBeenCalledWith('uuid-2')
    expect(rows(h)[0]?.clientUuids).toEqual(['uuid-1'])
  })
})

describe('+ and − on the active row', () => {
  it('+ sends a new shop_scan Op for the same Product (no camera), at the row\'s Price', async () => {
    const h = setup()
    await seed(h, [applied('a', passata, { priceCents: 150 })])
    await act(async () => flow(h).increment('7'))
    expect(h.deps.submit).toHaveBeenCalledWith(expect.objectContaining({ clientUuid: 'uuid-1', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700, priceCents: 150 }))
    expect(rows(h)[0]?.count).toBe(2)
  })

  it('+ on a row with no Price uses the last Price at this Shop', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    await act(async () => flow(h).increment('7'))
    expect(h.deps.submit.mock.calls[0]![0].priceCents).toBe(129)
  })

  it('+ does nothing on a weighed row', async () => {
    const h = setup()
    await seed(h, [applied('a', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 })])
    await act(async () => flow(h).increment('21'))
    expect(h.deps.submit).not.toHaveBeenCalled()
  })

  it('− at ×2 undoes the latest scan on the server and keeps the row', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', passata)])
    await act(async () => flow(h).decrement('7'))
    expect(h.deps.undo).toHaveBeenCalledWith('b')
    expect(rows(h)[0]).toMatchObject({ count: 1, clientUuids: ['a'] })
  })

  it('− on a scan still in the offline queue drops it from the queue and does not call the server', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), { op: scanOp('b', passata), result: null }])
    await act(async () => flow(h).decrement('7'))
    expect(h.deps.cancelQueued).toHaveBeenCalledWith('b')
    expect(h.deps.undo).not.toHaveBeenCalled()
    expect(rows(h)[0]?.count).toBe(1)
  })

  it('− on a queued scan that already left the queue asks the server to Undo it', async () => {
    const h = setup({ cancelQueued: vi.fn(async () => false) })
    await seed(h, [applied('a', passata), { op: scanOp('b', passata), result: null }])
    await act(async () => flow(h).decrement('7'))
    expect(h.deps.undo).toHaveBeenCalledWith('b')
  })

  it('a server 404 on Undo (it never had the Op) still takes the scan off', async () => {
    const h = setup({ undo: vi.fn(async () => { throw new ApiError(404, 'not_found', 'no') }) })
    await seed(h, [applied('a', passata), applied('b', passata)])
    await act(async () => flow(h).decrement('7'))
    expect(rows(h)[0]?.count).toBe(1)
  })

  it('a failing Undo keeps the row and says so', async () => {
    const h = setup({ undo: vi.fn(async () => { throw new ApiError(409, 'not_undoable', 'Already used') }) })
    await seed(h, [applied('a', passata), applied('b', passata)])
    await act(async () => flow(h).decrement('7'))
    expect(rows(h)[0]?.count).toBe(2)
    expect(lastNotify(h).slice(0, 2)).toEqual(['Already used', 'error'])
  })

  it('− at ×1 is Remove', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    await act(async () => flow(h).decrement('7'))
    expect(h.deps.undo).toHaveBeenCalledWith('a')
    expect(rows(h)).toEqual([])
  })
})

describe('Remove', () => {
  it('×1 removes at once with "Removed {product}" and Put back', async () => {
    const h = setup()
    await seed(h, [applied('a', passata, { priceCents: 150 })])
    await act(async () => flow(h).removeRow('7'))
    expect(h.deps.undo).toHaveBeenCalledWith('a')
    expect(rows(h)).toEqual([])
    expect(flow(h).sheet).toBeNull()
    const [message, , options] = lastNotify(h)
    expect(message).toBe('Removed Mutti passata 700 g')
    expect(options?.actionLabel).toBe('Put back')
  })

  it('Put back sends a new Op for the Product', async () => {
    const h = setup()
    await seed(h, [applied('a', passata, { priceCents: 150 })])
    await act(async () => flow(h).removeRow('7'))
    await act(async () => lastNotify(h)[2]!.onAction!())
    expect(h.deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_scan', productId: 7, priceCents: 150 }))
    expect(h.deps.submit.mock.calls[0]![0].clientUuid).not.toBe('a')
    expect(rows(h)[0]?.count).toBe(1)
  })

  it('×2 or more asks first: nothing is undone and the dialog names the row', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', passata), applied('c', passata)])
    await act(async () => flow(h).removeRow('7'))
    expect(flow(h).sheet).toMatchObject({ kind: 'confirm_remove', key: '7', name: 'Mutti passata 700 g', count: 3 })
    expect(flow(h).paused).toBe(true)
    expect(h.deps.undo).not.toHaveBeenCalled()
    expect(rows(h)[0]?.count).toBe(3)
  })

  it('"Keep them" (closeSheet) leaves the row alone', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', passata)])
    await act(async () => flow(h).removeRow('7'))
    act(() => flow(h).closeSheet())
    expect(flow(h).sheet).toBeNull()
    expect(rows(h)[0]?.count).toBe(2)
  })

  it('"Remove" (confirmRemove) undoes every scan of the row, latest first, and clears it', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', passata), { op: scanOp('c', passata), result: null }])
    await act(async () => flow(h).removeRow('7'))
    await act(async () => flow(h).confirmRemove())
    expect(h.deps.cancelQueued).toHaveBeenCalledWith('c')
    expect(h.deps.undo.mock.calls.map((c: unknown[]) => c[0])).toEqual(['b', 'a'])
    expect(rows(h)).toEqual([])
    expect(flow(h).sheet).toBeNull()
  })

  it('leaves other rows alone', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', toiletPaper)])
    await act(async () => flow(h).removeRow('7'))
    expect(rows(h).map((r) => r.key)).toEqual(['31'])
  })
})

describe('Price entry in the flow', () => {
  const entry = (packCents: number | null, over: Partial<{ basis: 'pack' | 'perKg'; cents: number | null; perKgCents: number | null }> = {}) => ({ basis: 'pack' as const, cents: packCents, packCents, perKgCents: null, ...over })

  it('opening it pauses the camera on that row; closing it resumes', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    act(() => flow(h).startPriceEntry('7'))
    expect(flow(h).pricing).toEqual({ key: '7' })
    expect(flow(h).paused).toBe(true)
    act(() => flow(h).closePriceEntry())
    expect(flow(h).pricing).toBeNull()
    expect(flow(h).paused).toBe(false)
  })

  it('"+1 without a Price" (no key) starts on the first row without a Price, top to bottom', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', toiletPaper, { priceCents: 890 }), applied('c', cheese)])
    act(() => flow(h).startPriceEntry())
    expect(flow(h).pricing).toEqual({ key: '21' })
  })

  it('with every row priced it starts nothing', async () => {
    const h = setup()
    await seed(h, [applied('a', passata, { priceCents: 129 })])
    act(() => flow(h).startPriceEntry())
    expect(flow(h).pricing).toBeNull()
  })

  it('Save sends one PATCH for all applied scans of the row, sets the row\'s Prices and ends the entry', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', passata)])
    act(() => flow(h).startPriceEntry('7'))
    let outcome: unknown
    await act(async () => { outcome = await flow(h).savePrice('7', entry(145), 'save') })
    expect(outcome).toEqual({ status: 'saved' })
    expect(h.deps.setPrices).toHaveBeenCalledTimes(1)
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a', 'b'], priceCents: 145 })
    expect(rows(h)[0]).toMatchObject({ priceCents: 145, totalCents: 290, needsPrice: false })
    expect(flow(h).pricing).toBeNull()
  })

  it('per kg sends pricePerKgCents with the pack Price it implies', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    await act(async () => { await flow(h).savePrice('7', entry(140, { basis: 'perKg', cents: 200, perKgCents: 200 }), 'save') })
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a'], priceCents: 140, pricePerKgCents: 200 })
  })

  it('takes the Prices the server answered (a weighed scan is priced by its weight)', async () => {
    const setPrices = vi.fn(async (): Promise<ScanResult[]> => [{ clientUuid: 'a', status: 'applied', scan: { ...okResult(scanOp('a', cheese), cheese).scan!, quantity: 312, priceCents: 624 } }])
    const h = setup({ setPrices } as Partial<ScanFlowDeps>)
    await seed(h, [applied('a', cheese, { quantity: 312, weighed: true })])
    await act(async () => { await flow(h).savePrice('21', entry(2000, { basis: 'perKg', cents: 2000, perKgCents: 2000 }), 'save') })
    expect(rows(h)[0]).toMatchObject({ totalCents: 624, perKgCents: 2000 })
  })

  it('a row still waiting to sync edits its queued scans and sends no PATCH', async () => {
    const h = setup()
    await seed(h, [{ op: scanOp('a', passata), result: null }])
    await act(async () => { await flow(h).savePrice('7', entry(145), 'save') })
    expect(h.deps.setQueuedPrice.mock.calls[0]!.slice(0, 2)).toEqual(['a', 145])
    expect(h.deps.setPrices).not.toHaveBeenCalled()
    expect(rows(h)[0]).toMatchObject({ priceCents: 145, needsPrice: false })
  })

  it('a mixed row: the queue for the queued scan, one PATCH for the applied ones only', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), { op: scanOp('b', passata), result: null }])
    await act(async () => { await flow(h).savePrice('7', entry(145), 'save') })
    expect(h.deps.setQueuedPrice.mock.calls[0]!.slice(0, 2)).toEqual(['b', 145])
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a'], priceCents: 145 })
    expect(rows(h)[0]).toMatchObject({ totalCents: 290 })
  })

  it('a queued scan that left the queue meanwhile (the queue says false) goes to the server with the applied ones', async () => {
    const h = setup({ setQueuedPrice: vi.fn(async () => false) })
    await seed(h, [applied('a', passata), { op: scanOp('b', passata), result: null }])
    await act(async () => { await flow(h).savePrice('7', entry(145), 'save') })
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a', 'b'], priceCents: 145 })
  })

  it('a weighed queued scan that left the queue is sent with the row\'s pack Price, not its own weighed Price (review)', async () => {
    const h = setup({ setQueuedPrice: vi.fn(async () => false) })
    await seed(h, [{ op: scanOp('a', cheese, { quantity: 312, weighed: true }), result: null }])
    await act(async () => { await flow(h).savePrice('21', entry(2000, { basis: 'perKg', cents: 2000, perKgCents: 2000 }), 'save') })
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a'], priceCents: 2000, pricePerKgCents: 2000 })
  })

  it('a folded scan keeps its new Price when its flush Result arrives afterwards (review)', async () => {
    const h = setup({ setQueuedPrice: vi.fn(async () => false) })
    const op = scanOp('b', passata)
    await seed(h, [{ op, result: null }])
    await act(async () => { await flow(h).savePrice('7', entry(145), 'save') })
    act(() => flow(h).applySyncResults([okResult(op, passata, { priceCents: null })]))
    expect(rows(h)[0]).toMatchObject({ priceCents: 145, needsPrice: false, waiting: false })
  })

  it('Next saves this row and moves to the next row without a Price', async () => {
    const h = setup()
    await seed(h, [applied('a', passata), applied('b', toiletPaper), applied('c', cheese)])
    // newest first: cheese, toilet paper, passata
    act(() => flow(h).startPriceEntry('21'))
    await act(async () => { await flow(h).savePrice('21', entry(500), 'next') })
    expect(flow(h).pricing).toEqual({ key: '31' })
    await act(async () => { await flow(h).savePrice('31', entry(890), 'next') })
    expect(flow(h).pricing).toEqual({ key: '7' })
    await act(async () => { await flow(h).savePrice('7', entry(129), 'next') })
    expect(flow(h).pricing).toBeNull()
  })

  it('a refused value says "Enter a number above 0", sends nothing and keeps the entry open', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    act(() => flow(h).startPriceEntry('7'))
    let outcome: unknown
    await act(async () => { outcome = await flow(h).savePrice('7', entry(0), 'save') })
    expect(outcome).toEqual({ status: 'refused', error: 'Enter a number above 0' })
    expect(h.deps.setPrices).not.toHaveBeenCalled()
    expect(flow(h).pricing).toEqual({ key: '7' })
  })

  it('Close with nothing typed discards: nothing is sent and the entry ends', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    act(() => flow(h).startPriceEntry('7'))
    let outcome: unknown
    await act(async () => { outcome = await flow(h).savePrice('7', { basis: 'pack', cents: null, packCents: null, perKgCents: null }, 'close') })
    expect(outcome).toEqual({ status: 'discarded' })
    expect(h.deps.setPrices).not.toHaveBeenCalled()
    expect(flow(h).pricing).toBeNull()
    expect(rows(h)[0]?.needsPrice).toBe(true)
  })

  it('Close with a valid amount saves it', async () => {
    const h = setup()
    await seed(h, [applied('a', passata)])
    await act(async () => { await flow(h).savePrice('7', entry(145), 'close') })
    expect(h.deps.setPrices).toHaveBeenCalledWith({ clientUuids: ['a'], priceCents: 145 })
    expect(flow(h).pricing).toBeNull()
  })

  it.each([[404, 'not_found'], [409, 'already_undone'], [409, 'not_undoable'], [422, 'invalid_price']])('a %i %s from the server changes nothing and says why', async (status, code) => {
    const h = setup({ setPrices: vi.fn(async () => { throw new ApiError(status, code, 'The server said no') }) } as Partial<ScanFlowDeps>)
    await seed(h, [applied('a', passata)])
    act(() => flow(h).startPriceEntry('7'))
    let outcome: unknown
    await act(async () => { outcome = await flow(h).savePrice('7', entry(145), 'save') })
    expect(outcome).toEqual({ status: 'failed', error: 'The server said no' })
    expect(rows(h)[0]?.needsPrice).toBe(true)
    expect(lastNotify(h).slice(0, 2)).toEqual(['The server said no', 'error'])
    expect(flow(h).pricing).toEqual({ key: '7' })
  })
})

describe('the flow without a session (Stock-take)', () => {
  it('still works with no session dependency', async () => {
    const deps = { mode: 'stocktake', shop: null, offline, currency: 'USD', system: 'metric', submit: vi.fn(), cancelQueued: vi.fn(), undo: vi.fn(), setPrice: vi.fn(), feedback: { confirm: vi.fn(), reject: vi.fn() } } as unknown as ScanFlowDeps
    const hook = renderHook(() => useScanFlow(deps))
    await act(async () => hook.result.current.onScan(parse('8000500310427', 'ean_13')))
    expect(hook.result.current.sheet?.kind).toBe('stock_take')
  })
})
