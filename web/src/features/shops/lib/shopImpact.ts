// The Delete Shop confirm's rows (SAFE-02): what goes with the Shop, the non-zero counts only. Plain TypeScript, no React.
import { strings } from '../strings'
import type { ShopImpact } from '../types'

export interface ImpactRow {
  key: string
  state: string
}

export function shopImpactRows(impact: ShopImpact): ImpactRow[] {
  const rows: [string, number][] = [
    [strings.impactShopBarcodes, impact.shopBarcodes],
    [strings.impactWeightRules, impact.weightBarcodeRules],
    [strings.impactPrices, impact.prices],
  ]
  return rows.filter(([, n]) => n > 0).map(([key, n]) => ({ key, state: String(n) }))
}
