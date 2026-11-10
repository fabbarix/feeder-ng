import { useState } from 'react'
import { BottomSheet, Button, Chip, SearchField, Select, TextField } from '../../../ui'
import { useProducts } from '../../products/hooks/useProducts'
import { useShopBarcodeForm } from '../hooks/useShopBarcodeForm'
import { ruleSummary, type toShopBarcodeBody } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { ShopRule } from '../types'

export interface AddShopBarcodeSheetProps {
  open: boolean
  rules: ShopRule[]
  /** The Household Currency, for the rule summaries of price rules. */
  currency?: string
  onClose: () => void
  /** A rejection's message is shown in an alert. */
  onAdd: (body: ReturnType<typeof toShopBarcodeBody>) => Promise<void>
}

/** BottomSheet "Add Shop Barcode": pick a Product (search), then a plain code or a Weight Barcode Rule with its item code. */
export function AddShopBarcodeSheet({ open, rules, currency, onClose, onAdd }: AddShopBarcodeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={strings.addShopBarcode}>
      {open ? <AddShopBarcodeForm rules={rules} currency={currency} onClose={onClose} onAdd={onAdd} /> : null}
    </BottomSheet>
  )
}

function AddShopBarcodeForm({ rules, currency, onClose, onAdd }: Omit<AddShopBarcodeSheetProps, 'open' | 'onClose'> & { onClose: () => void }) {
  const [q, setQ] = useState('')
  const { products } = useProducts(q)
  const form = useShopBarcodeForm(rules, async (body) => {
    await onAdd(body)
    onClose()
  })
  const chosen = products.find((p) => p.id === form.values.productId)
  const ruleOptions = [
    { value: '', label: strings.shopBarcodeNoRule },
    ...rules.map((r) => ({ value: String(r.id), label: strings.rulePrefix(r.prefix), meta: ruleSummary(r, currency ?? '') })),
  ]
  return (
    <form
      className="pg__stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <SearchField label={strings.productSearchLabel} value={q} onChange={setQ} />
      <p className="pg__muted">{chosen ? chosen.name : strings.productPickerHint}</p>
      {form.errors.productId ? (
        <p role="alert" className="pg__error">
          {form.errors.productId}
        </p>
      ) : null}
      <div className="pg__row">
        {products.slice(0, 12).map((p) => (
          <Chip key={p.id} kind="filter" selected={p.id === form.values.productId} onClick={() => form.set({ productId: p.id })}>
            {p.name}
          </Chip>
        ))}
      </div>
      {rules.length > 0 ? (
        <Select
          label={strings.shopBarcodeRuleLabel}
          options={ruleOptions}
          value={form.values.ruleId === null ? '' : String(form.values.ruleId)}
          onChange={(v) => form.set({ ruleId: v === '' ? null : Number(v) })}
        />
      ) : null}
      {form.values.ruleId === null ? (
        <TextField label={strings.shopBarcodeCodeLabel} value={form.values.code} onChange={(code) => form.set({ code })} error={form.errors.code} />
      ) : (
        <TextField
          label={strings.itemCodeLabel}
          inputMode="numeric"
          value={form.values.itemCode}
          onChange={(itemCode) => form.set({ itemCode })}
          error={form.errors.itemCode}
        />
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
