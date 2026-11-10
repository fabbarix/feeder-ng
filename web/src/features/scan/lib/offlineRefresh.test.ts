import { describe, expect, it } from 'vitest'
import type { ScanApplied, ScanResult } from '../types'
import { shouldRefreshOfflineData } from './offlineRefresh'

const scan = (over: Partial<ScanApplied> = {}): ScanApplied => ({
  ingredientId: 1,
  ingredientName: 'Tomatoes',
  baseUnit: 'g',
  productId: 50,
  productName: 'Tomatoes 500 g',
  quantity: 500,
  lotId: 1,
  priceCents: null,
  onList: false,
  remaining: 0,
  ticked: false,
  productCreated: false,
  ...over,
})
const applied = (over: Partial<ScanApplied> = {}): ScanResult => ({ clientUuid: 'a', status: 'applied', scan: scan(over) })

describe('shouldRefreshOfflineData', () => {
  it('is true after a scan created a Product, so a second scan of its barcode resolves', () => {
    expect(shouldRefreshOfflineData([applied({ productCreated: true })])).toBe(true)
  })

  it('is true after a scan was merged into a Product someone else created', () => {
    expect(shouldRefreshOfflineData([applied({ merged: { productId: 50, productName: 'Tomatoes 500 g' } })])).toBe(true)
  })

  it('is true when only one of several results created a Product', () => {
    expect(shouldRefreshOfflineData([applied(), applied({ productCreated: true }), { clientUuid: 'z', status: 'rejected' }])).toBe(true)
  })

  it('is false for plain scans, Stock-takes, duplicates and rejections', () => {
    expect(shouldRefreshOfflineData([])).toBe(false)
    expect(shouldRefreshOfflineData([applied(), applied({ total: 1200 }), { clientUuid: 'd', status: 'duplicate', scan: scan() }, { clientUuid: 'r', status: 'rejected' }])).toBe(false)
  })
})
