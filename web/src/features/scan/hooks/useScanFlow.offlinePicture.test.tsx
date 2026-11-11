// PPX: the flow hands the Blob picked on the offline form to the queue next to the Op (the Op itself carries no image id yet: the queue
// uploads the Blob and fills productImage on sync).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RawImage } from '../../../ui'
import { parse } from '../lib/barcode'
import { emptyForm, type UnknownFormValues } from '../lib/unknownForm'
import type { OfflineData, Op, ScanResult } from '../types'
import { useScanFlow, type ScanFlowDeps } from './useScanFlow'

const offline: OfflineData = { shopId: 1, shopName: 'Coop', products: [], catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} } }
const blob = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
const local: RawImage = { kind: 'blob', blob, width: 1600, height: 1200, type: 'image/jpeg', origin: 'file' }
const form = (over: Partial<UnknownFormValues> = {}): UnknownFormValues => ({
  ...emptyForm(), ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, packSize: '400', packUnit: 'g', productName: 'Tinned tomatoes 400 g', ...over,
})

function setup(result: ScanResult | null = null) {
  let n = 0
  const submit = vi.fn(async (_op: Op, _picture?: Blob): Promise<ScanResult | null> => result)
  const deps: ScanFlowDeps = {
    mode: 'shop', shop: { id: 1, name: 'Coop' }, offline, currency: 'USD', system: 'metric', rangeTo: '2026-11-15',
    submit, cancelQueued: vi.fn(async () => true), undo: vi.fn(async () => {}), setPrice: vi.fn(async () => {}), setQueuedPrice: vi.fn(async () => true),
    feedback: { confirm: vi.fn(), reject: vi.fn() }, newUuid: () => `uuid-${++n}`, now: () => new Date('2026-11-09T12:00:00Z'),
  }
  const hook = renderHook(() => useScanFlow(deps))
  return { submit, hook }
}
async function save(hook: ReturnType<typeof setup>['hook'], values: UnknownFormValues) {
  await act(async () => hook.result.current.onScan(parse('5012345678900', 'ean_13')))
  await act(async () => hook.result.current.saveUnknown(values))
}

describe('useScanFlow.saveUnknown with an offline Picture', () => {
  it('submits the Op without an image id and the Blob as the second argument', async () => {
    const { submit, hook } = setup()
    await save(hook, form({ picture: local }))
    expect(submit).toHaveBeenCalledTimes(1)
    const [op, picture] = submit.mock.calls[0] as [Op, Blob | undefined]
    expect(op).toMatchObject({ kind: 'shop_unknown', barcode: '05012345678900' })
    expect(op.productImage).toBeUndefined()
    expect(picture).toBe(blob)
  })

  it('submits no Blob when the form has none', async () => {
    const { submit, hook } = setup()
    await save(hook, form())
    expect(submit.mock.calls[0]).toHaveLength(1) // submit(op): the existing useScanFlow tests pin toHaveBeenCalledWith(op)
  })

  it('an uploaded image id wins: it goes on the Op and no Blob is queued', async () => {
    const { submit, hook } = setup()
    await save(hook, form({ image: 'd'.repeat(32), picture: local }))
    const [op, picture] = submit.mock.calls[0] as [Op, Blob | undefined]
    expect(op.productImage).toBe('d'.repeat(32))
    expect(picture).toBeUndefined()
  })

  it('a pasted link (no Blob) is never queued', async () => {
    const { submit, hook } = setup()
    await save(hook, form({ picture: { kind: 'url', url: 'https://example.test/tin.jpg' } }))
    expect(submit.mock.calls[0]?.[1]).toBeUndefined()
    expect((submit.mock.calls[0]?.[0] as Op).productImage).toBeUndefined()
  })

  it('the scan line shows the queued scan as waiting, as for any offline form', async () => {
    const { hook } = setup(null)
    await save(hook, form({ picture: local }))
    expect(hook.result.current.feedback).toMatchObject({ queued: true, productName: 'Tinned tomatoes 400 g' })
  })
})
