export { clampTo as clamp, stepValue } from '../lib/stepValue'

export type ParsedNumber = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'number'; value: number }

const NUMBER = /^-?(\d+([.,]\d+)?|[.,]\d+)$/

/** Accepts "2.5" and "2,5", surrounding spaces; "" is empty; anything else (including "1e3", "1.2.3") is invalid. */
export function parseNumber(text: string): ParsedNumber {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'empty' }
  if (!NUMBER.test(trimmed)) return { kind: 'invalid' }
  return { kind: 'number', value: Number(trimmed.replace(',', '.')) }
}
