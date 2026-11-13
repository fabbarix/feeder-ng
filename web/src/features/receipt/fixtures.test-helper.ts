// Fixtures of receipt reading, in the exact JSON the backend sends (internal/receipt/httpapi/dto.go): the mock-up's receipt
// (docs: scan-mockups 15/16). Not a test file.
import type { AddDraft, Proposal, ProposalValue, ReadDone, ReceiptRow, ScanResult } from './types'

export const SHOP_ID = 7
export const READ_ID = 'rd-1'
export const FINGERPRINT = 'fp-abc'
export const UUIDS = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']

export const rows: ReceiptRow[] = [
  { row: 0, productId: 10, product: 'Mutti passata 700 g', barcode: '8005110000001', baseUnit: 'g', packSize: 700, scans: 2, quantity: 1400, weighed: false, priceCents: 129, perKgCents: 0 },
  { row: 1, productId: 11, product: 'Regina toilet paper 9 pieces', barcode: '8005110000002', baseUnit: 'piece', packSize: 9, scans: 1, quantity: 9, weighed: false, priceCents: 0, perKgCents: 0 },
  { row: 2, productId: 12, product: 'Barilla spaghetti n.5 500 g', barcode: '8005110000003', baseUnit: 'g', packSize: 500, scans: 1, quantity: 500, weighed: false, priceCents: 119, perKgCents: 0 },
  { row: 3, productId: 13, product: 'Parmigiano Reggiano', barcode: '', baseUnit: 'g', packSize: 300, scans: 1, quantity: 312, weighed: true, priceCents: 621, perKgCents: 1990 },
  { row: 4, productId: 14, product: 'Granarolo mozzarella 125 g', barcode: '8005110000005', baseUnit: 'g', packSize: 125, scans: 3, quantity: 375, weighed: false, priceCents: 89, perKgCents: 0 },
  { row: 5, productId: 15, product: 'Monini olive oil 1 l', barcode: '8005110000006', baseUnit: 'ml', packSize: 1000, scans: 1, quantity: 1000, weighed: false, priceCents: 890, perKgCents: 0 },
]

const none: ProposalValue = {}
export function proposal(over: Partial<Proposal> & Pick<Proposal, 'id' | 'kind'>): Proposal {
  return { row: -1, line: -1, text: '', checked: false, needsInput: false, before: none, after: none, ...over }
}

export const price0 = proposal({ id: 'price:0', kind: 'price', row: 0, text: 'MUTTI PASSATA 700G 2 x 1,35', checked: true, before: { priceCents: 129 }, after: { priceCents: 135 } })
export const price1 = proposal({ id: 'price:1', kind: 'price', row: 1, text: 'REGINA CARTA IGIENICA 4,49', checked: true, before: {}, after: { priceCents: 449 } })
export const price2 = proposal({ id: 'price:2', kind: 'price', row: 2, text: 'BARILLA SPAGHETTI 5 1,29', checked: true, before: { priceCents: 119 }, after: { priceCents: 129 } })
export const weight3 = proposal({ id: 'weight:3', kind: 'weight', row: 3, text: 'PARMIGIANO R. 0,318 kg x 20,00', checked: true, before: { grams: 312 }, after: { grams: 318, priceCents: 636 } })
export const quantity4 = proposal({ id: 'quantity:4', kind: 'quantity', row: 4, text: 'MOZZARELLA GRANAROLO 4 x 0,89', checked: true, before: { count: 3 }, after: { count: 4 } })
export const packSize1 = proposal({ id: 'pack_size:1', kind: 'pack_size', row: 1, text: 'REGINA CARTA IGIENICA 12 ROT', before: { packSize: 9 }, after: { packSize: 12, packUnit: 'piece' } })
export const name0 = proposal({ id: 'name:0', kind: 'name', row: 0, text: 'MUTTI PASSATA 500G', before: { name: 'Mutti passata 700 g' }, after: { name: 'Mutti passata 500 g' } })
export const add0 = proposal({ id: 'add:0', kind: 'add', line: 0, text: 'PANE CASERECCIO 0,45 kg 2,25', needsInput: true, after: { name: 'Pane casereccio', grams: 450, priceCents: 225 } })
export const add1 = proposal({ id: 'add:1', kind: 'add', line: 1, text: 'BANANE 1,2 kg 1,80', needsInput: true, after: { name: 'Bananas', grams: 1200, priceCents: 180 } })
export const missing5 = proposal({ id: 'missing:5', kind: 'missing', row: 5, before: { name: 'Monini olive oil 1 l' } })
export const shop = proposal({ id: 'shop', kind: 'shop', before: { shop: 'Esselunga', shopId: 7 }, after: { shop: 'Coop', shopId: 2 } })
export const date = proposal({ id: 'date', kind: 'date', before: { date: '2026-11-13' }, after: { date: '2026-11-12' } })

/** In the server's review order. */
export const allProposals: Proposal[] = [shop, date, price0, price1, price2, weight3, quantity4, name0, packSize1, add0, add1, missing5]

export function readDone(over: Partial<ReadDone> = {}): ReadDone {
  return {
    status: 'done',
    fingerprint: FINGERPRINT,
    rows,
    proposals: [price0, price1, price2, weight3, quantity4, packSize1, add0, add1, missing5],
    notes: [
      { code: 'total_differs', text: '', cents: -113 },
      { code: 'discount', text: 'SCONTO FEDELTA', cents: -200 },
    ],
    totals: { scannedCents: 2158, projectedCents: 2158, receiptCents: 2045, lines: 7 },
    warnings: [],
    ...over,
  }
}

export const completeDraft: AddDraft = { ingredient: { id: 31 }, productName: 'Pane casereccio', packSize: 450 }
export const newIngredientDraft: AddDraft = { ingredient: { name: 'Bananas', baseUnit: 'g', kind: 'food' }, productName: 'Bananas', packSize: 1000, scope: 'shop' }

export const scanResult = (clientUuid: string, priceCents = 135): ScanResult => ({
  clientUuid,
  status: 'applied',
  scan: {
    ingredientId: 1, ingredientName: 'Passata', baseUnit: 'g', productId: 10, productName: 'Mutti passata 700 g', quantity: 700, lotId: 1,
    priceCents, onList: false, remaining: 0, ticked: false, productCreated: false,
  } as ScanResult['scan'],
})

