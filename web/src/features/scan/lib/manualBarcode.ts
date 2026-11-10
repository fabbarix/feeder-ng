// Validation of a barcode typed by hand when the camera does not work (B4). Pure TypeScript, reuses ./barcode parse.
import type { Scanned } from './barcode'

export type ManualBarcodeError = 'empty' | 'length' | 'format' | 'check_digit'

export type ManualBarcodeResult = { ok: true; scanned: Scanned } | { ok: false; reason: ManualBarcodeError }

/** Stub until implemented; see docs/dev/design/r3-scan-fixes.md. */
export function validateManualBarcode(raw: string): ManualBarcodeResult {
  void raw
  return { ok: false, reason: 'empty' }
}
