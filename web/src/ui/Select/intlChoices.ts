// B9-15 (SET-07): the plain data behind TimeZoneSelect and CurrencySelect, read from Intl. No React; options.tsx turns it into options.

/** What these functions read from Intl (passed in so a test can stand in for a runtime without supportedValuesOf). */
export interface IntlLike {
  supportedValuesOf?: (key: 'timeZone' | 'currency') => string[]
}

/** Used where Intl.supportedValuesOf is missing: the common zones of each region, and UTC. */
const FALLBACK_ZONES = [
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul',
  'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome',
  'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago', 'America/Denver', 'America/Halifax',
  'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo',
  'America/Toronto', 'America/Vancouver',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'UTC',
]

/** Used where Intl.supportedValuesOf is missing. */
const FALLBACK_CURRENCIES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'PLN',
  'SEK', 'SGD', 'TRY', 'USD', 'ZAR',
]

/** The currencies listed first, under "Common", in this order. */
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY']

function supported(intl: IntlLike, key: 'timeZone' | 'currency', fallback: string[]): string[] {
  try {
    const list = intl.supportedValuesOf?.(key)
    if (list && list.length > 0) return [...list]
  } catch {
    // A runtime that has the function but not the key: the static list.
  }
  return [...fallback]
}

/** Intl.supportedValuesOf('timeZone'), or a static list of the common zones. */
export function supportedTimeZones(intl: IntlLike = Intl as IntlLike): string[] {
  return supported(intl, 'timeZone', FALLBACK_ZONES)
}

/** Intl.supportedValuesOf('currency'), or a static list of the common currencies. */
export function supportedCurrencies(intl: IntlLike = Intl as IntlLike): string[] {
  return supported(intl, 'currency', FALLBACK_CURRENCIES)
}

/** The zone this device is in, if Intl knows it. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

export interface ZoneFacts {
  iana: string
  /** The last path part, underscores read as spaces: "Buenos Aires". */
  city: string
  /** The part before the first slash ("Europe"), or null for a name without one ("UTC"). */
  region: string | null
  /** "UTC+1", "UTC+5:30", "UTC-5", "UTC+0"; null for a zone Intl does not know. */
  offset: string | null
  /** The 24 hour clock there at `now`: "21:14"; null for a zone Intl does not know. */
  time: string | null
}

/** "GMT+05:30" (Intl's longOffset) as "UTC+5:30"; "GMT" as "UTC+0". */
export function utcOffset(longOffset: string): string {
  const m = /([+-])(\d{1,2})(?::?(\d{2}))?/.exec(longOffset)
  if (!m) return 'UTC+0'
  const hours = String(Number(m[2]))
  const minutes = m[3] && m[3] !== '00' ? `:${m[3]}` : ''
  return hours === '0' && !minutes ? 'UTC+0' : `UTC${m[1]}${hours}${minutes}`
}

export function zoneFacts(iana: string, now: Date): ZoneFacts {
  const slash = iana.indexOf('/')
  const city = (iana.split('/').at(-1) ?? iana).replace(/_/g, ' ')
  let offset: string | null = null
  let time: string | null = null
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: iana, timeZoneName: 'longOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value
    offset = utcOffset(name ?? 'GMT')
    time = new Intl.DateTimeFormat('en-GB', { timeZone: iana, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  } catch {
    // An unknown zone (a stored value Intl does not know): no offset, no clock.
  }
  return { iana, city, region: slash > 0 ? iana.slice(0, slash) : null, offset, time }
}

export interface CurrencyFacts {
  code: string
  /** The display name ("Euro"), or the code when Intl has none. */
  name: string
  /** The symbol ("€"), or the code when it has none of its own. */
  symbol: string
}

export function currencyFacts(code: string, locale?: string): CurrencyFacts {
  let name = code
  let symbol = code
  try {
    name = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'currency' }).of(code) ?? code
  } catch {
    // An unknown code: its name is the code.
  }
  try {
    symbol = new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code
  } catch {
    // An invalid code: its symbol is the code.
  }
  return { code, name, symbol }
}
