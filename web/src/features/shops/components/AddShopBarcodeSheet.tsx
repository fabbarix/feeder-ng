import { useId } from 'react'
import { BottomSheet, Muted, ProductSelect, Select, Stack, TextField, TextLink } from '../../../ui'
import { useProductChoices } from '../hooks/useProductChoices'
import { useShopBarcodeForm } from '../hooks/useShopBarcodeForm'
import { ruleSummary, type toShopBarcodeBody } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { ShopRule } from '../types'

export interface AddShopBarcodeSheetProps {
  open: boolean
  shop: { id: number; name: string }
  rules: ShopRule[]
  /** The Household Currency, for the rule summaries of price rules. */
  currency?: string
  /** The Products the Shop has a Price or a Shop Barcode for: listed first, under "Sold at <Shop>". */
  soldAtProductIds?: number[]
  onClose: () => void
  /** A rejection's message is the code field's error. */
  onAdd: (body: ReturnType<typeof toShopBarcodeBody>) => Promise<void>
}

const NONE: number[] = []

/**
 * SET-01: "Add Shop Barcode": the crafted Product Select, a Weight Barcode Rule (only when the Shop has rules) and the Code (or Item code).
 * The footer has Cancel and Save Shop Barcode, so the sheet has no Close (R-B).
 */
export function AddShopBarcodeSheet(props: AddShopBarcodeSheetProps) {
  return props.open ? <AddShopBarcodeOpen {...props} /> : null
}

function AddShopBarcodeOpen({ shop, rules, currency, soldAtProductIds = NONE, onClose, onAdd }: AddShopBarcodeSheetProps) {
  const formId = useId()
  const { choices, isLoading } = useProductChoices(shop.id, soldAtProductIds)
  const form = useShopBarcodeForm(rules, async (body) => {
    await onAdd(body)
    onClose()
  })
  const ruleOptions = [
    { value: '', label: strings.shopBarcodeNoRule },
    ...rules.map((r) => ({ value: String(r.id), label: strings.rulePrefix(r.prefix), meta: ruleSummary(r, currency ?? '') })),
  ]
  return (
    <BottomSheet
      open
      onClose={onClose}
      onCancel={onClose}
      cancelLabel={strings.cancel}
      submit={{ label: strings.saveShopBarcode, form: formId, loading: form.saving }}
      title={strings.addShopBarcode}
    >
      <form
        id={formId}
        ref={form.formRef}
        className="shop-barcode-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.submit()
        }}
      >
        {!isLoading && choices.length === 0 ? (
          <Stack gap="2">
            <Muted>{strings.noProductToChoose}</Muted>
            <TextLink to="/products">{strings.productsLink}</TextLink>
          </Stack>
        ) : (
          <ProductSelect
            label={strings.productSearchLabel}
            products={choices}
            shop={shop}
            value={form.values.productId}
            onChange={(productId) => form.set({ productId })}
            error={form.errors.productId}
          />
        )}
        {rules.length > 0 ? (
          <Select
            label={strings.shopBarcodeRuleLabel}
            options={ruleOptions}
            value={form.values.ruleId === null ? '' : String(form.values.ruleId)}
            onChange={(v) => form.set({ ruleId: v === '' ? null : Number(v) })}
          />
        ) : null}
        {form.values.ruleId === null ? (
          <TextField
            label={strings.shopBarcodeCodeLabel}
            helper={strings.shopBarcodeCodeHelper}
            value={form.values.code}
            onChange={(code) => form.set({ code })}
            error={form.errors.code}
          />
        ) : (
          <TextField
            label={strings.itemCodeLabel}
            helper={strings.shopBarcodeCodeHelper}
            inputMode="numeric"
            value={form.values.itemCode}
            onChange={(itemCode) => form.set({ itemCode })}
            error={form.errors.itemCode}
          />
        )}
      </form>
    </BottomSheet>
  )
}
