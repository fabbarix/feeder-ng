import { describe, expect, it } from 'vitest'
import type { ScanApplied, ScanResult } from '../types'
import { syncNotices } from './notices'

const applied = (over: Partial<ScanApplied>): ScanApplied => ({
  ingredientId: 1,
  ingredientName: 'tinned tomatoes',
  baseUnit: 'g',
  productId: 50,
  productName: 'Tinned tomatoes 400 g',
  quantity: 400,
  lotId: 1,
  priceCents: null,
  onList: false,
  remaining: 0,
  ticked: false,
  productCreated: false,
  ...over,
})

const ok = (uuid: string, scan: Partial<ScanApplied> = {}): ScanResult => ({ clientUuid: uuid, status: 'applied', scan: applied(scan) })

describe('syncNotices', () => {
  it('has nothing to say about plain results', () => {
    expect(syncNotices([ok('a'), { clientUuid: 'b', status: 'duplicate', scan: applied({}) }])).toEqual([])
  })

  it('tells about a barcode that someone else had already created', () => {
    const notices = syncNotices([ok('a', { productId: 50, merged: { productId: 50, productName: 'Tinned tomatoes 400 g' } })])
    expect(notices).toEqual([
      { kind: 'merged', clientUuid: 'a', text: 'Someone already added this barcode; yours was merged into Tinned tomatoes 400 g' },
    ])
  })

  it('is silent when the Product was created earlier in the same batch', () => {
    const notices = syncNotices([
      ok('a', { productId: 50, productCreated: true }),
      ok('b', { productId: 50, merged: { productId: 50, productName: 'Tinned tomatoes 400 g' } }),
    ])
    expect(notices).toEqual([])
  })

  it('still tells about a merge into a Product from another batch', () => {
    const notices = syncNotices([ok('a', { productId: 60, productCreated: true }), ok('b', { productId: 50, merged: { productId: 50, productName: 'Tomatoes' } })])
    expect(notices.map((n) => n.clientUuid)).toEqual(['b'])
  })

  it('reports a rejected operation with the server message', () => {
    const notices = syncNotices([{ clientUuid: 'x', status: 'rejected', error: { code: 'unknown_product', message: 'that Product was deleted' } }])
    expect(notices).toEqual([{ kind: 'rejected', clientUuid: 'x', text: "Couldn't sync a scan: that Product was deleted" }])
  })
})
