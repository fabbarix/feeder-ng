import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import { boughtLabel, deductionOrder, lotMeta, lotsOfIngredient } from './ingredientLots'

const today = '2026-11-09' // a Monday

describe('deductionOrder', () => {
  it('puts the soonest go-off first, then Lots without a go-off date', () => {
    const a = makeLot({ id: 1, goesOff: '2026-11-20' })
    const b = makeLot({ id: 2, goesOff: null })
    const c = makeLot({ id: 3, goesOff: '2026-11-12' })
    expect(deductionOrder([a, b, c]).map((l) => l.id)).toEqual([3, 1, 2])
  })
  it('breaks ties by the oldest purchase, then the lowest id', () => {
    const lots = [
      makeLot({ id: 4, goesOff: '2026-11-12', purchased: '2026-11-08' }),
      makeLot({ id: 3, goesOff: '2026-11-12', purchased: '2026-11-08' }),
      makeLot({ id: 9, goesOff: '2026-11-12', purchased: '2026-11-05' }),
      makeLot({ id: 7, goesOff: null, purchased: '2026-11-08' }),
      makeLot({ id: 6, goesOff: null, purchased: '2026-11-01' }),
    ]
    expect(deductionOrder(lots).map((l) => l.id)).toEqual([9, 3, 4, 6, 7])
  })
  it('lists a Lot that has gone off first and does not mutate its input', () => {
    const lots = [makeLot({ id: 1, goesOff: '2026-11-12' }), makeLot({ id: 2, goesOff: '2026-11-03' })]
    const copy = [...lots]
    expect(deductionOrder(lots).map((l) => l.id)).toEqual([2, 1])
    expect(lots).toEqual(copy)
  })
})

describe('lotsOfIngredient', () => {
  it('keeps one Ingredient\'s Lots, in Deduction order', () => {
    const all = [
      makeLot({ id: 1, ingredientId: 7, goesOff: '2026-11-20' }),
      makeLot({ id: 2, ingredientId: 8, goesOff: '2026-11-10' }),
      makeLot({ id: 3, ingredientId: 7, goesOff: '2026-11-12' }),
    ]
    expect(lotsOfIngredient(all, 7).map((l) => l.id)).toEqual([3, 1])
    expect(lotsOfIngredient(all, 99)).toEqual([])
  })
})

describe('boughtLabel', () => {
  it('says today and yesterday in words, else the day and month', () => {
    expect(boughtLabel('2026-11-09', today)).toBe('Bought today')
    expect(boughtLabel('2026-11-08', today)).toBe('Bought yesterday')
    expect(boughtLabel('2026-11-05', today)).toBe('Bought 5 Nov')
    expect(boughtLabel('2025-12-31', today)).toBe('Bought 31 Dec')
  })
})

describe('lotMeta', () => {
  it('reads Bought, Good until and the Storage Place', () => {
    const lot = makeLot({ purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false })
    expect(lotMeta(lot, today, 'Garage Fridge')).toBe('Bought today · Good until Fri · Garage Fridge')
  })
  it('says "Not sorted" when the Lot is in no Storage Place', () => {
    const lot = makeLot({ purchased: '2026-11-08', goesOff: '2026-11-10', spoiled: false })
    expect(lotMeta(lot, today, null)).toBe('Bought yesterday · Good until tomorrow · Not sorted')
  })
  it('leaves out Good until without a go-off date', () => {
    const lot = makeLot({ purchased: '2026-11-05', goesOff: null, spoiled: false })
    expect(lotMeta(lot, today, 'Kitchen Pantry')).toBe('Bought 5 Nov · Kitchen Pantry')
  })
  it('says when the Lot has gone off', () => {
    const lot = makeLot({ purchased: '2026-11-01', goesOff: '2026-11-06', spoiled: true })
    expect(lotMeta(lot, today, 'Kitchen Pantry')).toBe('Bought 1 Nov · Went off 3 days ago · Kitchen Pantry')
  })
})
