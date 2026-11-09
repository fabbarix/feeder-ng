import type { BaseUnit } from '../types'

/**
 * Metric wording at stock precision: at most 2 decimals, half up, trailing zeros trimmed
 * ("300 g", "1.5 ml", "2.35 g", "1 piece", "2 pieces"). The screens show amounts through
 * lib/units formatQuantity so they follow the User's unit system; this stays metric.
 */
export function formatAmount(quantity: number, base: BaseUnit): string {
  if (!Number.isFinite(quantity)) return ''
  const micro = Math.round(Math.abs(quantity) * 1e6)
  const centi = Math.floor((micro + 5000) / 10000)
  const whole = Math.floor(centi / 100)
  const frac = centi % 100
  let num = String(whole)
  if (frac !== 0) num += frac % 10 === 0 ? `.${frac / 10}` : `.${String(frac).padStart(2, '0')}`
  if (quantity < 0 && centi !== 0) num = `-${num}`
  if (base === 'piece') return `${num} ${num === '1' ? 'piece' : 'pieces'}`
  return `${num} ${base}`
}

export type AmountError = 'empty' | 'invalid' | 'negative' | 'notPositive'
export type ParsedAmount = { ok: true; value: number } | { ok: false; error: AmountError }

const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/

/**
 * Parses what the person typed. min 'positive' (adding a Stock Lot) rejects 0;
 * 'nonNegative' (Set total) accepts 0. Accepts a decimal comma ("1,5").
 */
export function parseAmount(text: string, min: 'positive' | 'nonNegative'): ParsedAmount {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, error: 'empty' }
  const normalised = trimmed.replace(',', '.')
  if (!PLAIN_NUMBER.test(normalised)) return { ok: false, error: 'invalid' }
  const value = Number(normalised)
  if (!Number.isFinite(value)) return { ok: false, error: 'invalid' }
  if (value < 0) return { ok: false, error: 'negative' }
  if (value === 0 && min === 'positive') return { ok: false, error: 'notPositive' }
  return { ok: true, value }
}
