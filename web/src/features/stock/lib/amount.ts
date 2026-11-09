export type AmountError = 'empty' | 'invalid' | 'negative' | 'notPositive'
export type ParsedAmount = { ok: true; value: number } | { ok: false; error: AmountError }

const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/

/**
 * Parses what the User typed. min 'positive' (adding a Stock Lot) rejects 0;
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
