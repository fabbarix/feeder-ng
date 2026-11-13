// The line under the PriceKeypad display (shop-scan-proposals.md 13.4): "= €2.90/kg for 500 g" or "× 312 g = €6.21".
// Plain TypeScript, no React.
import { formatPriceMinor } from './moneyInput'
import { perKgFromPack, weighedPrice, type PackUnit, type PriceBasis } from './perKgPrice'
import { uiStrings } from '../strings'

export interface PackSize {
  amount: number
  unit: PackUnit
}

/** "500 g", "1 kg", "500 ml", "1 l". */
export function sizeLabel({ amount, unit }: PackSize): string {
  if (unit === 'piece') return `${amount}`
  const [small, large] = unit === 'g' ? ['g', 'kg'] : ['ml', 'l']
  return amount >= 1000 && amount % 1000 === 0 ? `${amount / 1000} ${large}` : `${amount} ${small}`
}

/** The implication of what is typed; null when there is nothing to say (nothing typed, pieces, no pack). */
export function impliedLine(input: {
  basis: PriceBasis
  cents: number | null
  packCents: number | null
  pack?: PackSize
  weighed?: number
  currency: string
  locale: string
}): string | null {
  const { basis, cents, packCents, pack, weighed, currency, locale } = input
  if (!pack || cents === null || cents <= 0 || pack.unit === 'piece') return null
  const money = (c: number) => formatPriceMinor(c, currency, locale)
  if (basis === 'perKg') {
    if (weighed !== undefined) return uiStrings.impliedWeighed(`${weighed} ${pack.unit}`, money(weighedPrice(cents, weighed)))
    return packCents === null ? null : uiStrings.impliedPack(money(packCents), sizeLabel(pack))
  }
  const perKg = perKgFromPack(cents, pack.amount, pack.unit)
  if (perKg === null) return null
  return uiStrings.impliedPerKg(money(perKg), pack.unit === 'ml' ? 'l' : 'kg', sizeLabel(pack))
}
