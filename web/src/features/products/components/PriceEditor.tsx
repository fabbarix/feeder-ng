import { Button, DateField, ShopSelect, TextField } from '../../../ui'
import { usePriceForm } from '../hooks/usePriceForm'
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
  onSave: (body: PriceBody) => Promise<void>
  onCancel: () => void
}

/**
 * Shop, date, Price and Price per kg fields (labels from strings). Choosing a Shop prefills the amounts
 * from its latest Price. Save validates with lib/priceForm and calls onSave(toPriceBody(...)); errors show
 * under the fields; a rejection from onSave is shown in an alert.
 */
export function PriceEditor({ shops, latestByShop, currency, today, initialShopId, onSave, onCancel }: PriceEditorProps) {
  const form = usePriceForm({ latestByShop, currency, today, initialShopId, onSave })
  return (
    <form
      className="pg__stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <ShopSelect label={strings.shopLabel} shops={shops} value={form.values.shopId} onChange={form.chooseShop} error={form.errors.shopId} />
      <DateField label={strings.dateLabel} value={form.values.date} onChange={(v) => form.setField('date', v)} error={form.errors.date} />
      <TextField
        label={strings.priceLabel}
        inputMode="decimal"
        value={form.values.price}
        onChange={(v) => form.setField('price', v)}
        error={form.errors.amount}
      />
      <TextField label={strings.pricePerKgLabel} inputMode="decimal" value={form.values.perKg} onChange={(v) => form.setField('perKg', v)} />
      {form.serverError ? <p role="alert">{form.serverError}</p> : null}
      <div className="pg__row">
        <Button type="submit" loading={form.saving}>
          {strings.savePrice}
        </Button>
        <Button variant="tertiary" onClick={onCancel}>
          {strings.cancel}
        </Button>
      </div>
    </form>
  )
}
