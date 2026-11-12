import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import { changeGoesOff, changePurchased, checkLotForm, initialForm, suggestGoodUntil, toggleNoGoOff } from './lotEdit'

const today = '2026-11-12'
const lot = makeLot({ id: 5, quantity: 800, purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false })
const noGoOffLot = makeLot({ id: 6, quantity: 500, purchased: '2026-11-09', goesOff: null, spoiled: false })

describe('suggestGoodUntil', () => {
  it('is the purchase date plus the Shelf Life', () => {
    expect(suggestGoodUntil('2026-11-08', 4)).toBe('2026-11-12')
    expect(suggestGoodUntil('2026-11-28', 5)).toBe('2026-12-03')
    expect(suggestGoodUntil('2026-11-01', 60)).toBe('2026-12-31')
    expect(suggestGoodUntil('2026-11-08', 0)).toBe('2026-11-08')
  })
  it('is null without a Shelf Life or a date', () => {
    expect(suggestGoodUntil('2026-11-08', null)).toBeNull()
    expect(suggestGoodUntil('2026-11-08', undefined)).toBeNull()
    expect(suggestGoodUntil('', 4)).toBeNull()
  })
})

describe('initialForm', () => {
  it('holds the Lot as text, with nothing touched', () => {
    expect(initialForm(lot)).toEqual({ quantity: '800', purchased: '2026-11-09', goesOff: '2026-11-13', noGoOff: false, goesOffTouched: false })
  })
  it('switches "No go-off date" on for a Lot without one', () => {
    expect(initialForm(noGoOffLot)).toEqual({ quantity: '500', purchased: '2026-11-09', goesOff: '', noGoOff: true, goesOffTouched: false })
  })
})

describe('changePurchased', () => {
  it('suggests Good until again from the Shelf Life', () => {
    const form = changePurchased(initialForm(lot), '2026-11-10', 4)
    expect(form).toMatchObject({ purchased: '2026-11-10', goesOff: '2026-11-14', goesOffTouched: false })
  })
  it('leaves Good until alone once the User chose it', () => {
    const form = changePurchased(changeGoesOff(initialForm(lot), '2026-11-20'), '2026-11-10', 4)
    expect(form).toMatchObject({ purchased: '2026-11-10', goesOff: '2026-11-20', goesOffTouched: true })
  })
  it('leaves Good until alone without a Shelf Life', () => {
    expect(changePurchased(initialForm(lot), '2026-11-10', null)).toMatchObject({ purchased: '2026-11-10', goesOff: '2026-11-13' })
  })
  it('does not give a Lot without a go-off date one', () => {
    expect(changePurchased(initialForm(noGoOffLot), '2026-11-10', null)).toMatchObject({ goesOff: '', noGoOff: true })
  })
  it('keeps the switch on when the Shelf Life would have suggested a date for a Lot the User left without one', () => {
    const form = changePurchased(toggleNoGoOff(initialForm(lot), true, 4), '2026-11-10', 4)
    expect(form).toMatchObject({ noGoOff: true, goesOff: '' })
  })
})

describe('changeGoesOff and toggleNoGoOff', () => {
  it('choosing a date touches Good until and switches "No go-off date" off', () => {
    const form = changeGoesOff(initialForm(noGoOffLot), '2026-11-20')
    expect(form).toMatchObject({ goesOff: '2026-11-20', goesOffTouched: true, noGoOff: false })
  })
  it('the switch on clears Good until and counts as touched', () => {
    expect(toggleNoGoOff(initialForm(lot), true, 4)).toMatchObject({ noGoOff: true, goesOff: '', goesOffTouched: true })
  })
  it('the switch off suggests Good until from Bought on, or leaves it empty without a Shelf Life', () => {
    const on = toggleNoGoOff(initialForm(lot), true, 4)
    expect(toggleNoGoOff(on, false, 4)).toMatchObject({ noGoOff: false, goesOff: '2026-11-13', goesOffTouched: true })
    expect(toggleNoGoOff(on, false, null)).toMatchObject({ noGoOff: false, goesOff: '' })
  })
})

describe('checkLotForm', () => {
  const check = (over: Partial<ReturnType<typeof initialForm>>, l = lot) => checkLotForm({ ...initialForm(l), ...over }, l, today)

  it('an untouched form is ok with an empty patch', () => {
    expect(check({})).toEqual({ ok: true, patch: {} })
  })
  it('sends only the quantity when only it changed, accepting a decimal comma', () => {
    expect(check({ quantity: '650' })).toEqual({ ok: true, patch: { quantity: 650 } })
    expect(check({ quantity: '1,5' })).toEqual({ ok: true, patch: { quantity: 1.5 } })
    expect(check({ quantity: '800' })).toEqual({ ok: true, patch: {} })
  })
  it.each([
    ['', 'empty'],
    ['abc', 'invalid'],
    ['-3', 'negative'],
    ['0', 'notPositive'],
  ])('quantity %j is refused as %s', (quantity, error) => {
    expect(check({ quantity })).toEqual({ ok: false, errors: { quantity: error } })
  })
  it('a changed Bought on with Good until untouched sends no goesOff (the server suggests it)', () => {
    expect(check({ purchased: '2026-11-10', goesOff: '2026-11-14' })).toEqual({ ok: true, patch: { purchased: '2026-11-10' } })
  })
  it('Bought on may be today but not after it, and must be a date', () => {
    expect(check({ purchased: today, goesOff: '2026-11-16' })).toEqual({ ok: true, patch: { purchased: today } })
    expect(check({ purchased: '2026-11-13' })).toEqual({ ok: false, errors: { purchased: 'future' } })
    expect(check({ purchased: '' })).toEqual({ ok: false, errors: { purchased: 'invalid' } })
  })
  it('a touched Good until that differs is sent, with a changed Bought on too', () => {
    expect(check({ goesOff: '2026-11-20', goesOffTouched: true })).toEqual({ ok: true, patch: { goesOff: '2026-11-20' } })
    expect(check({ purchased: '2026-11-10', goesOff: '2026-11-20', goesOffTouched: true })).toEqual({
      ok: true,
      patch: { purchased: '2026-11-10', goesOff: '2026-11-20' },
    })
  })
  it('a touched Good until equal to the Lot\'s is not sent', () => {
    expect(check({ goesOffTouched: true })).toEqual({ ok: true, patch: {} })
  })
  it('Good until cannot be before Bought on (the new one), and a touched empty one is refused', () => {
    expect(check({ goesOff: '2026-11-05', goesOffTouched: true })).toEqual({ ok: false, errors: { goesOff: 'beforePurchased' } })
    expect(check({ purchased: '2026-11-12', goesOff: '2026-11-11', goesOffTouched: true })).toEqual({ ok: false, errors: { goesOff: 'beforePurchased' } })
    expect(check({ goesOff: '', goesOffTouched: true })).toEqual({ ok: false, errors: { goesOff: 'invalid' } })
  })
  it('Good until on the purchase date is allowed, and in the past too (the Lot is then spoiled)', () => {
    expect(check({ goesOff: '2026-11-09', goesOffTouched: true })).toEqual({ ok: true, patch: { goesOff: '2026-11-09' } })
  })
  it('"No go-off date" sends goesOff null, only for a Lot that has one', () => {
    expect(check({ noGoOff: true, goesOff: '', goesOffTouched: true })).toEqual({ ok: true, patch: { goesOff: null } })
    expect(check({}, noGoOffLot)).toEqual({ ok: true, patch: {} })
    expect(check({ noGoOff: true, goesOffTouched: true }, noGoOffLot)).toEqual({ ok: true, patch: {} })
  })
  it('collects every error at once', () => {
    expect(check({ quantity: '0', purchased: '2026-11-13' })).toEqual({ ok: false, errors: { quantity: 'notPositive', purchased: 'future' } })
  })
})
