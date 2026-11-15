// Product form rules. Plain TypeScript, no React; messages come from strings.ts.
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import type { NewProduct } from '../types'

/** What the inputs hold (all text). */
export interface ProductFormValues {
  name: string
  packSize: string
  /** optional global barcode as typed or scanned */
  barcode: string
  /** PP: the Picture's image id, "" or absent = none */
  image?: string
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** A positive number with a decimal point or comma; null when it is not one. */
export function parsePackSize(text: string): number | null {
  const t = text.trim()
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * name: 1-100 characters after trimming; packSize: a number > 0 (decimal point or
 * comma); barcode: empty or accepted by `typedBarcodeError`.
 * Returns {} when everything is fine.
 */
export function validateProductForm(v: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {}
  const name = cleanName(v.name)
  if (name === '') errors.name = strings.errNameRequired
  else if ([...name].length > 100) errors.name = strings.errNameTooLong
  if (parsePackSize(v.packSize) === null) errors.packSize = strings.errPackSize
  const barcode = typedBarcodeError(v.barcode)
  if (barcode !== null) errors.barcode = barcode
  return errors
}

/** Trims and collapses the name, parses the pack size, wraps a non-empty barcode in `barcodes`. */
export function toNewProduct(v: ProductFormValues, ingredientId: number): NewProduct {
  const barcode = v.barcode.trim()
  return {
    name: cleanName(v.name),
    ingredientId,
    packSize: parsePackSize(v.packSize) ?? 0,
    barcodes: barcode === '' ? [] : [barcode],
    ...(v.image ? { image: v.image } : {}),
  }
}

/** GS1 check digit: the last digit makes the weighted sum (3, 1, 3, … from the right of the body) a multiple of 10. */
function checkDigitOk(digits: string): boolean {
  let sum = 0
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += (digits.charCodeAt(i) - 48) * w
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(digits.length - 1) - 48
}

const TYPED_LENGTHS = [8, 12, 13, 14]

/**
 * The message for a typed Product barcode (SET 1 = B), or null when it is fine. A code made only of digits needs 8, 12, 13 or 14 digits
 * and a valid check digit; a code with letters (a Shop's own code) is accepted; an empty field is the form's own business.
 */
export function typedBarcodeError(raw: string): string | null {
  const t = raw.trim()
  if (t === '' || !/^\d+$/.test(t)) return null
  if (!TYPED_LENGTHS.includes(t.length)) return strings.errBarcodeLength
  return checkDigitOk(t) ? null : strings.errBarcodeDigit
}

/** The same rule everywhere a barcode is typed. */
export const barcodeError = typedBarcodeError

/** The field message for the server's 400 `invalid_barcode` (its code, our copy); null for any other failure. */
export function barcodeErrorFor(e: unknown): string | null {
  return e instanceof ApiError && e.status === 400 && e.code === 'invalid_barcode' ? strings.errBarcodeLength : null
}

/** Message text of a failed request: the server's own for an Error, else the generic one. */
export function errorText(e: unknown): string {
  return e instanceof Error && e.message !== '' ? e.message : strings.actionFailed
}
