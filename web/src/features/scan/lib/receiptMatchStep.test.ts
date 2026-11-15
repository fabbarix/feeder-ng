// B9-50 (SSP-08): the pure parts of the "Is it one of these?" step of a receipt line's Add….
import { describe, expect, it } from 'vitest'
import type { ReceiptMatch } from '../components/NewProductSheet'
import { lineChips } from './lineChoice'
import { chipOfLineMatch, initialMatchKey, matchKey, matchNote, otherLines, productNamed, productNote } from './receiptMatchStep'

const product: Extract<ReceiptMatch, { kind: 'product' }> = { kind: 'product', productId: 50, name: 'Kitchen roll 4 pack', ingredientId: 7, baseUnit: 'piece', packSize: 4 }
const line: Extract<ReceiptMatch, { kind: 'line' }> = { kind: 'line', ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece', quantity: 2 }
const candidates = [
  { ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece' as const, quantity: 2, ticked: false },
  { ingredientId: 8, name: 'Cheese', baseUnit: 'g' as const, quantity: 88, ticked: false },
]

describe('receiptMatchStep', () => {
  it('keys and notes say what a match is', () => {
    expect(matchKey(product)).toBe('product:50')
    expect(matchKey(line)).toBe('line:7')
    expect(matchNote(product, 'metric')).toBe('Product · 4 pieces')
    expect(matchNote(line, 'metric')).toBe('Line · 2 pieces')
  })
  it('a first Product is chosen at the start; a first Line is not', () => {
    expect(initialMatchKey([product, line])).toBe('product:50')
    expect(initialMatchKey([line, product])).toBeNull()
    expect(initialMatchKey([])).toBeNull()
  })
  it('Other Lines leaves out the Lines the matches offer', () => {
    const out = otherLines(lineChips(candidates), [product, line])
    expect(out.chips.map((c) => c.name)).toEqual(['Cheese'])
  })
  it('a Line match picks the sheet\'s own chip, or one built from the match', () => {
    expect(chipOfLineMatch(line, lineChips(candidates)).name).toBe('Kitchen roll')
    expect(chipOfLineMatch(line, { chips: [], more: [] })).toEqual({ ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece', kind: 'food', restock: false, quantity: 2 })
  })
  it('the note says the Scans, the price and the Line it ticks', () => {
    expect(productNote(product, { text: 'K', priceText: '$3.49', detail: '', scans: 1 }, candidates)).toBe('Kitchen roll 4 pack: 1 Scan at $3.49, and it ticks Kitchen roll.')
    expect(productNote(product, { text: 'K', detail: '', scans: 2 }, [])).toBe('Kitchen roll 4 pack: 2 Scans.')
  })
  it('a new name that is a Product is found without case, accents or extra spaces', () => {
    const products = [{ id: 50, name: 'Kitchen roll 4 pack' }, { ingredientId: 3, packSize: 1 }]
    expect(productNamed('  kitchen ROLL  4 pack ', products)?.id).toBe(50)
    expect(productNamed('Kitchen roll', products)).toBeUndefined()
    expect(productNamed('', products)).toBeUndefined()
  })
})
