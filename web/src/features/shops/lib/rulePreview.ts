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

/** Grams in one unit of a weight rule (g is the default, so it is absent). */
const GRAMS_PER_UNIT: Record<string, number> = { kg: 1000, oz: 28.349523125, lb: 453.59237 }

/** Rounds to 3 decimals and drops trailing zeros: 1.500 -> "1.5", 680.3885 -> "680.389". */
function shortNumber(n: number): string {
  return String(Number(n.toFixed(3)))
}

/**
 * One line for the UI: "Item 00123 · 750 g", "Item 00123 · 0.5 kg (500 g)", "Item 12345 · 1.5 lb (680.389 g)"
 * (weightUnit is the rule's unit: a non-gram unit shows the weight in that unit, then in grams), or
 * "Item 00123 · $4.50"; the message from strings for the other states.
 */
export function previewText(p: RulePreview, currency: string, weightUnit?: string): string {
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
          ? weightText(p.weightGrams, weightUnit)
          : p.priceCents !== undefined
            ? formatMinor(p.priceCents, currency)
            : ''
      return value === '' ? strings.previewItem(p.itemCode) : `${strings.previewItem(p.itemCode)} · ${value}`
    }
  }
}

function weightText(grams: number, unit: string | undefined): string {
  const perUnit = unit !== undefined ? GRAMS_PER_UNIT[unit] : undefined
  const gramsText = `${shortNumber(grams)} g`
  if (perUnit === undefined) return gramsText
  return `${shortNumber(grams / perUnit)} ${unit} (${gramsText})`
}
