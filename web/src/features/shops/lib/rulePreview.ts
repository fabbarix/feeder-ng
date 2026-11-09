// Live decode of a sample barcode with the rule being edited. Uses the pure
// scan/lib/barcode module, so the preview reads exactly as the phone will.
import { parse, resolve, validateRule, type WeightRule } from '../../scan/lib/barcode'
import { formatMinor } from '../../products/lib/money'
import { strings } from '../strings'

export type RulePreview =
  | { state: 'idle' }
  /** reason: empty | length | format | check_digit | zero_value */
  | { state: 'invalid'; reason: string }
  | { state: 'nomatch' }
  | { state: 'ok'; itemCode: string; weightGrams?: number; priceCents?: number }

const SAMPLE_ITEM_ID = 1

/**
 * Decodes `sample` (the 13-digit EAN form; exactly 12 digits are read as UPC-A, which
 * gives the same 13-digit form with a leading 0) with only `rule` in play.
 * Blank sample -> idle. A rule that fails validateRule -> nomatch. Otherwise: invalid
 * scans -> invalid; a barcode the rule does not match -> nomatch; a zero value ->
 * invalid/zero_value; else ok with the item code and weightGrams (weight rule, always
 * grams) or priceCents (price rule, minor units).
 */
export function decodeSample(rule: WeightRule, sample: string): RulePreview {
  const text = sample.trim()
  if (text === '') return { state: 'idle' }
  if (!/^\d+$/.test(text)) return { state: 'invalid', reason: 'format' }
  if (text.length !== 12 && text.length !== 13) return { state: 'invalid', reason: 'length' }
  const scanned = parse(text, '')
  if (scanned.kind === 'invalid') return { state: 'invalid', reason: scanned.reason ?? 'format' }
  if (validateRule(rule) !== null || scanned.ean13 === undefined) return { state: 'nomatch' }
  if (!scanned.ean13.startsWith(rule.prefix)) return { state: 'nomatch' }

  const itemCode = scanned.ean13.slice(rule.item.start - 1, rule.item.start - 1 + rule.item.length)
  const r = { ...rule, id: SAMPLE_ITEM_ID }
  const res = resolve(scanned, {
    weightRules: [r],
    weightProducts: { [`${SAMPLE_ITEM_ID}:${itemCode}`]: 1 },
    pricePerKgCents: { '1': 1 },
  })
  if (res.outcome === 'invalid') return { state: 'invalid', reason: res.reason ?? 'zero_value' }
  if (rule.valueKind === 'weight') return { state: 'ok', itemCode, weightGrams: res.weightGrams }
  return { state: 'ok', itemCode, priceCents: res.priceCents }
}

/**
 * One line for the UI: "Item 00123 · 750 g", "Item 12345 · 680.389 g" or
 * "Item 00123 · $4.50"; the message from strings for the other states.
 */
export function previewText(p: RulePreview, currency: string): string {
  switch (p.state) {
    case 'idle':
      return strings.previewIdle
    case 'nomatch':
      return strings.previewNoMatch
    case 'invalid': {
      const msgs = strings.previewInvalid as Record<string, string>
      return msgs[p.reason] ?? strings.previewInvalid.format
    }
    case 'ok': {
      const value =
        p.weightGrams !== undefined
          ? `${p.weightGrams} g`
          : p.priceCents !== undefined
            ? formatMinor(p.priceCents, currency)
            : ''
      return value === '' ? strings.previewItem(p.itemCode) : `${strings.previewItem(p.itemCode)} · ${value}`
    }
  }
}
