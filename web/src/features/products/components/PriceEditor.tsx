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
 * Shop select, date, Price and Price per kg inputs (labels from strings). Choosing a
 * Shop prefills the amounts from `prefillPrice`. Save validates with lib/priceForm and
 * calls onSave(toPriceBody(...)); errors show under the fields; a rejection from onSave
 * is shown in an alert.
 */
export function PriceEditor(props: PriceEditorProps): never {
  void props
  throw new Error('TODO')
}
