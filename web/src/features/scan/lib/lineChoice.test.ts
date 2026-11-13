// SR5: which open Lines can be the unknown Product ("Which Line is it?"), and in which order.
import { describe, expect, it } from 'vitest'
import { choiceFromLine, lineChipAmount, lineChips, MAX_LINE_CHIPS, type LineCandidate } from './lineChoice'

const line = (id: number, name: string, over: Partial<LineCandidate> = {}): LineCandidate => ({ ingredientId: id, name, baseUnit: 'g', quantity: 100, ticked: false, ...over })

describe('lineChips', () => {
  it('keeps the unticked Lines that still need something, in list order', () => {
    const { chips, more } = lineChips([line(1, 'Mozzarella'), line(2, 'Basil'), line(3, 'Lemons')])
    expect(chips.map((c) => c.name)).toEqual(['Mozzarella', 'Basil', 'Lemons'])
    expect(more).toEqual([])
  })

  it('drops a ticked Line', () => {
    expect(lineChips([line(1, 'Pasta', { ticked: true }), line(2, 'Basil')]).chips.map((c) => c.name)).toEqual(['Basil'])
  })

  it('drops a Line that Stock already covers (nothing left to get)', () => {
    expect(lineChips([line(1, 'Pasta', { quantity: 0 }), line(2, 'Basil')]).chips.map((c) => c.name)).toEqual(['Basil'])
  })

  it('keeps a partly covered Line: some to get is enough', () => {
    expect(lineChips([line(1, 'Mozzarella', { quantity: 25 })]).chips).toHaveLength(1)
  })

  it('puts Restock Lines of Supplies after the food Lines, each group in the list\'s order', () => {
    const { chips } = lineChips([line(5, 'Dish soap', { kind: 'supply' }), line(1, 'Mozzarella'), line(6, 'Bin bags', { kind: 'supply' }), line(2, 'Basil')])
    expect(chips.map((c) => c.name)).toEqual(['Mozzarella', 'Basil', 'Dish soap', 'Bin bags'])
  })

  it('marks the Supplies\' Lines as Restock and a missing kind as food', () => {
    const { chips } = lineChips([line(1, 'Mozzarella'), line(5, 'Dish soap', { kind: 'supply' }), line(2, 'Rice', { kind: 'food' })])
    expect(chips.map((c) => [c.name, c.kind, c.restock])).toEqual([
      ['Mozzarella', 'food', false],
      ['Rice', 'food', false],
      ['Dish soap', 'supply', true],
    ])
  })

  it('lists one chip per Ingredient', () => {
    expect(lineChips([line(1, 'Mozzarella'), line(1, 'Mozzarella', { quantity: 50 })]).chips).toHaveLength(1)
  })

  it('shows at most 8 chips and keeps the rest for "More Lines"', () => {
    expect(MAX_LINE_CHIPS).toBe(8)
    const many = Array.from({ length: 11 }, (_, i) => line(i + 1, `Line ${i + 1}`))
    const { chips, more } = lineChips(many)
    expect(chips.map((c) => c.name)).toEqual(many.slice(0, 8).map((l) => l.name))
    expect(more.map((c) => c.name)).toEqual(many.slice(8).map((l) => l.name))
  })

  it('the limit can be given', () => {
    const { chips, more } = lineChips([line(1, 'A'), line(2, 'B'), line(3, 'C')], 2)
    expect([chips.length, more.length]).toEqual([2, 1])
  })

  it('no Lines, no chips', () => {
    expect(lineChips([])).toEqual({ chips: [], more: [] })
  })

  it('carries what the chip shows: the amount to get in Base Units and the Picture', () => {
    const [chip] = lineChips([line(1, 'Mozzarella', { quantity: 125, imageUrl: '/api/images/abc' })]).chips
    expect(chip).toMatchObject({ ingredientId: 1, name: 'Mozzarella', baseUnit: 'g', quantity: 125, imageUrl: '/api/images/abc' })
  })

  it('does not change the list it is given', () => {
    const input = [line(5, 'Dish soap', { kind: 'supply' }), line(1, 'Mozzarella')]
    const copy = structuredClone(input)
    lineChips(input)
    expect(input).toEqual(copy)
  })
})

describe('choiceFromLine', () => {
  it('takes the Line\'s Ingredient: id, name, Base Unit and kind', () => {
    const [chip] = lineChips([line(5, 'Dish soap', { kind: 'supply', baseUnit: 'ml', imageUrl: '/api/images/x' })]).chips
    expect(choiceFromLine(chip!)).toEqual({ id: 5, name: 'Dish soap', baseUnit: 'ml', kind: 'supply', imageUrl: '/api/images/x' })
  })

  it('leaves the Picture out when the Line has none', () => {
    const [chip] = lineChips([line(1, 'Mozzarella')]).chips
    expect(choiceFromLine(chip!)).toEqual({ id: 1, name: 'Mozzarella', baseUnit: 'g', kind: 'food' })
  })
})

describe('lineChipAmount', () => {
  it('is the amount still to get, in the Household\'s units', () => {
    const { chips } = lineChips([line(1, 'Mozzarella', { quantity: 125 }), line(2, 'Eggs', { baseUnit: 'piece', quantity: 6 })])
    expect(chips.map((c) => lineChipAmount(c, 'metric'))).toEqual(['125 g', '6 pieces'])
  })

  it('a Restock Line shows no amount: its chip says Restock', () => {
    const [chip] = lineChips([line(5, 'Dish soap', { kind: 'supply', baseUnit: 'ml', quantity: 500 })]).chips
    expect(lineChipAmount(chip!, 'metric')).toBe('')
  })
})
