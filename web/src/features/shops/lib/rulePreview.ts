// Live decode of a sample barcode with the rule being edited. Uses the pure
// scan/lib/barcode module, so the preview reads exactly as the phone will.
import type { WeightRule } from '../../scan/lib/barcode'

export type RulePreview =
  | { state: 'idle' }
  /** reason: empty | length | format | check_digit | zero_value */
  | { state: 'invalid'; reason: string }
  | { state: 'nomatch' }
  | { state: 'ok'; itemCode: string; weightGrams?: number; priceCents?: number }

/**
 * Decodes `sample` (the 13-digit EAN form; exactly 12 digits are read as UPC-A, which
 * gives the same 13-digit form with a leading 0) with only `rule` in play.
 * Blank sample -> idle. A rule that fails validateRule -> nomatch. Otherwise: invalid
 * scans -> invalid; a barcode the rule does not match -> nomatch; a zero value ->
 * invalid/zero_value; else ok with the item code and weightGrams (weight rule, always
 * grams) or priceCents (price rule, minor units).
 */
export function decodeSample(rule: WeightRule, sample: string): RulePreview {
  void rule; void sample
  throw new Error('TODO')
}

/**
 * One line for the UI: "Item 00123 · 750 g", "Item 12345 · 680.389 g" or
 * "Item 00123 · $4.50"; the message from strings for the other states.
 */
export function previewText(p: RulePreview, currency: string): string {
  void p; void currency
  throw new Error('TODO')
}
