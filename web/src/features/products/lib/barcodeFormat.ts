// Human barcodes. Plain TypeScript, no React. The server stores every product barcode as a 14-digit GTIN
// (leading zeros pad EAN-13, UPC-A and EAN-8); people know the printed form.

export type BarcodeKind = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'GTIN-14' | 'other'

/**
 * Which printed symbology a stored code is. Only 14-digit strings are classified:
 *   "000000" + 8 digits  -> EAN-8
 *   "00" + 12 digits     -> UPC-A  (a UPC-A is an EAN-13 with a leading 0)
 *   "0" + 13 digits      -> EAN-13
 *   non-zero first digit -> GTIN-14 (a trade-unit code, kept whole)
 * Anything else (opaque Shop codes such as "PRIVATE-77", 13-digit input) is 'other'.
 */
export function barcodeKind(code: string): BarcodeKind {
  void code
  throw new Error('not implemented: WP11 barcodeKind')
}

/**
 * The printed form, grouped for reading:
 *   EAN-13  "8001505005707"  -> "8 001505 005707"
 *   EAN-8   "96385074"       -> "9638 5074"
 *   UPC-A   "036000291452"   -> "0 36000 29145 2"
 *   GTIN-14 "18001505005704" -> "1 · 8 001505 005704" (indicator digit, a middle dot, then the other 13 as an EAN-13)
 * Input is a stored 14-digit code; shorter canonical forms (8, 12, 13 digits) are formatted as they are.
 * Anything that is not all digits is returned unchanged.
 */
export function formatBarcode(code: string): string {
  void code
  throw new Error('not implemented: WP11 formatBarcode')
}
