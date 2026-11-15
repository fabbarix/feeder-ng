// B9-41 (SSP-11): the "To get n" count of Scan counts the open manual extras too, so it equals the Shop's "left".
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { createSessionStore } from '../lib/sessionStore'
import { products } from '../lib/scannedList.testData'
import type { OfflineData } from '../types'
import { useScannedList } from './useScannedList'

const offline: OfflineData = { shopId: 1, shopName: 'Coop', catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} }, products }

describe('useScannedList: To get with extras', () => {
  it('toGetCount is the open Lines plus the open extras (a ticked extra is not counted)', async () => {
    const list = makeList({ lines: [makeLine(), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })], extras: [makeExtra({ id: 1 }), makeExtra({ id: 2, text: 'candles', ticked: true }), makeExtra({ id: 3, text: 'napkins' })] })
    const store = createSessionStore(createMemorySnapshotStore())
    const { result } = renderHook(() => useScannedList({ shopId: 1, day: '2026-11-13', store, offline, list, system: 'metric' }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.toGetCount).toBe(4)
    expect(result.current.toGet).toHaveLength(2)
  })
})
