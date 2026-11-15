// B9-41 (SSP-07): a new weighed Product's Op says it is weighed, so the Scanned row is a weighed row (weight and per kg Price) and
// its Price entry opens on per kg. Plain TypeScript.
import { describe, expect, it } from 'vitest'
import { emptyForm, toUnknownOp, type UnknownFormValues } from './unknownForm'
import { buildScannedRows } from './scannedList'

const meta = { clientUuid: 'u-1', scannedAt: '2026-11-14T10:00:00Z', shopId: 2 }
const cheese: UnknownFormValues = { ...emptyForm(), ingredient: { id: 5, name: 'Cheese', baseUnit: 'g' }, productName: 'Loose cheese', weightText: '312' }

describe('toUnknownOp: weighed', () => {
  it('a weighed target (a Weight Barcode Rule whose weight is decoded) makes an Op with weighed: true', () => {
    const op = toUnknownOp(cheese, { mode: 'weighed', ruleId: 3, itemCode: '012300', weightGrams: 312 }, meta)
    expect(op).toMatchObject({ kind: 'shop_unknown', ruleId: 3, itemCode: '012300', quantity: 312, weighed: true })
  })

  it('so does a price-valued weighed target, whose weight was asked once', () => {
    const op = toUnknownOp(cheese, { mode: 'weighed_price', ruleId: 4, itemCode: '000007', priceCents: 465 }, meta)
    expect(op).toMatchObject({ ruleId: 4, quantity: 312, priceCents: 465, weighed: true })
  })

  it('a pack Product is not weighed: the flag is absent', () => {
    const op = toUnknownOp({ ...cheese, packSize: '400', packUnit: 'g' }, { mode: 'pack', code: '08000500310427' }, meta)
    expect(op.weighed).toBeUndefined()
  })

  it('the row of a queued weighed scan is a weighed row at once: 312 g, no Price per kg yet', () => {
    const op = toUnknownOp(cheese, { mode: 'weighed', ruleId: 3, itemCode: '012300', weightGrams: 312 }, meta)
    const [row] = buildScannedRows([{ op, result: null }], [])
    expect(row).toMatchObject({ weighed: true, weight: 312, perKgCents: null, needsPrice: true })
  })
})
