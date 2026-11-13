import { describe, expect, it } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import { priceText, extraEntry, lineEntry, listEntries, packText } from './lines'

describe('packText', () => {
  it('shows the quantity and the suggested packs, as in the spec', () => {
    expect(packText(makeLine(), 'metric')).toBe('1400 g · 2 × Mutti 700 g')
  })

  it('shows just the exact amount when no Product was bought yet', () => {
    expect(packText(makeLine({ pack: null, quantity: 450 }), 'metric')).toBe('450 g')
  })

  it('follows the display unit system', () => {
    expect(packText(makeLine({ quantity: 100, pack: null }), 'imperial')).toBe('3.5 oz')
  })

  it('pieces and millilitres', () => {
    expect(packText(makeLine({ baseUnit: 'ml', quantity: 600, pack: { productId: 8, name: 'Milk 1 l', size: 1000, count: 1, remainder: 400 } }), 'metric')).toBe('600 ml · 1 × Milk 1 l')
    expect(packText(makeLine({ baseUnit: 'piece', quantity: 6, pack: null }), 'metric')).toBe('6 pieces')
  })
})

describe('priceText', () => {
  it('formats money in the household currency, and is null (never a dash) without a Price', () => {
    expect(priceText(318, 'USD')).toBe('$3.18')
    expect(priceText(318, 'EUR')).toBe('€3.18')
    expect(priceText(null, 'USD')).toBeNull()
  })
})

describe('lineEntry / extraEntry', () => {
  it('flattens an open Line', () => {
    expect(lineEntry(makeLine(), 'USD', 'metric')).toEqual({
      key: 'line:2',
      kind: 'line',
      ingredientId: 2,
      extraId: null,
      title: 'Passata',
      detail: '1400 g · 2 × Mutti 700 g',
      quantityText: '1400 g',
      packLine: '2 × Mutti 700 g',
      estimatedCost: '$3.18',
      ticked: false,
      quantity: 1400,
      baseUnit: 'g',
      supply: false,
      restockText: '',
    })
  })

  it('an unpriced open Line has no cost (null, not a dash), a ticked Line shows no pack and keeps its quantity (round 2)', () => {
    expect(lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric').estimatedCost).toBeNull()
    expect(lineEntry(makeLine({ pack: null }), 'USD', 'metric')).toMatchObject({ quantityText: '1400 g', packLine: '' })
    expect(lineEntry(makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), 'USD', 'metric')).toMatchObject({ estimatedCost: null, ticked: true, quantity: 0, quantityText: '1400 g', packLine: '' })
  })

  it('a free-text extra has no amount and an Ingredient extra shows what remains', () => {
    expect(extraEntry(makeExtra(), 'metric')).toMatchObject({ key: 'extra:1', kind: 'extra', extraId: 1, ingredientId: null, title: 'toilet paper', detail: '', quantityText: '', packLine: '', estimatedCost: null, quantity: 0, baseUnit: null })
    expect(extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 }), 'metric')).toMatchObject({
      key: 'extra:2',
      title: 'Milk',
      detail: '2000 ml',
      quantityText: '2000 ml',
      packLine: '',
      quantity: 2000,
      ingredientId: 3,
      baseUnit: 'ml',
    })
  })
})

describe('listEntries', () => {
  it('puts open Lines, then open extras, then everything ticked', () => {
    const list = makeList({
      lines: [makeLine({ ingredientId: 1, name: 'chicken thighs', ticked: true }), makeLine({ ingredientId: 2, name: 'Passata' })],
      extras: [makeExtra({ id: 1, text: 'candles', ticked: true }), makeExtra({ id: 2, text: 'toilet paper' })],
    })
    const { open, ticked } = listEntries(list, 'metric')
    expect(open.map((i) => i.title)).toEqual(['Passata', 'toilet paper'])
    expect(ticked.map((i) => i.title)).toEqual(['Chicken thighs', 'candles'])
  })

  it('is empty for an empty list', () => {
    expect(listEntries(makeList({ lines: [], extras: [] }), 'metric')).toEqual({ open: [], ticked: [] })
  })
})
