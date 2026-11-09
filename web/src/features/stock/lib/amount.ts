import type { BaseUnit } from '../types'

/** "300 g", "1.5 ml", "1 piece", "2 pieces": at most 2 decimals, trailing zeros trimmed. Metric only for now. */
export function formatAmount(quantity: number, base: BaseUnit): string {
  void quantity
  void base
  throw new Error('TODO')
}

export type AmountError = 'empty' | 'invalid' | 'negative' | 'notPositive'
export type ParsedAmount = { ok: true; value: number } | { ok: false; error: AmountError }

/**
 * Parses what the person typed. min 'positive' (adding a Stock Lot) rejects 0;
 * 'nonNegative' (Set total) accepts 0. Accepts a decimal comma ("1,5").
 */
export function parseAmount(text: string, min: 'positive' | 'nonNegative'): ParsedAmount {
  void text
  void min
  throw new Error('TODO')
}
