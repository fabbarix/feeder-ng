// Validation of a barcode typed by hand when the camera does not work (B4). Pure TypeScript, reuses ./barcode parse.
import { parse, type Scanned } from './barcode'

export type ManualBarcodeError = 'empty' | 'length' | 'format' | 'check_digit'

export type ManualBarcodeResult = { ok: true; scanned: Scanned } | { ok: false; reason: ManualBarcodeError }

/**
 * Spaces and hyphens people type between digit groups are dropped first. A GTIN (EAN-8, UPC-A, EAN-13, GTIN-14)
 * with a good check digit is accepted as the same Scanned a camera read gives. A bad check digit is `check_digit`;
 * any other digit string that is not a GTIN length is `length`; everything else is `format`.
 */
export function validateManualBarcode(raw: string): ManualBarcodeResult {
  const digits = raw.replace(/[\s-]/g, '')
  if (digits === '') return { ok: false, reason: 'empty' }
  const parsed = parse(digits, '')
  switch (parsed.kind) {
    case 'gtin':
      return { ok: true, scanned: parsed }
    case 'invalid':
      if (parsed.reason === 'check_digit' || parsed.reason === 'length' || parsed.reason === 'format') {
        return { ok: false, reason: parsed.reason }
      }
      return { ok: false, reason: 'format' }
    default:
      return { ok: false, reason: /^\d+$/.test(digits) ? 'length' : 'format' }
  }
}
