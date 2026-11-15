// B9-53 (TB-06): the first-run time zone and currency, proposed from the browser and confirmed by the Admin ("Looks right"). The zone
// comes from Intl in the page (detectDevice); the currency from the locale's region (never from the zone), falling back to USD. Pure
// functions: the browser is read only in detectDevice.
import { currencyFacts, zoneFacts } from '../../../ui/Select/intlChoices'
import { todayStrings as s } from '../strings'

/** ISO 3166 region to ISO 4217 currency, for the regions a household is likely to be in. Anything else falls back to USD. */
const REGION_CURRENCY: Record<string, string> = {
  // The euro area and the places that use the euro.
  AD: 'EUR', AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR',
  IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MC: 'EUR', ME: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR', SM: 'EUR',
  VA: 'EUR', XK: 'EUR',
  // The rest of Europe.
  AL: 'ALL', BA: 'BAM', BG: 'BGN', BY: 'BYN', CH: 'CHF', CZ: 'CZK', DK: 'DKK', GB: 'GBP', GE: 'GEL', HU: 'HUF', IS: 'ISK', LI: 'CHF',
  MD: 'MDL', MK: 'MKD', NO: 'NOK', PL: 'PLN', RO: 'RON', RS: 'RSD', RU: 'RUB', SE: 'SEK', TR: 'TRY', UA: 'UAH',
  // The Americas.
  AR: 'ARS', BO: 'BOB', BR: 'BRL', CA: 'CAD', CL: 'CLP', CO: 'COP', CR: 'CRC', DO: 'DOP', EC: 'USD', GT: 'GTQ', JM: 'JMD', MX: 'MXN',
  PA: 'PAB', PE: 'PEN', PR: 'USD', PY: 'PYG', SV: 'USD', US: 'USD', UY: 'UYU', VE: 'VES',
  // Asia and the Middle East.
  AE: 'AED', BD: 'BDT', CN: 'CNY', HK: 'HKD', ID: 'IDR', IL: 'ILS', IN: 'INR', JO: 'JOD', JP: 'JPY', KR: 'KRW', KW: 'KWD', KZ: 'KZT',
  LB: 'LBP', LK: 'LKR', MO: 'MOP', MY: 'MYR', NP: 'NPR', PH: 'PHP', PK: 'PKR', QA: 'QAR', SA: 'SAR', SG: 'SGD', TH: 'THB', TW: 'TWD',
  VN: 'VND',
  // Africa.
  DZ: 'DZD', EG: 'EGP', GH: 'GHS', KE: 'KES', MA: 'MAD', NG: 'NGN', TN: 'TND', TZ: 'TZS', UG: 'UGX', ZA: 'ZAR',
  // Oceania.
  AU: 'AUD', FJ: 'FJD', NZ: 'NZD',
}

const FALLBACK = 'USD'

/** The region subtag of a BCP 47 locale ("it-IT" is IT, "zh-Hant-TW" is TW), or null for none or a malformed tag. Never inferred. */
function regionOf(locale: string): string | null {
  if (!locale) return null
  try {
    return new Intl.Locale(locale).region ?? null
  } catch {
    return null
  }
}

/** The currency of the locale's region, and that region: USD and no region when the locale names none. */
export function currencyGuess(locale: string): { currency: string; region: string | null } {
  const region = regionOf(locale)
  return { currency: (region && REGION_CURRENCY[region]) || FALLBACK, region }
}

/** "Euro (€)", "British Pound (£)"; a code the runtime cannot name reads as the code. */
export function currencyLabel(code: string, uiLocale: string): string {
  const { name, symbol } = currencyFacts(code, uiLocale)
  if (name === code) return code
  return symbol === code ? `${name} (${code})` : `${name} (${symbol})`
}

/** "Italy" for IT; null for no region. */
export function regionLabel(region: string | null, uiLocale: string): string | null {
  if (!region) return null
  try {
    return new Intl.DisplayNames([uiLocale], { type: 'region' }).of(region) ?? region
  } catch {
    return region
  }
}

export interface ZoneRow {
  id: 'timeZone' | 'currency'
  key: string
  /** The value, at the row's end. */
  state: string
  /** One short line under the key: where the value comes from. */
  detail: string
  /** The Change button's accessible name. */
  changeLabel: string
}

export interface ZoneRowsInput {
  /** The browser's locale (navigator.language). */
  locale: string
  /** The device's zone. */
  timeZone: string
  now: Date
  /** The language of the words ("Euro", "Italy"). */
  uiLocale: string
  /** Values the Admin picked with Change, not yet saved: they replace the detected ones. */
  chosen?: { timeZone?: string; currency?: string }
}

/** The two facts of step 1 as R-E rows: key, state at the end, detail on one line. */
export function zoneRows({ locale, timeZone, now, uiLocale, chosen }: ZoneRowsInput): ZoneRow[] {
  const guess = currencyGuess(locale)
  const zone = chosen?.timeZone ?? timeZone
  const clock = zoneFacts(timeZone, now).time
  const zoneDetail = chosen?.timeZone ? s.setupFacts.changed : clock ? s.setupFacts.fromDevice(clock) : s.setupFacts.fromDeviceNoClock
  const known = guess.region !== null && REGION_CURRENCY[guess.region] !== undefined
  const country = known ? regionLabel(guess.region, uiLocale) : null
  const currencyDetail = chosen?.currency ? s.setupFacts.changed : country ? s.setupFacts.fromRegion(country) : s.setupFacts.byDefault
  return [
    { id: 'timeZone', key: s.setupFacts.timeZone, state: zone, detail: zoneDetail, changeLabel: s.setupFacts.changeTimeZone },
    { id: 'currency', key: s.setupFacts.currency, state: currencyLabel(chosen?.currency ?? guess.currency, uiLocale), detail: currencyDetail, changeLabel: s.setupFacts.changeCurrency },
  ]
}

/** The values to save from the rows' inputs: the Admin's picks, else the detected ones. */
export function zoneChoice(input: Pick<ZoneRowsInput, 'locale' | 'timeZone' | 'chosen'>): { timeZone: string; currency: string } {
  return { timeZone: input.chosen?.timeZone ?? input.timeZone, currency: input.chosen?.currency ?? currencyGuess(input.locale).currency }
}

/** What the page reads from the browser: the zone from Intl (UTC when the runtime has none) and the locale. */
export function detectDevice(): { timeZone: string; locale: string } {
  let timeZone: string | undefined
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    timeZone = undefined
  }
  return { timeZone: timeZone ?? 'UTC', locale: typeof navigator === 'undefined' ? '' : navigator.language }
}
