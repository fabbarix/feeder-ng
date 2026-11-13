// SR2: the pure money-input model behind PriceKeypad (shop-scan-proposals.md 13.4, functional spec 10.1 "Price entry").
// The typed amount is TEXT ("1.2"), not a growing count of cents: the keypad has a decimal key (S1, "1,29" on a shelf label).
// Digits before the decimal key are whole units; after it, minor units up to the currency's digits.
import { describe, expect, it } from 'vitest'
import {
  MAX_WHOLE_DIGITS,
  decimalSeparator,
  formatTyped,
  hasDecimalKey,
  lastPriceHint,
  noPriceHint,
  pressBackspace,
  pressDecimal,
  pressDigit,
  typedFromMinor,
  typedToMinor,
} from './moneyInput'

const type = (keys: string, currency = 'EUR', start = ''): string =>
  [...keys].reduce((text, k) => (k === '.' ? pressDecimal(text, currency) : k === '<' ? pressBackspace(text) : pressDigit(text, k, currency)), start)

describe('ui/lib/moneyInput: typing', () => {
  it('builds whole units from digits, then minor units after the decimal key', () => {
    expect(type('1')).toBe('1')
    expect(type('145')).toBe('145')
    expect(type('1.29')).toBe('1.29')
    expect(typedToMinor(type('1.29'), 'EUR')).toBe(129)
    expect(typedToMinor(type('2'), 'EUR')).toBe(200)
    expect(typedToMinor(type('1.2'), 'EUR')).toBe(120)
    expect(typedToMinor(type('0.05'), 'EUR')).toBe(5)
  })

  it('accepts only the currency\'s minor digits after the decimal key', () => {
    expect(type('1.299')).toBe('1.29')
    expect(type('1.299', 'USD')).toBe('1.29')
  })

  it('starts "0." when the decimal key is the first key, and ignores a second decimal key', () => {
    expect(type('.')).toBe('0.')
    expect(type('1..2')).toBe('1.2')
  })

  it('has no leading zeros: 0 then 5 is 5, 00 stays 0', () => {
    expect(type('05')).toBe('5')
    expect(type('00')).toBe('0')
    expect(type('0.5')).toBe('0.5')
  })

  it('reads an unfinished "1." as 100 minor units and an empty text as null (nothing typed)', () => {
    expect(typedToMinor('1.', 'EUR')).toBe(100)
    expect(typedToMinor('', 'EUR')).toBeNull()
    expect(typedToMinor('0', 'EUR')).toBe(0) // the caller refuses it: "Enter a number above 0"
  })

  it('ignores anything that is not one digit', () => {
    expect(pressDigit('1', 'a', 'EUR')).toBe('1')
    expect(pressDigit('1', '12', 'EUR')).toBe('1')
    expect(pressDigit('1', '', 'EUR')).toBe('1')
  })
})

describe('ui/lib/moneyInput: decimal key', () => {
  it('is present for a currency with minor digits and hidden for one with none', () => {
    expect(hasDecimalKey('EUR')).toBe(true)
    expect(hasDecimalKey('USD')).toBe(true)
    expect(hasDecimalKey('JPY')).toBe(false)
  })

  it('does nothing for a 0-digit currency, and its digits are whole units', () => {
    expect(pressDecimal('5', 'JPY')).toBe('5')
    expect(typedToMinor(type('450', 'JPY'), 'JPY')).toBe(450)
  })

  it('is the Household locale\'s separator, null for a 0-digit currency', () => {
    expect(decimalSeparator('EUR', 'en-GB')).toBe('.')
    expect(decimalSeparator('EUR', 'de-DE')).toBe(',')
    expect(decimalSeparator('EUR', 'it-IT')).toBe(',')
    expect(decimalSeparator('JPY', 'ja-JP')).toBeNull()
  })
})

describe('ui/lib/moneyInput: backspace', () => {
  it('removes the last character, a decimal separator included', () => {
    expect(pressBackspace('1.29')).toBe('1.2')
    expect(pressBackspace('1.')).toBe('1')
    expect(pressBackspace('145')).toBe('14')
  })

  it('goes back to empty and stays there', () => {
    expect(pressBackspace('5')).toBe('')
    expect(pressBackspace('')).toBe('')
    expect(pressBackspace('0.')).toBe('') // "0." was typed as one key
  })
})

describe('ui/lib/moneyInput: maximum length', () => {
  it('stops at MAX_WHOLE_DIGITS whole digits', () => {
    expect(MAX_WHOLE_DIGITS).toBe(6)
    expect(type('12345678')).toBe('123456')
    expect(typedToMinor(type('999999.99'), 'EUR')).toBe(99999999)
  })

  it('still takes the minor digits when the whole part is full', () => {
    expect(type('123456.7')).toBe('123456.7')
  })

  it('applies to a 0-digit currency too', () => {
    expect(type('12345678', 'JPY')).toBe('123456')
  })
})

describe('ui/lib/moneyInput: formatting in the household currency', () => {
  it('shows what is typed with the currency symbol, live', () => {
    expect(formatTyped('', 'EUR', 'en-GB')).toBe('€0')
    expect(formatTyped('1', 'EUR', 'en-GB')).toBe('€1')
    expect(formatTyped('1.', 'EUR', 'en-GB')).toBe('€1.')
    expect(formatTyped('1.2', 'EUR', 'en-GB')).toBe('€1.2')
    expect(formatTyped('1.45', 'EUR', 'en-GB')).toBe('€1.45')
    expect(formatTyped('1.45', 'USD', 'en-US')).toBe('$1.45')
    expect(formatTyped('450', 'JPY', 'ja-JP').replace(/\s/g, '')).toMatch(/450/)
  })

  it('uses the Household locale\'s separator and symbol placement', () => {
    expect(formatTyped('1.2', 'EUR', 'de-DE').replace(/ /g, ' ')).toBe('1,2 €')
    expect(formatTyped('1.', 'EUR', 'de-DE').replace(/ /g, ' ')).toBe('1, €')
  })

  it('groups thousands from the locale', () => {
    expect(formatTyped('12345', 'EUR', 'en-GB')).toBe('€12,345')
  })
})

describe('ui/lib/moneyInput: prefilling the last Price', () => {
  it('turns minor units back into typed text with every digit the keys can produce', () => {
    expect(typedFromMinor(129, 'EUR')).toBe('1.29')
    expect(typedFromMinor(150, 'EUR')).toBe('1.50')
    expect(typedFromMinor(5, 'EUR')).toBe('0.05')
    expect(typedFromMinor(500, 'JPY')).toBe('500')
  })

  it('round-trips through typedToMinor', () => {
    for (const cents of [1, 99, 129, 1000, 123456]) expect(typedToMinor(typedFromMinor(cents, 'EUR'), 'EUR')).toBe(cents)
  })

  it('says "Last time here €1.29 · 3 Nov" (spec 13.4)', () => {
    expect(lastPriceHint({ cents: 129, date: '2026-11-03', currency: 'EUR', locale: 'en-GB' })).toBe('Last time here €1.29 · 3 Nov')
  })

  it('writes the date in the Household locale and the Price in its currency', () => {
    expect(lastPriceHint({ cents: 199, date: '2026-01-09', currency: 'USD', locale: 'en-US' })).toBe('Last time here $1.99 · Jan 9')
  })

  it('says "No Price at Esselunga yet" when the Shop has no Price', () => {
    expect(noPriceHint('Esselunga')).toBe('No Price at Esselunga yet')
  })
})
