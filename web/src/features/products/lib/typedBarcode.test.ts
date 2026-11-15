// B9-30 (SET-04, decision SET 1 = B): a typed Product barcode made only of digits needs 8, 12, 13 or 14 digits and a valid check digit;
// a code with letters (a Shop's own code) is accepted. The server answers 400 invalid_barcode for the same codes (B9-06).
// API pinned (features/products/lib/productForm.ts):
//   typedBarcodeError(raw): string | null    null for '' (an empty field is the form's own business), a code with letters, a valid code
//   strings.errBarcodeLength  = "Enter the 8, 12 or 13 digits under the bars."
//   strings.errBarcodeDigit   = "The last digit doesn't match the others. Check the number."   (SAFE-04 table: right length, wrong check digit)
//   barcodeError(raw) is typedBarcodeError (the same rule everywhere); validateProductForm uses it for the Product form's barcode.
//   barcodeErrorFor(error: unknown): string | null   the field message for a 400 `invalid_barcode` ApiError (the server's code, our copy)
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { barcodeError, barcodeErrorFor, typedBarcodeError, validateProductForm } from './productForm'
import { strings } from '../strings'

const LENGTH = 'Enter the 8, 12 or 13 digits under the bars.'
const DIGIT = "The last digit doesn't match the others. Check the number."

describe('typedBarcodeError', () => {
  it('the copy is the chapter\'s', () => {
    expect(strings.errBarcodeLength).toBe(LENGTH)
    expect(strings.errBarcodeDigit).toBe(DIGIT)
  })

  it('refuses "123": too short', () => {
    expect(typedBarcodeError('123')).toBe(LENGTH)
  })

  it.each(['1234567', '123456789', '12345678901', '123456789012345'])('refuses %s: not 8, 12, 13 or 14 digits', (code) => {
    expect(typedBarcodeError(code)).toBe(LENGTH)
  })

  it('refuses the right length with a wrong check digit, saying so', () => {
    expect(typedBarcodeError('4006381333932')).toBe(DIGIT)
    expect(typedBarcodeError('8001234567890')).toBe(DIGIT)
  })

  it.each(['4006381333931', '96385074', '036000291452', '08001505005707'])('accepts the valid code %s (EAN-13, EAN-8, UPC-A, GTIN-14)', (code) => {
    expect(typedBarcodeError(code)).toBeNull()
  })

  it('accepts a Shop\'s own code with letters', () => {
    expect(typedBarcodeError('PRIVATE-77')).toBeNull()
    expect(typedBarcodeError('A123')).toBeNull()
  })

  it('ignores surrounding spaces and says nothing about an empty field', () => {
    expect(typedBarcodeError('  4006381333931 ')).toBeNull()
    expect(typedBarcodeError('')).toBeNull()
    expect(typedBarcodeError('   ')).toBeNull()
  })

  it('is the same function the Product form and the barcode field use', () => {
    expect(barcodeError('123')).toBe(LENGTH)
    expect(validateProductForm({ name: 'Rice', packSize: '1000', barcode: '123' }).barcode).toBe(LENGTH)
    expect(validateProductForm({ name: 'Rice', packSize: '1000', barcode: '4006381333932' }).barcode).toBe(DIGIT)
    expect(validateProductForm({ name: 'Rice', packSize: '1000', barcode: 'PRIVATE-77' })).toEqual({})
  })
})

describe('barcodeErrorFor (a refusal from the server)', () => {
  it('maps 400 invalid_barcode to the length copy, whatever message the server sent', () => {
    expect(barcodeErrorFor(new ApiError(400, 'invalid_barcode', 'barcode must have 8, 12, 13 or 14 digits'))).toBe(LENGTH)
  })
  it('any other failure is not a barcode error', () => {
    expect(barcodeErrorFor(new ApiError(500, 'internal', 'boom'))).toBeNull()
    expect(barcodeErrorFor(new Error('x'))).toBeNull()
  })
})
