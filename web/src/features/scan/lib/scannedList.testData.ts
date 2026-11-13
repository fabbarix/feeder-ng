// Fixtures for the Scanned list tests (SR3): server-shaped Ops, Results and offline Products.
import type { OfflineProduct, Op, ScanApplied, ScanResult } from '../types'
import type { SessionEntry } from './scannedList'

export const passata: OfflineProduct = {
  id: 7,
  name: 'Mutti passata 700 g',
  ingredientId: 2,
  ingredientName: 'Passata',
  baseUnit: 'g',
  packSize: 700,
  lastPriceCents: 129,
  lastPriceDate: '2026-11-03',
  ingredientKind: 'food',
}
export const toiletPaper: OfflineProduct = {
  id: 31,
  name: 'Regina toilet paper 9 pieces',
  ingredientId: 12,
  ingredientName: 'Toilet paper',
  baseUnit: 'piece',
  packSize: 9,
  lastPriceCents: null,
  ingredientKind: 'supply',
}
export const cheese: OfflineProduct = {
  id: 21,
  name: 'Loose cheese',
  ingredientId: 5,
  ingredientName: 'Cheese',
  baseUnit: 'g',
  packSize: 1000,
  lastPriceCents: null,
  ingredientKind: 'food',
  imageUrl: '/api/images/cheese',
}
export const products = [passata, toiletPaper, cheese]

export const scanOp = (uuid: string, p: OfflineProduct, over: Partial<Op> = {}): Op => ({
  clientUuid: uuid,
  scannedAt: '2026-11-13T10:00:00.000Z',
  kind: 'shop_scan',
  shopId: 1,
  rangeTo: '2026-11-15',
  productId: p.id,
  quantity: p.packSize,
  ...over,
})

export const appliedScan = (p: OfflineProduct, over: Partial<ScanApplied> = {}): ScanApplied => ({
  ingredientId: p.ingredientId,
  ingredientName: p.ingredientName,
  ingredientKind: p.ingredientKind,
  baseUnit: p.baseUnit,
  productId: p.id,
  productName: p.name,
  quantity: p.packSize,
  lotId: 11,
  priceCents: null,
  onList: false,
  remaining: 0,
  ticked: false,
  productCreated: false,
  ...over,
})

export const okResult = (op: Op, p: OfflineProduct, over: Partial<ScanApplied> = {}): ScanResult => ({
  clientUuid: op.clientUuid,
  status: 'applied',
  scan: appliedScan(p, { quantity: op.quantity ?? p.packSize, priceCents: op.priceCents ?? null, ...over }),
})

/** An applied entry: the Op and the server's Result for it. */
export const applied = (uuid: string, p: OfflineProduct, opOver: Partial<Op> = {}, scanOver: Partial<ScanApplied> = {}): SessionEntry => {
  const op = scanOp(uuid, p, opOver)
  return { op, result: okResult(op, p, scanOver) }
}
/** A queued entry: the Op waits in the offline queue, no Result yet. */
export const queued = (uuid: string, p: OfflineProduct, opOver: Partial<Op> = {}): SessionEntry => ({ op: scanOp(uuid, p, opOver), result: null })
