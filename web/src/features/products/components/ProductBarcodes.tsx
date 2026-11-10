import { useState } from 'react'
import { Button, Chip, IconButton, ListGroup, ListRow, TextField } from '../../../ui'
import { barcodeError, errorText } from '../lib/productForm'
import { formatBarcode } from '../lib/barcodeFormat'
import { shopBarcodeLabel } from '../../shops/lib/shopBarcodeForm'
import type { ShopRule } from '../../shops/types'
import { strings } from '../strings'
import type { Shop, ShopBarcode } from '../types'
import '../products.css'

export interface ProductBarcodesProps {
  barcodes: string[]
  shopBarcodes: ShopBarcode[]
  shops: Shop[]
  /** The weight rules of the Shops that hold weighed codes (names the prefix, never the rule id). */
  rules: ShopRule[]
  onAdd: (raw: string) => Promise<void>
  /** Gets the stored code (the label on screen is the human form). */
  onRemove: (code: string) => void
}

/** Global barcodes as Chips with remove, an add field (validated with scan/lib canonical), and the Shop Barcodes read-only per Shop. */
export function ProductBarcodes({ barcodes, shopBarcodes, shops, rules, onAdd, onRemove }: ProductBarcodesProps) {
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
              <Chip kind="tag">{formatBarcode(code)}</Chip>
              <IconButton icon="close" label={strings.removeBarcode(formatBarcode(code))} onClick={() => onRemove(code)} />
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
        <TextField label={strings.barcodeLabel} inputMode="numeric" value={text} onChange={setText} error={error ?? undefined} />
        <Button type="submit" variant="tertiary">
          {strings.addBarcode}
        </Button>
      </form>
      <h3 className="pg__tile-title">{strings.shopBarcodesTitle}</h3>
      {shopBarcodes.length === 0 ? (
        <p className="pg__muted">{strings.noShopBarcodes}</p>
      ) : (
        <ListGroup label={strings.shopBarcodesTitle}>
          {shopBarcodes.map((b) => (
            <ListRow key={b.id} title={`${shopName(b.shopId)} · ${shopBarcodeLabel(b, rules)}`} />
          ))}
        </ListGroup>
      )}
    </div>
  )
}
