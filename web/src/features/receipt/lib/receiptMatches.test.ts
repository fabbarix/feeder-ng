// B9-50 (SSP-08): the name matches of a receipt line. Pure: names are compared without case, accents and pack sizes ("4 pack", "700 g",
// "1 l"); a Product or an open Line matches when the two names are the same words, or every word of the shorter is in the longer; the
// Products come first, then the Lines, at most three in all. A word shared by two different names ("Olive oil" and "Olive tapenade")
// is not a match. Ticked and covered Lines are not offered.
import { describe, expect, it } from 'vitest'
import { receiptMatches } from './receiptMatches'

type P = { id: number; name: string; ingredientId: number; baseUnit: 'g' | 'ml' | 'piece'; packSize: number }
const product = (id: number, name: string, ingredientId: number, baseUnit: P['baseUnit'] = 'piece', packSize = 4): P => ({ id, name, ingredientId, baseUnit, packSize })
const line = (ingredientId: number, name: string, quantity = 2, ticked = false) => ({ ingredientId, name, baseUnit: 'piece' as const, quantity, ticked })

const kitchenRoll = product(50, 'Kitchen roll 4 pack', 7)
const kitchenLine = line(7, 'Kitchen roll')
const asProduct = (p: P) => ({ kind: 'product', productId: p.id, name: p.name, ingredientId: p.ingredientId, baseUnit: p.baseUnit, packSize: p.packSize })
const asLine = (l: ReturnType<typeof line>) => ({ kind: 'line', ingredientId: l.ingredientId, name: l.name, baseUnit: l.baseUnit, quantity: l.quantity })

describe('receiptMatches', () => {
  it('a Product whose name is the line with a pack size on it is offered first, then the Line', () => {
    expect(receiptMatches('Kitchen roll', { products: [kitchenRoll], lines: [kitchenLine] })).toEqual([asProduct(kitchenRoll), asLine(kitchenLine)])
  })
  it('the printed line, in capitals with its pack size, matches the same Product', () => {
    expect(receiptMatches('KITCHEN ROLL 4 PACK', { products: [kitchenRoll], lines: [] })).toEqual([asProduct(kitchenRoll)])
  })
  it('a pack size in grams or litres is stripped from both sides', () => {
    const mutti = product(51, 'Mutti passata 700 g', 1, 'g', 700)
    expect(receiptMatches('Mutti passata 500 g', { products: [mutti], lines: [] })).toEqual([asProduct(mutti)])
    const milk = product(52, 'Latte intero 1 l', 2, 'ml', 1000)
    expect(receiptMatches('LATTE INTERO', { products: [milk], lines: [] })).toEqual([asProduct(milk)])
  })
  it('case and accents do not matter', () => {
    const cream = product(53, 'Crème fraîche', 3, 'g', 200)
    expect(receiptMatches('creme fraiche', { products: [cream], lines: [] })).toEqual([asProduct(cream)])
  })
  it('every word of the shorter name in the longer one is a match, either way round', () => {
    const oil = product(54, 'Extra virgin olive oil 1 l', 4, 'ml', 1000)
    expect(receiptMatches('Olive oil', { products: [oil], lines: [] })).toEqual([asProduct(oil)])
    expect(receiptMatches('Organic extra virgin olive oil, cold pressed', { products: [oil], lines: [] })).toEqual([asProduct(oil)])
  })
  it('a name with no match gives nothing, and so does a blank one', () => {
    expect(receiptMatches('Bananas', { products: [kitchenRoll], lines: [kitchenLine] })).toEqual([])
    expect(receiptMatches('   ', { products: [kitchenRoll], lines: [kitchenLine] })).toEqual([])
  })
  it('one word in common is not enough', () => {
    expect(receiptMatches('Olive oil', { products: [product(55, 'Olive tapenade', 5, 'g', 140)], lines: [] })).toEqual([])
  })
  it('the Products come before the Lines even when a Line is the closer name', () => {
    const out = receiptMatches('Kitchen roll', { products: [kitchenRoll], lines: [kitchenLine] })
    expect(out.map((m) => m.kind)).toEqual(['product', 'line'])
  })
  it('the same words rank above a name that only contains them', () => {
    const loose = product(56, 'Organic extra virgin olive oil bio', 4, 'ml', 750)
    const same = product(57, 'Extra virgin olive oil 1 l', 4, 'ml', 1000)
    const out = receiptMatches('Extra virgin olive oil', { products: [loose, same], lines: [] })
    expect(out.map((m) => (m.kind === 'product' ? m.productId : 0))).toEqual([57, 56])
  })
  it('at most three, Products first', () => {
    const many = [1, 2, 3, 4].map((i) => product(60 + i, `Kitchen roll ${i} pack`, 7))
    const out = receiptMatches('Kitchen roll', { products: many, lines: [kitchenLine] })
    expect(out).toHaveLength(3)
    expect(out.every((m) => m.kind === 'product')).toBe(true)
  })
  it('a smaller limit is kept', () => {
    expect(receiptMatches('Kitchen roll', { products: [kitchenRoll], lines: [kitchenLine] }, 1)).toEqual([asProduct(kitchenRoll)])
  })
  it('a Line that is ticked or has nothing left to get is not offered', () => {
    expect(receiptMatches('Kitchen roll', { products: [], lines: [line(7, 'Kitchen roll', 2, true), line(8, 'Kitchen roll XL', 0)] })).toEqual([])
  })
  it('a Line alone is offered when no Product matches', () => {
    expect(receiptMatches('Kitchen roll', { products: [], lines: [kitchenLine] })).toEqual([asLine(kitchenLine)])
  })
})
