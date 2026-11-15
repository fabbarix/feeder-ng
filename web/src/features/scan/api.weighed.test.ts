// B9-41 (SSP-07): a new weighed Product's shop_unknown Op is weighed on the phone, but the server takes `weighed` on a shop_scan only
// ("only a shop scan can be weighed"), so the flag never goes over the wire on any other kind.
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createScanApi, wireOps } from './api'
import type { Op } from './types'

const base = { clientUuid: 'u-1', scannedAt: '2026-11-14T10:00:00Z', shopId: 2 }
const unknownOp: Op = { ...base, kind: 'shop_unknown', ruleId: 3, itemCode: '00123', quantity: 312, weighed: true, productName: 'Loose cheese' }
const shopScan: Op = { ...base, clientUuid: 'u-2', kind: 'shop_scan', productId: 7, quantity: 312, weighed: true }

describe('wireOps', () => {
  it('drops weighed from a shop_unknown Op and keeps everything else', () => {
    const [sent] = wireOps([unknownOp])
    expect(sent).not.toHaveProperty('weighed')
    expect(sent).toMatchObject({ kind: 'shop_unknown', ruleId: 3, itemCode: '00123', quantity: 312 })
  })

  it('keeps weighed on a shop_scan, and leaves the Ops it was given unchanged', () => {
    expect(wireOps([shopScan])[0]).toBe(shopScan)
    wireOps([unknownOp])
    expect(unknownOp.weighed).toBe(true)
  })

  it('sync and apply send the wire form', async () => {
    const post = vi.fn(async () => ({ results: [] }))
    const api = createScanApi({ post } as unknown as HttpClient, { timeoutSignal: () => new AbortController().signal })
    await api.sync([unknownOp, shopScan])
    await api.apply(unknownOp)
    const synced = (post.mock.calls[0] as unknown[])[1] as { ops: Op[] }
    expect(synced.ops[0]).not.toHaveProperty('weighed')
    expect(synced.ops[1]).toHaveProperty('weighed', true)
    expect((post.mock.calls[1] as unknown[])[1]).not.toHaveProperty('weighed')
  })
})
