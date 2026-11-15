// B9-49 (RES-07): the moment the offline banner names, in the Household's zone. Plain TypeScript.
// "04:30" when it is today in that zone, "Sat 18:05" for an earlier day; 24 h, zero padded. Without a usable zone, the device clock.
import { isValidTimeZone } from './householdDate'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface Parts {
  day: string
  weekday: number
  hh: string
  mm: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsIn(d: Date, timeZone: string): Parts {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  const parts = f.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const y = Number(get('year'))
  const m = Number(get('month'))
  const dd = Number(get('day'))
  return { day: `${y}-${m}-${dd}`, weekday: new Date(Date.UTC(y, m - 1, dd)).getUTCDay(), hh: get('hour'), mm: get('minute') }
}

function localParts(d: Date): Parts {
  const pad = (n: number) => String(n).padStart(2, '0')
  return { day: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, weekday: d.getDay(), hh: pad(d.getHours()), mm: pad(d.getMinutes()) }
}

/** "04:30" (today in `timeZone`) or "Sat 18:05" (an earlier day). */
export function savedMoment(at: Date, now: Date, timeZone: string | null | undefined): string {
  const zoned = isValidTimeZone(timeZone)
  const a = zoned ? partsIn(at, timeZone) : localParts(at)
  const n = zoned ? partsIn(now, timeZone) : localParts(now)
  const time = `${a.hh}:${a.mm}`
  return a.day === n.day ? time : `${WEEKDAYS[a.weekday]} ${time}`
}
