import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import { emptyForm } from '../lib/unknownForm'
import type { OfflineData, Op, ScanApplied, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const offline: OfflineData = {
  shopId: 1,
  shopName: 'Coop',
  products: [
    { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159 },
    { id: 21, name: 'Loose cheese', ingredientId: 5, ingredientName: 'cheese', baseUnit: 'g', packSize: 1000, lastPriceCents: null },
  ],
  catalog: {
    globalBarcodes: { '08000500310427': 7 },
    weightRules: [
      { id: 3, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'g', decimalPlaces: 0 },
      { id: 4, prefix: '22', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'price', decimalPlaces: 0 },
    ],
    weightProducts: { '4:00007': 21 },
  },
}

const applied = (over: Partial<ScanApplied> = {}): ScanApplied => ({
  ingredientId: 2,
  ingredientName: 'Passata',
  baseUnit: 'g',
  productId: 7,
  productName: 'Mutti passata 700 g',
  quantity: 700,
  lotId: 11,
  priceCents: 159,
  onList: true,
  remaining: 700,
  ticked: false,
  productCreated: false,
  ...over,
})
const ok = (uuid: string, scan: Partial<ScanApplied> = {}): ScanResult => ({ clientUuid: uuid, status: 'applied', scan: applied(scan) })

function setup(over: Partial<ScanFlowDeps> = {}) {
  let n = 0
  const deps: ScanFlowDeps = {
    mode: 'shop',
    shop: { id: 1, name: 'Coop' },
    offline,
    currency: 'USD',
    system: 'metric',
    rangeTo: '2026-11-15',
    submit: vi.fn(async (op: Op) => ok(op.clientUuid)),
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    newUuid: () => `uuid-${++n}`,
    now: () => new Date('2026-11-09T12:00:00Z'),
    ...over,
  }
  const hook = renderHook(() => useScanFlow(deps))
  return { deps, hook }
}

const scan = (code: string, format: 'ean_13' | 'qr_code' = 'ean_13') => parse(code, format)

async function read(hook: ReturnType<typeof setup>['hook'], code: string, format: 'ean_13' | 'qr_code' = 'ean_13') {
  await act(async () => hook.result.current.onScan(scan(code, format)))
}

beforeEach(() => vi.clearAllMocks())

describe('useScanFlow in a Shop', () => {
  it('turns a known Product into a Shop scan with the last price prefilled', async () => {
    const { deps, hook } = setup()
    await read(hook, '8000500310427')
    expect(deps.submit).toHaveBeenCalledWith({
      clientUuid: 'uuid-1',
      scannedAt: '2026-11-09T12:00:00.000Z',
      kind: 'shop_scan',
      shopId: 1,
      rangeTo: '2026-11-15',
      productId: 7,
      quantity: 700,
      priceCents: 159,
    })
    expect(deps.feedback.confirm).toHaveBeenCalledTimes(1)
  })
  it('a rejected Result shows a warning and a failure buzz', async () => {
    const rejected: ScanResult = { clientUuid: 'uuid-1', status: 'rejected', error: { code: 'unknown_product', message: 'that Product was deleted' } }
    const { deps, hook } = setup({ submit: vi.fn(async () => rejected) })
    await read(hook, '8000500310427')
    expect(hook.result.current.banner).toEqual({ tone: 'warn', text: "Couldn't add that Scan: that Product was deleted" })
    expect(deps.feedback.confirm).not.toHaveBeenCalled()
    expect(deps.feedback.reject).toHaveBeenCalled()
  })
  it('an unknown barcode opens the full form and waits', async () => {
    const { deps, hook } = setup()
    await read(hook, '5012345678900')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: '05012345678900' } })
    expect(hook.result.current.paused).toBe(true)
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('saving the form submits a shop_unknown Op and resumes scanning', async () => {
    const { deps, hook } = setup({ submit: vi.fn(async (op: Op) => ok(op.clientUuid, { productCreated: true, ingredientName: 'tinned tomatoes', productName: 'Tinned tomatoes 400 g', quantity: 400, priceCents: null, onList: false })) })
    await read(hook, '5012345678900')
    await act(() =>
      hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, packSize: '400', packUnit: 'g', productName: 'Tinned tomatoes 400 g' }),
    )
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_unknown', barcode: '05012345678900', shopId: 1, quantity: 400, productName: 'Tinned tomatoes 400 g', clientUuid: 'uuid-1' }))
    expect(hook.result.current.sheet).toBeNull()
    expect(hook.result.current.paused).toBe(false)
  })

  it('an unknown item code on a weight rule asks only for the Ingredient and the name', async () => {
    const { hook } = setup()
    await read(hook, '2100009005001')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'weighed', target: { mode: 'weighed', ruleId: 3, itemCode: '00009', weightGrams: 500 } })
  })

  it('an unknown item code on a price rule also asks for the weight', async () => {
    const { hook } = setup()
    await read(hook, '2200009003004')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'weighed_price', target: { mode: 'weighed_price', ruleId: 4, itemCode: '00009', priceCents: 300 } })
  })

  it('a price-valued code with no price per kg asks the weight once, then submits it with the price per kg', async () => {
    const { deps, hook } = setup()
    await read(hook, '2200007002504')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'ask_weight' })
    expect(deps.submit).not.toHaveBeenCalled()
    await act(() => hook.result.current.submitWeight(500))
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_scan', productId: 21, quantity: 500, priceCents: 250, pricePerKgCents: 500 }))
    expect(hook.result.current.sheet).toBeNull()
  })

  it('QR content that is not a product code only shows a message', async () => {
    const { deps, hook } = setup()
    await read(hook, 'https://example.com/menu', 'qr_code')
    expect(hook.result.current.banner).toEqual({ tone: 'info', text: 'Not a product code' })
    expect(deps.submit).not.toHaveBeenCalled()
    expect(deps.feedback.confirm).not.toHaveBeenCalled()
  })

  it('an unreadable code says so and buzzes', async () => {
    const { deps, hook } = setup()
    await read(hook, '8000500310428')
    expect(hook.result.current.banner).toEqual({ tone: 'warn', text: "Couldn't read that, try again" })
    expect(deps.feedback.reject).toHaveBeenCalled()
  })

  it('ignores reads until the offline data has loaded', async () => {
    const { deps, hook } = setup({ offline: null })
    await read(hook, '8000500310427')
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('closing a sheet resumes scanning', async () => {
    const { hook } = setup()
    await read(hook, '5012345678900')
    act(() => hook.result.current.closeSheet())
    expect(hook.result.current.sheet).toBeNull()
    expect(hook.result.current.paused).toBe(false)
  })
})

describe('useScanFlow in Stock-take', () => {
  const stockTake = { mode: 'stocktake' as const, shop: null }

  it('a known Product opens the Stock-take sheet and does not submit', async () => {
    const { deps, hook } = setup(stockTake)
    await read(hook, '8000500310427')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'stock_take', product: { id: 7 } })
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('+1 pack submits a stock_take Op without a Shop and reports the new total', async () => {
    const { deps, hook } = setup({ ...stockTake, submit: vi.fn(async (op: Op) => ok(op.clientUuid, { total: 1400 })) })
    await read(hook, '8000500310427')
    await act(() => hook.result.current.stockTakeAction('plus_pack'))
    const op = (deps.submit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Op
    expect(op).toMatchObject({ kind: 'stock_take', productId: 7, action: 'plus_pack' })
    expect(op).not.toHaveProperty('shopId')
    expect(hook.result.current.sheet).toBeNull()
    expect(hook.result.current.banner).toBeNull() // WP7: the outcome is a toast, see useScanFlow.stocktake.test.tsx
  })

  it('Set total carries the total', async () => {
    const { deps, hook } = setup({ ...stockTake, submit: vi.fn(async (op: Op) => ok(op.clientUuid, { total: 1500 })) })
    await read(hook, '8000500310427')
    await act(() => hook.result.current.stockTakeAction('set_total', 1500))
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stock_take', action: 'set_total', total: 1500 }))
  })

  it('an unknown barcode at home points to a Shop', async () => {
    const { hook } = setup(stockTake)
    await read(hook, '5012345678900')
    expect(hook.result.current.banner).toEqual({ tone: 'info', text: 'Unknown barcode: add it by scanning in a Shop' })
    expect(hook.result.current.sheet).toBeNull()
  })
})
