// B9-41 (SSP-07, SSP-15): the flow marks a new weighed Product's scan as weighed (so its row is a weighed row and its keypad opens on per kg),
// and flags an unknown in-store code at a Shop that has no Weight Barcode Rule (the sheet then says so).
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from '../lib/barcode'
import { emptyForm } from '../lib/unknownForm'
import type { OfflineData, Op, ScanApplied, ScanResult } from '../types'
import type { ScannedList } from './useScannedList'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const rule = { id: 3, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight' as const, valueUnit: 'g' as const, decimalPlaces: 0 }
const offlineWith = (weightRules: OfflineData['catalog']['weightRules']): OfflineData => ({
  shopId: 1,
  shopName: 'Coop',
  products: [{ id: 21, name: 'Loose cheese', ingredientId: 5, ingredientName: 'Cheese', baseUnit: 'g', packSize: 1000, lastPriceCents: null }],
  catalog: { globalBarcodes: {}, weightRules, weightProducts: {} },
})
const created = (uuid: string): ScanResult => ({
  clientUuid: uuid,
  status: 'applied',
  scan: { ingredientId: 5, ingredientName: 'Cheese', baseUnit: 'g', productId: 21, productName: 'Loose cheese', quantity: 500, lotId: 11, priceCents: null, onList: false, remaining: 0, ticked: false, productCreated: true } as ScanApplied,
})

function setup(weightRules: OfflineData['catalog']['weightRules'], over: Partial<ScanFlowDeps> = {}) {
  const session = { entries: [], rows: [], record: vi.fn(), settle: vi.fn(), drop: vi.fn(), reprice: vi.fn(), update: vi.fn(), clear: vi.fn() } as unknown as ScannedList
  const deps: ScanFlowDeps = {
    mode: 'shop',
    shop: { id: 1, name: 'Coop' },
    offline: offlineWith(weightRules),
    currency: 'USD',
    system: 'metric',
    rangeTo: '2026-11-15',
    submit: vi.fn(async (op: Op) => created(op.clientUuid)),
    cancelQueued: vi.fn(async () => true),
    undo: vi.fn(async () => {}),
    setPrice: vi.fn(async () => {}),
    session,
    feedback: { confirm: vi.fn(), reject: vi.fn() },
    newUuid: () => 'uuid-1',
    now: () => new Date('2026-11-09T12:00:00Z'),
    ...over,
  }
  const hook = renderHook(() => useScanFlow(deps))
  return { deps, hook, session }
}
const read = (hook: ReturnType<typeof setup>['hook'], code: string) => act(async () => hook.result.current.onScan(parse(code, 'ean_13')))

beforeEach(() => vi.clearAllMocks())

describe('useScanFlow: a new weighed Product (SSP-07)', () => {
  it('saving a weighed code sends and records a weighed shop_unknown Op, so the new row is a weighed row', async () => {
    const { deps, hook, session } = setup([rule])
    await read(hook, '2100009005001')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'weighed', target: { mode: 'weighed', itemCode: '00009', weightGrams: 500 } })
    await act(() => hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { id: 5, name: 'Cheese', baseUnit: 'g' }, productName: 'Loose cheese' }))
    expect(deps.submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_unknown', ruleId: 3, itemCode: '00009', quantity: 500, weighed: true }))
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shop_unknown', weighed: true }), expect.anything())
  })

  it('the Price entry that follows opens on the new row (the sheet\'s onAdded asks for it by `new:<uuid>`)', async () => {
    const { hook } = setup([rule])
    await read(hook, '2100009005001')
    await act(() => hook.result.current.saveUnknown({ ...emptyForm(), ingredient: { id: 5, name: 'Cheese', baseUnit: 'g' }, productName: 'Loose cheese' }))
    act(() => hook.result.current.startPriceEntry('new:uuid-1'))
    expect(hook.result.current.pricing).toEqual({ key: 'new:uuid-1' })
  })
})

describe('useScanFlow: a weight-style code with no Weight Barcode Rule (SSP-15)', () => {
  it('an unknown in-store code at a Shop with no rule opens the sheet flagged for the hint', async () => {
    const { deps, hook } = setup([])
    await read(hook, '2100123012503')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: '02100123012503' }, weightCodeHint: true })
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('so does a code with the 02 lead', async () => {
    const { hook } = setup([])
    await read(hook, '0200000012342')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', weightCodeHint: true })
  })

  it('a Shop with a rule gives no hint, even for a code the rule does not read (its prefix is 21; this is 20)', async () => {
    const { hook } = setup([rule])
    await read(hook, '2000123003122')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack' })
    expect((hook.result.current.sheet as { weightCodeHint?: boolean }).weightCodeHint).toBeFalsy()
  })

  it('an ordinary unknown code gives no hint, with or without rules', async () => {
    const { hook } = setup([])
    await read(hook, '4006381333931')
    expect(hook.result.current.sheet).toMatchObject({ kind: 'unknown', mode: 'pack' })
    expect((hook.result.current.sheet as { weightCodeHint?: boolean }).weightCodeHint).toBeFalsy()
  })

  it('the hint is only for the sheet of that code: after it closes and another code opens, the flag is that code\'s', async () => {
    const { hook } = setup([])
    await read(hook, '2100123012503')
    act(() => hook.result.current.closeSheet())
    await read(hook, '4006381333931')
    expect((hook.result.current.sheet as { weightCodeHint?: boolean }).weightCodeHint).toBeFalsy()
  })
})
