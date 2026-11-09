// Shop Barcode form rules. Plain TypeScript, no React.
import { canonical } from '../../scan/lib/barcode'
import { strings } from '../strings'
import type { ShopRule } from '../types'

export interface ShopBarcodeFormValues {
  productId: number | null
  /** plain code as typed; used when ruleId is null */
  code: string
  /** weighed: the rule and the digits it reads */
  ruleId: number | null
  itemCode: string
}

export type ShopBarcodeFormErrors = Partial<Record<'productId' | 'code' | 'itemCode', string>>

export function validateShopBarcodeForm(v: ShopBarcodeFormValues, rules: ShopRule[]): ShopBarcodeFormErrors {
  const errors: ShopBarcodeFormErrors = {}
  if (v.productId === null) errors.productId = strings.chooseProduct
  if (v.ruleId === null) {
    if (v.code.trim() === '' || canonical(v.code.trim()) === null) errors.code = strings.errBarcode
  } else {
    const rule = rules.find((r) => r.id === v.ruleId)
    const len = rule?.item.length ?? 0
    if (!/^\d+$/.test(v.itemCode) || v.itemCode.length !== len) errors.itemCode = strings.errItemCode(len)
  }
  return errors
}

/** Request body; call after validateShopBarcodeForm is {}. */
export function toShopBarcodeBody(
  v: ShopBarcodeFormValues,
): { productId: number; code: string } | { productId: number; ruleId: number; itemCode: string } {
  const productId = v.productId ?? 0
  if (v.ruleId !== null) return { productId, ruleId: v.ruleId, itemCode: v.itemCode }
  return { productId, code: v.code.trim() }
}

/** "rule 21 · item 00123" or the plain code, for listing. */
export function shopBarcodeLabel(
  b: { code?: string; ruleId?: number; itemCode?: string },
  rules: ShopRule[],
): string {
  if (b.code !== undefined) return b.code
  const prefix = rules.find((r) => r.id === b.ruleId)?.prefix ?? String(b.ruleId ?? '')
  return `rule ${prefix} · item ${b.itemCode ?? ''}`
}

/** "21 · item 3-7 · value 8-12 · weight in kg, 3 decimals" (price: "price in USD minor units"). */
export function ruleSummary(rule: ShopRule, currency: string): string {
  const span = (s: { start: number; length: number }) => `${s.start}-${s.start + s.length - 1}`
  const what =
    rule.valueKind === 'price'
      ? strings.rulePrice(currency)
      : strings.ruleWeight(rule.valueUnit ?? 'g', rule.decimalPlaces)
  return `${rule.prefix} · ${strings.rulePositions(span(rule.item), span(rule.value))} · ${what}`
}
