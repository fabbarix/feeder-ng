import { useEffect, useId, useRef } from 'react'
import { Button, Chip, Cluster, DetailList, DetailRow, FieldRow, Muted, SectionTitle, Stack, TextField } from '../../../ui'
import { useBarcodeAdd } from '../hooks/useBarcodeAdd'
import { formatBarcode } from '../lib/barcodeFormat'
import { shopBarcodeRows } from '../lib/shopBarcodeRows'
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
  /** Rejects with the server's refusal, shown at the Barcode field. */
  onAdd: (raw: string) => Promise<void>
  /** Gets the stored code (the label on screen is the human form); removes it at once (the screen offers Undo). */
  onRemove: (code: string) => void
}

/**
 * SET-04: the barcodes as removable Chips ("8 001505 005707 ×", one button each), the Barcode field with an outline "Add barcode", then
 * the Shop Barcodes as R-E rows. After a removal focus moves to the next Chip, or to the field when none is left.
 */
export function ProductBarcodes({ barcodes, shopBarcodes, shops, rules, onAdd, onRemove }: ProductBarcodesProps) {
  const field = useBarcodeAdd(onAdd)
  const fieldId = useId()
  const chips = useRef<HTMLDivElement>(null)
  const removedAt = useRef<number | null>(null)

  useEffect(() => {
    const at = removedAt.current
    if (at === null) return
    removedAt.current = null
    const next = chips.current?.querySelectorAll<HTMLElement>('button.chip')
    const target = next && next.length > 0 ? next[Math.min(at, next.length - 1)] : document.getElementById(fieldId)
    target?.focus()
  }, [barcodes, fieldId])

  const rows = shopBarcodeRows(shopBarcodes, shops, rules)
  return (
    <Stack>
      {barcodes.length === 0 ? (
        <Muted>{strings.noBarcodes}</Muted>
      ) : (
        <div ref={chips}>
          <Cluster>
            {barcodes.map((code, i) => (
              <Chip
                key={code}
                kind="tag"
                removeLabel={strings.removeBarcode(formatBarcode(code))}
                onRemove={() => {
                  removedAt.current = i
                  onRemove(code)
                }}
              >
                {formatBarcode(code)}
              </Chip>
            ))}
          </Cluster>
        </div>
      )}
      <form
        ref={field.formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void field.submit()
        }}
      >
        <FieldRow align="end">
          <TextField id={fieldId} size="md" label={strings.barcodeLabel} inputMode="numeric" data-size-intent="long" value={field.text} onChange={field.setText} error={field.error ?? undefined} />
          <Button type="submit" variant="secondary" icon="add">
            {strings.addBarcode}
          </Button>
        </FieldRow>
      </form>
      <div className="product-barcodes__shop">
        <SectionTitle as="h3">{strings.shopBarcodesTitle}</SectionTitle>
        {rows.length === 0 ? (
          <Muted>{strings.noShopBarcodesYet}</Muted>
        ) : (
          <DetailList>
            {rows.map((r) => (
              <DetailRow key={r.id} label={r.key} state={r.state} detail={r.detail} />
            ))}
          </DetailList>
        )}
      </div>
    </Stack>
  )
}
