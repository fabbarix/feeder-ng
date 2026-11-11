// Product form rules. Plain TypeScript, no React; messages come from strings.ts.
import { canonical } from '../../scan/lib/barcode'
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
 * comma); barcode: empty or readable (scan/lib/barcode `canonical` is not null).
 * Returns {} when everything is fine.
 */
export function validateProductForm(v: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {}
  const name = cleanName(v.name)
  if (name === '') errors.name = strings.errNameRequired
  else if ([...name].length > 100) errors.name = strings.errNameTooLong
  if (parsePackSize(v.packSize) === null) errors.packSize = strings.errPackSize
  if (v.barcode.trim() !== '' && canonical(v.barcode.trim()) === null) errors.barcode = strings.errBarcode
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
  }
}

/** The message for a typed barcode that cannot be read, or null when it is fine (or empty). */
export function barcodeError(raw: string): string | null {
  const t = raw.trim()
  return t === '' || canonical(t) !== null ? null : strings.errBarcode
}

/** Message text of a failed request: the server's own for an Error, else the generic one. */
export function errorText(e: unknown): string {
  return e instanceof Error && e.message !== '' ? e.message : strings.actionFailed
}
