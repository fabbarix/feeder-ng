import { Button } from '../../../ui'
import { usePriceForm } from '../hooks/usePriceForm'
import { strings } from '../strings'
import type { Price, PriceBody, Shop } from '../types'
import { FormField } from './FormField'

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
 * Shop select, date, Price and Price per kg inputs (labels from strings). Choosing a
 * Shop prefills the amounts from `prefillPrice`. Save validates with lib/priceForm and
 * calls onSave(toPriceBody(...)); errors show under the fields; a rejection from onSave
 * is shown in an alert.
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
      <FormField label={strings.shopLabel} error={form.errors.shopId}>
        {(c) => (
          <select
            {...c}
            value={form.values.shopId ?? ''}
            onChange={(e) => form.chooseShop(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">{strings.none}</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label={strings.dateLabel} error={form.errors.date}>
        {(c) => <input {...c} type="date" value={form.values.date} onChange={(e) => form.setField('date', e.target.value)} />}
      </FormField>
      <FormField label={strings.priceLabel} error={form.errors.amount}>
        {(c) => (
          <input {...c} type="text" inputMode="decimal" value={form.values.price} onChange={(e) => form.setField('price', e.target.value)} />
        )}
      </FormField>
      <FormField label={strings.pricePerKgLabel}>
        {(c) => (
          <input {...c} type="text" inputMode="decimal" value={form.values.perKg} onChange={(e) => form.setField('perKg', e.target.value)} />
        )}
      </FormField>
      {form.serverError ? (
        <p role="alert" className="pg__error">
          {form.serverError}
        </p>
      ) : null}
      <div className="pg__row">
        <Button type="submit" loading={form.saving}>
          {strings.savePrice}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {strings.cancel}
        </Button>
      </div>
    </form>
  )
}
