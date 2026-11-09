import { useState } from 'react'
import { Button, Chip } from '../../../ui'
import { barcodeError, errorText } from '../lib/productForm'
import { strings } from '../strings'
import type { Shop, ShopBarcode } from '../types'
import { FormField } from './FormField'
import '../products.css'

export interface ProductBarcodesProps {
  barcodes: string[]
  shopBarcodes: ShopBarcode[]
  shops: Shop[]
  onAdd: (raw: string) => Promise<void>
  onRemove: (code: string) => void
}

/** Global barcodes as chips with remove, an add input (validated with scan/lib canonical), and the Shop Barcodes read-only per Shop. */
export function ProductBarcodes({ barcodes, shopBarcodes, shops, onAdd, onRemove }: ProductBarcodesProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    const t = text.trim()
    const invalid = t === '' ? strings.errBarcode : barcodeError(t)
    if (invalid) return setError(invalid)
    try {
      await onAdd(t)
      setText('')
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const shopName = (id: number) => shops.find((s) => s.id === id)?.name ?? strings.unknownShop

  return (
    <div className="pg__stack">
      {barcodes.length === 0 ? (
        <p className="pg__muted">{strings.noBarcodes}</p>
      ) : (
        <div className="pg__row">
          {barcodes.map((code) => (
            <span key={code} className="pg__row">
              <Chip>{code}</Chip>
              <Button variant="ghost" aria-label={strings.removeBarcode(code)} onClick={() => onRemove(code)}>
                ×
              </Button>
            </span>
          ))}
        </div>
      )}
      <form
        className="pg__stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <FormField label={strings.barcodeLabel} error={error ?? undefined}>
          {(c) => <input {...c} type="text" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />}
        </FormField>
        <Button type="submit" variant="tonal">
          {strings.addBarcode}
        </Button>
      </form>
      <h3 className="pg__tile-title">{strings.shopBarcodesTitle}</h3>
      {shopBarcodes.length === 0 ? (
        <p className="pg__muted">{strings.noShopBarcodes}</p>
      ) : (
        <ul className="pg__list">
          {shopBarcodes.map((b) => (
            <li key={b.id}>
              {shopName(b.shopId)} · {b.code ?? strings.shopBarcodeWeighed(b.ruleId ?? 0, b.itemCode ?? '')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
