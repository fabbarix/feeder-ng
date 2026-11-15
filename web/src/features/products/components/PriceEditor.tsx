import { useId } from 'react'
import { BottomSheet, Button, DateField, FieldRow, ShopSelect, Stack, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { usePriceForm } from '../hooks/usePriceForm'
import { formatPriceDate, priceValues } from '../lib/priceRows'
import { strings } from '../strings'
import type { Price, PriceBody, Shop } from '../types'

export interface PriceEditorProps {
  shops: Shop[]
  /** latest Price per Shop id, used to prefill */
  latestByShop: Record<number, Price | undefined>
  currency: string
  /** YYYY-MM-DD, the default date */
  today: string
  initialShopId?: number
  /** SET-04: the Price sheet of a row: shows that Price, is titled by its Shop and offers Delete Price. */
  price?: Price
  /** Deletes the shown Price at once (the screen offers Undo). */
  onDelete?: () => void
  onSave: (body: PriceBody) => Promise<void>
  onCancel: () => void
}

/**
 * Shop, date, Price and Price per kg fields (labels from strings). Choosing a Shop prefills the amounts
 * from its latest Price. Save validates with lib/priceForm and calls onSave(toPriceBody(...)); errors show
 * under the fields, the first invalid one focused; a rejection from onSave is the form's FormError. It is the "Add Price" sheet: Cancel and Save are its footer
 * (VC2: no Close); the caller mounts it while it is open, so every open starts a fresh form.
 */
export function PriceEditor({ shops, latestByShop, currency, today, initialShopId, price, onDelete, onSave, onCancel }: PriceEditorProps) {
  const form = usePriceForm({ latestByShop, currency, today, initialShopId, initialPrice: price, onSave })
  const shopName = price ? (shops.find((s) => s.id === price.shopId)?.name ?? strings.unknownShop) : null
  const formId = useId()
  return (
    <BottomSheet
      open
      onClose={onCancel}
      onCancel={onCancel}
      cancelLabel={strings.cancel}
      submit={{ label: strings.savePrice, form: formId, loading: form.saving }}
      title={shopName ? strings.priceAt(shopName) : strings.addPrice}
    >
      <form
        id={formId}
        ref={form.formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.submit()
        }}
      >
        <Stack>
          <ShopSelect label={strings.shopLabel} shops={shops} value={form.values.shopId} onChange={form.chooseShop} error={form.errors.shopId} />
          <DateField label={strings.dateLabel} value={form.values.date} onChange={(v) => form.setField('date', v)} error={form.errors.date} />
          <FieldRow>
            <TextField
              size="sm"
              label={strings.priceLabel}
              inputMode="decimal"
              value={form.values.price}
              onChange={(v) => form.setField('price', v)}
              error={form.errors.amount}
            />
            <TextField size="sm" label={strings.pricePerKgLabel} inputMode="decimal" value={form.values.perKg} onChange={(v) => form.setField('perKg', v)} />
          </FieldRow>
          <FormError>{form.serverError}</FormError>
          {price && onDelete ? (
            <div>
              <Button
                variant="danger-secondary"
                icon="delete"
                aria-label={strings.deletePriceName(shopName ?? strings.unknownShop, formatPriceDate(price.date, today), priceValues(price, currency).value)}
                onClick={onDelete}
              >
                {strings.deletePrice}
              </Button>
            </div>
          ) : null}
        </Stack>
      </form>
    </BottomSheet>
  )
}
