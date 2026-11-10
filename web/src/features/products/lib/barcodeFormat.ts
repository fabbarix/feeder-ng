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
  if (!/^\d{14}$/.test(code)) return 'other'
  if (code.startsWith('000000')) return 'EAN-8'
  if (code.startsWith('00')) return 'UPC-A'
  if (code.startsWith('0')) return 'EAN-13'
  return 'GTIN-14'
}

/** 13 digits as an EAN-13 reads: 1-6-6. */
const ean13 = (d: string) => `${d.slice(0, 1)} ${d.slice(1, 7)} ${d.slice(7)}`
/** 12 digits as a UPC-A reads: 1-5-5-1. */
const upcA = (d: string) => `${d.slice(0, 1)} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d.slice(11)}`
/** 8 digits as an EAN-8 reads: 4-4. */
const ean8 = (d: string) => `${d.slice(0, 4)} ${d.slice(4)}`

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
  if (!/^\d+$/.test(code)) return code
  if (code.length === 14) {
    switch (barcodeKind(code)) {
      case 'EAN-8':
        return ean8(code.slice(6))
      case 'UPC-A':
        return upcA(code.slice(2))
      case 'EAN-13':
        return ean13(code.slice(1))
      case 'GTIN-14':
        return `${code.slice(0, 1)} · ${ean13(code.slice(1))}`
      default:
        return code
    }
  }
  if (code.length === 13) return ean13(code)
  if (code.length === 12) return upcA(code)
  if (code.length === 8) return ean8(code)
  return code
}
