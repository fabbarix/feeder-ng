import { useState } from 'react'
import { formatPackSize } from '../lib/names'
import { parsePackSize } from '../lib/productForm'
import { strings } from '../strings'
import type { ProductDetail } from '../types'

/**
 * SET-04: the Pack size field beside its Save. Save is enabled only for a changed, valid value; then the hint says what it was and that
 * the per-kg Prices follow. A value that is not a pack size is the field's error.
 */
export function usePackSize(product: ProductDetail, save: (size: number) => Promise<boolean>) {
  const [text, setText] = useState<string | null>(null)
  const value = text ?? String(product.packSize)
  const size = parsePackSize(value)
  const changed = size !== null && size !== product.packSize
  return {
    value,
    setValue: setText,
    error: size === null ? strings.errPackSize : undefined,
    canSave: changed,
    hint: changed ? strings.packWas(formatPackSize(product.packSize, product.baseUnit)) : null,
    submit: async () => {
      if (size === null || !changed) return
      if (await save(size)) setText(null)
    },
  }
}
