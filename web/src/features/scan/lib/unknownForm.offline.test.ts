// SR5 (H7, "the offline path"): a new Supply scanned offline is queued as an Op, and the Scanned list shows its row as a Supply before
// the server has answered: the queued Op's ingredient.kind is what buildScannedRows reads (its fallback no longer says food for everything).
import { describe, expect, it } from 'vitest'
import { buildScannedRows } from './scannedList'
import { emptyForm, toUnknownOp, type UnknownFormValues } from './unknownForm'

const meta = { clientUuid: 'u-queued', scannedAt: '2026-11-13T10:00:00Z', shopId: 3 }
const values = (kind: 'food' | 'supply'): UnknownFormValues => ({
  ...emptyForm(),
  ingredient: { name: kind === 'supply' ? 'toilet paper' : 'olive oil', baseUnit: kind === 'supply' ? 'piece' : 'ml', kind },
  packSize: kind === 'supply' ? '9' : '1',
  packUnit: kind === 'supply' ? 'piece' : 'l',
  productName: kind === 'supply' ? 'Toilet paper 9 pieces' : 'Olive oil 1000 ml',
})

describe('an unknown barcode queued offline', () => {
  it('its row says Supply while the scan waits to sync', () => {
    const op = toUnknownOp(values('supply'), { mode: 'pack', code: '8001234567890' }, meta)
    const [row] = buildScannedRows([{ op, result: null }], [])
    expect(row).toMatchObject({ key: 'new:u-queued', name: 'Toilet paper 9 pieces', kind: 'supply', baseUnit: 'piece', waiting: true })
  })

  it('and a new Ingredient says food', () => {
    const op = toUnknownOp(values('food'), { mode: 'pack', code: '8001234567891' }, meta)
    const [row] = buildScannedRows([{ op, result: null }], [])
    expect(row).toMatchObject({ kind: 'food' })
  })

  it('a Restock Line picked offline (an existing Supply) says Supply, with its name and Base Unit', () => {
    const picked: UnknownFormValues = { ...values('supply'), ingredient: { id: 15, name: 'Dish soap', baseUnit: 'ml', kind: 'supply' }, packSize: '500', packUnit: 'ml', productName: 'Dish soap 500 ml' }
    const op = toUnknownOp(picked, { mode: 'pack', code: '8001234567892' }, meta)
    const [row] = buildScannedRows([{ op, result: null }], [])
    expect(row).toMatchObject({ kind: 'supply', baseUnit: 'ml', ingredientId: 15, ingredientName: 'Dish soap', waiting: true })
  })

  it('an Op queued before this change (no kind) is food', () => {
    const op = toUnknownOp(values('food'), { mode: 'pack', code: '8001234567891' }, meta)
    const old = { ...op, ingredient: { name: 'olive oil', baseUnit: 'ml' as const } }
    const [row] = buildScannedRows([{ op: old, result: null }], [])
    expect(row).toMatchObject({ kind: 'food' })
  })
})
