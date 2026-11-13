// SR4: what the Price entry sheet needs to know about a row's Product (shop-scan-proposals.md 13.4): the pack size, which
// switches "per pack · per kg" on, and "Last time here €1.29 · 3 Nov". Pure TypeScript, no React.
import { describe, expect, it } from 'vitest'
import { cheese, passata, toiletPaper } from './scannedList.testData'
import { priceContext } from './priceContext'

describe('priceContext', () => {
  it('a Product in grams gives its pack size (per kg is offered) and the last Price here with its day', () => {
    expect(priceContext(passata)).toEqual({ pack: { amount: 700, unit: 'g' }, last: { cents: 129, date: '2026-11-03' } })
  })

  it('a Product in millilitres gives its pack in ml (per l is offered)', () => {
    expect(priceContext({ ...passata, baseUnit: 'ml', packSize: 1000 }).pack).toEqual({ amount: 1000, unit: 'ml' })
  })

  it('pieces give their pack size too (the keypad then offers no per kg: S3)', () => {
    expect(priceContext(toiletPaper).pack).toEqual({ amount: 9, unit: 'piece' })
  })

  it('no last Price here is null, whatever else is known', () => {
    expect(priceContext(cheese).last).toBeNull()
  })

  it('a last Price without its day is null (the chip needs both)', () => {
    expect(priceContext({ ...passata, lastPriceDate: undefined }).last).toBeNull()
  })

  it('a Product the phone does not know (a queued scan that creates one) has neither', () => {
    expect(priceContext(undefined)).toEqual({ last: null })
  })
})
