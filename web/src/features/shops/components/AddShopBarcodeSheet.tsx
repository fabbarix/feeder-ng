import { useState } from 'react'
import { BottomSheet, Button, Chip } from '../../../ui'
import { FormField } from '../../products/components/FormField'
import { useProducts } from '../../products/hooks/useProducts'
import { useShopBarcodeForm } from '../hooks/useShopBarcodeForm'
import type { toShopBarcodeBody } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { ShopRule } from '../types'

export interface AddShopBarcodeSheetProps {
  open: boolean
  rules: ShopRule[]
  onClose: () => void
  /** A rejection's message is shown in an alert. */
  onAdd: (body: ReturnType<typeof toShopBarcodeBody>) => Promise<void>
}

/** BottomSheet "Add Shop Barcode": pick a Product (search), then a plain code or a Weight Barcode Rule with its item code. */
export function AddShopBarcodeSheet({ open, rules, onClose, onAdd }: AddShopBarcodeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={strings.addShopBarcode}>
      {open ? <AddShopBarcodeForm rules={rules} onClose={onClose} onAdd={onAdd} /> : null}
    </BottomSheet>
  )
}

function AddShopBarcodeForm({ rules, onClose, onAdd }: Omit<AddShopBarcodeSheetProps, 'open'>) {
  const [q, setQ] = useState('')
  const { products } = useProducts(q)
  const form = useShopBarcodeForm(rules, async (body) => {
    await onAdd(body)
    onClose()
  })
  const chosen = products.find((p) => p.id === form.values.productId)
  return (
    <form
      className="pg__stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <FormField label={strings.productSearchLabel} error={form.errors.productId} hint={chosen ? chosen.name : strings.productPickerHint}>
        {(c) => <input {...c} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
      </FormField>
      <div className="pg__row">
        {products.slice(0, 12).map((p) => (
          <Chip key={p.id} selected={p.id === form.values.productId} onClick={() => form.set({ productId: p.id })}>
            {p.name}
          </Chip>
        ))}
      </div>
      {rules.length > 0 ? (
        <FormField label={strings.shopBarcodeRuleLabel}>
          {(c) => (
            <select {...c} value={form.values.ruleId ?? ''} onChange={(e) => form.set({ ruleId: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">{strings.shopBarcodeNoRule}</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.prefix}
                </option>
              ))}
            </select>
          )}
        </FormField>
      ) : null}
      {form.values.ruleId === null ? (
        <FormField label={strings.shopBarcodeCodeLabel} error={form.errors.code}>
          {(c) => <input {...c} type="text" value={form.values.code} onChange={(e) => form.set({ code: e.target.value })} />}
        </FormField>
      ) : (
        <FormField label={strings.itemCodeLabel} error={form.errors.itemCode}>
          {(c) => <input {...c} type="text" inputMode="numeric" value={form.values.itemCode} onChange={(e) => form.set({ itemCode: e.target.value })} />}
        </FormField>
      )}
      {form.serverError ? (
        <p role="alert" className="pg__error">
          {form.serverError}
        </p>
      ) : null}
      <Button type="submit" loading={form.saving}>
        {strings.saveShopBarcode}
      </Button>
    </form>
  )
}
