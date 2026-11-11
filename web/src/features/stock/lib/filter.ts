import type { UnitSystem } from '../../../lib/units'
import type { IngredientStock } from '../types'
import { stockStrings as strings } from '../strings'
import { daysBetween } from './days'

export type StockFilter = 'all' | 'useSoon' | 'spoiled'
export const STOCK_FILTERS: readonly StockFilter[] = ['all', 'useSoon', 'spoiled']

const WORD_SEPARATOR = /\s+/

/** Lower case, accents stripped, so "Crème" matches "creme". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Pure. `all` keeps everything, `useSoon` keeps items with useSoon, `spoiled` keeps spoiledCount > 0.
 * `query` is matched accent- and case-insensitively against the name; every word must match.
 * Does not mutate; keeps the input order.
 */
export function filterTotals(items: IngredientStock[], filter: StockFilter, query: string): IngredientStock[] {
  const words = fold(query.trim()).split(WORD_SEPARATOR).filter(Boolean)
  return items.filter((item) => {
    if (filter === 'useSoon' && !item.useSoon) return false
    if (filter === 'spoiled' && item.spoiledCount <= 0) return false
    if (words.length === 0) return true
    const name = fold(item.name)
    return words.every((word) => name.includes(word))
  })
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const DAY_AND_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** The UTC Date of a YYYY-MM-DD string, so no time zone shifts the weekday. */
function utcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

/**
 * Pure. The go-off phrase for the row meta, relative to the household's `today` (YYYY-MM-DD):
 * null -> '' ; -1 'went off today'; -2 'went off yesterday'; < -2 'went off 3 days ago' (go-off date + 1, §6.1); 0 'good until today'; 1 'good until tomorrow';
 * 2..6 'good until Thu' (en-GB short weekday); >= 7 'good until 20 Nov'. The go-off date is the last good day.
 */
export function goOffPhrase(goesOff: string | null, today: string): string {
  // No date, or no household date yet (the spoiled query still loading): nothing to say.
  if (goesOff === null || today === '') return ''
  const n = daysBetween(today, goesOff)
  // §6.1: a Lot goes off the day after its go-off date, so the date n days back went off n - 1 days ago.
  if (n < -2) return strings.goesOff.ago(-n - 1)
  if (n === -2) return strings.goesOff.yesterday
  if (n === -1) return strings.goesOff.wentOffToday
  if (n === 0) return strings.goesOff.goodUntil.today
  if (n === 1) return strings.goesOff.goodUntil.tomorrow
  if (n <= 6) return strings.goesOff.goodUntil.on(WEEKDAY.format(utcDate(goesOff)))
  return strings.goesOff.goodUntil.on(DAY_AND_MONTH.format(utcDate(goesOff)))
}

/**
 * Pure. The ListRow meta: '1 Stock Lot' or '2 Stock Lots', then ' · ' and the go-off phrase of
 * `nextGoesOff` when the item is use-soon or has spoiled lots (otherwise only the lot count).
 */
export function rowMeta(item: IngredientStock, today: string): string {
  const count = strings.lotCount(item.lotCount)
  if (!isDue(item)) return count
  const phrase = goOffPhrase(item.nextGoesOff, today)
  return phrase ? `${count} · ${phrase}` : count
}

/** True when the meta line must be drawn in the spoil colour with HourglassMedium. */
export function isDue(item: IngredientStock): boolean {
  return item.useSoon || item.spoiledCount > 0
}

export type { UnitSystem }
