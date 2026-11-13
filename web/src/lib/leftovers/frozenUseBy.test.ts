import { describe, expect, it } from 'vitest'
import { frozenUseByHelper, parseFrozenUseBy } from './frozenUseBy'

describe('parseFrozenUseBy', () => {
  it('accepts whole days 1 to 365', () => {
    expect(parseFrozenUseBy('90', { required: true })).toEqual({ ok: true, value: 90 })
    expect(parseFrozenUseBy(' 1 ', { required: false })).toEqual({ ok: true, value: 1 })
    expect(parseFrozenUseBy('365', { required: true })).toEqual({ ok: true, value: 365 })
  })
  it('blank is null for the optional Recipe field', () => {
    expect(parseFrozenUseBy('', { required: false })).toEqual({ ok: true, value: null })
    expect(parseFrozenUseBy('  ', { required: false })).toEqual({ ok: true, value: null })
  })
  it('blank is an error for the Household default', () => {
    expect(parseFrozenUseBy('', { required: true })).toEqual({ ok: false, error: 'Enter whole days from 1 to 365.' })
  })
  it.each(['0', '366', '-3', '1.5', 'abc', '10 days'])('rejects %s', (raw) => {
    expect(parseFrozenUseBy(raw, { required: false })).toEqual({ ok: false, error: 'Enter whole days from 1 to 365.' })
  })
})

describe('frozenUseByHelper', () => {
  it('says what a blank field means', () => {
    expect(frozenUseByHelper(90)).toBe("Blank uses the Household's 90 days.")
  })
})
