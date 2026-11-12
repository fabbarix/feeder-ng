// Beta.5 F7: the "Last cooked" copy of a Recipe (Recipe tile, row and detail). Plain TypeScript, no React.
import { recipeStrings } from '../strings'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000

/** Today as YYYY-MM-DD in the browser's local time (the household's day on a device in the household's zone). */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Parses YYYY-MM-DD as UTC midnight, so day counts ignore daylight-saving changes. */
function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

function dayAndMonth(date: string): string {
  const t = new Date(utcDay(date))
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`
}

/**
 * Pure. The line a Recipe shows for its `lastCookedOn` (YYYY-MM-DD, null = never), relative to `today` (YYYY-MM-DD):
 * null -> 'Not cooked yet'; 0 days -> 'Last cooked today'; 1 -> 'Last cooked yesterday'; 2 to 6 -> 'Last cooked Tue'
 * (short English weekday); 7 or more (or a date after today) -> 'Last cooked 3 Oct' (day, short month).
 * With no `today` yet ('') a date reads as the day-and-month form.
 */
export function lastCookedLabel(lastCookedOn: string | null, today: string): string {
  if (lastCookedOn === null) return recipeStrings.cookedLabel.never
  if (today === '') return recipeStrings.cookedLabel.since(dayAndMonth(lastCookedOn))
  const days = Math.round((utcDay(today) - utcDay(lastCookedOn)) / DAY_MS)
  if (days === 0) return recipeStrings.cookedLabel.today
  if (days === 1) return recipeStrings.cookedLabel.yesterday
  if (days >= 2 && days <= 6) return recipeStrings.cookedLabel.since(WEEKDAYS[new Date(utcDay(lastCookedOn)).getUTCDay()] ?? '')
  return recipeStrings.cookedLabel.since(dayAndMonth(lastCookedOn))
}
