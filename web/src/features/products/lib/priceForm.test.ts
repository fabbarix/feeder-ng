import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import type { Price } from '../types'
import { prefillPrice, toPriceBody, validatePriceForm } from './priceForm'

const ok = { shopId: 2, date: '2026-11-09', price: '1.59', perKg: '' }

describe('validatePriceForm', () => {
  it('accepts a pack price, a price per kg, or both', () => {
    expect(validatePriceForm(ok, 'USD')).toEqual({})
    expect(validatePriceForm({ ...ok, price: '', perKg: '18' }, 'USD')).toEqual({})
    expect(validatePriceForm({ ...ok, perKg: '2.27' }, 'USD')).toEqual({})
  })
  it('needs a Shop', () => {
    expect(validatePriceForm({ ...ok, shopId: null }, 'USD').shopId).toBe(strings.errShop)
  })
  it.each(['09/11/2026', '2026-02-30', '', '2026-13-01'])('rejects the date %j', (date) => {
    expect(validatePriceForm({ ...ok, date }, 'USD').date).toBe(strings.errDate)
  })
  it('accepts a leap day', () => {
    expect(validatePriceForm({ ...ok, date: '2028-02-29' }, 'USD').date).toBeUndefined()
  })
  it.each([
    ['', ''],
    ['0', ''],
    ['abc', ''],
    ['', '-3'],
    ['1.599', ''],
  ])('rejects the amounts %j / %j', (price, perKg) => {
    expect(validatePriceForm({ ...ok, price, perKg }, 'USD').amount).toBe(strings.errAmount)
  })
  it('judges decimals by the currency', () => {
    expect(validatePriceForm({ ...ok, price: '159' }, 'JPY')).toEqual({})
    expect(validatePriceForm({ ...ok, price: '1.5' }, 'JPY').amount).toBe(strings.errAmount)
  })
})

describe('toPriceBody', () => {
  it('sends minor units for the filled amounts only', () => {
    expect(toPriceBody(ok, 'USD')).toEqual({ shopId: 2, date: '2026-11-09', priceCents: 159 })
    expect(toPriceBody({ ...ok, price: '', perKg: '18' }, 'USD')).toEqual({ shopId: 2, date: '2026-11-09', pricePerKgCents: 1800 })
    expect(toPriceBody({ ...ok, perKg: '19.99' }, 'USD')).toEqual({
      shopId: 2,
      date: '2026-11-09',
      priceCents: 159,
      pricePerKgCents: 1999,
    })
  })
})

describe('prefillPrice', () => {
  const latest = (over: Partial<Price>): Price => ({
    id: 1, productId: 1, shopId: 2, date: '2026-11-01',
    priceCents: 159, pricePerKgCents: 227, pricePerKgDerived: true, ...over,
  })

  it('starts empty with today and the Shop when there is no Price', () => {
    expect(prefillPrice(null, 2, '2026-11-09', 'USD')).toEqual({ shopId: 2, date: '2026-11-09', price: '', perKg: '' })
  })
  it('prefills the pack price from the latest Price, but not a derived price per kg', () => {
    expect(prefillPrice(latest({}), 2, '2026-11-09', 'USD')).toEqual({ shopId: 2, date: '2026-11-09', price: '1.59', perKg: '' })
  })
  it('prefills an explicit price per kg', () => {
    const p = latest({ priceCents: null, pricePerKgCents: 1800, pricePerKgDerived: false })
    expect(prefillPrice(p, 2, '2026-11-09', 'USD')).toEqual({ shopId: 2, date: '2026-11-09', price: '', perKg: '18.00' })
  })
})
