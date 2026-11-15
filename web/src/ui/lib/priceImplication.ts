// The line under the PriceKeypad display (shop-scan-proposals.md 13.4): "= €2.90/kg for 500 g" or "× 312 g = €6.21".
// Plain TypeScript, no React.
import { formatPriceMinor, typedFromMinor } from './moneyInput'
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

/** The spoken name of an amount of money: the minor units as "14.90" and the currency's word ("dollars"). */
function spokenMoney(cents: number, currency: string, locale: string): string {
  const amount = typedFromMinor(cents, currency)
  const word = CURRENCY_WORDS[currency] ?? currencyName(currency, locale)
  return `${amount} ${word}`
}

const CURRENCY_WORDS: Record<string, string> = { USD: 'dollars', CAD: 'dollars', AUD: 'dollars', NZD: 'dollars', EUR: 'euros', GBP: 'pounds', CHF: 'francs', JPY: 'yen', SEK: 'kronor', NOK: 'kroner', DKK: 'kroner' }

function currencyName(currency: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(currency) ?? currency
  } catch {
    return currency
  }
}

/**
 * B9-41 (SSP-07): what the display of a weighed row says to a screen reader: "14.90 dollars per kg, 4.65 dollars for 312 grams". Null
 * unless the keypad is on per kg (per l) for a weighed amount and a Price above 0 is typed.
 */
export function spokenWeighed(input: { basis: PriceBasis; cents: number | null; pack?: PackSize; weighed?: number; currency: string; locale: string }): string | null {
  const { basis, cents, pack, weighed, currency, locale } = input
  if (basis !== 'perKg' || weighed === undefined || !pack || pack.unit === 'piece' || cents === null || cents <= 0) return null
  return uiStrings.spokenWeighed(spokenMoney(cents, currency, locale), pack.unit === 'ml' ? 'l' : 'kg', spokenMoney(weighedPrice(cents, weighed), currency, locale), weighed, pack.unit === 'ml' ? 'millilitres' : 'grams')
}
