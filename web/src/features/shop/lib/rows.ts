// DS-SHOP (docs/design/system.md §3): what a Shop row says and what its sheet offers. Plain TypeScript, no React.
import type { IconName } from '../../../ui/icons'
import { weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { shopStrings } from '../strings'
import type { PastPlannedMeal } from '../types'
import type { ListEntry } from './lines'
import { changeTargetOf } from './tickAmount'

/** Where a row sits: the open list, the Ticked section or the collapsed Not needed group. */
export type RowGroup = 'open' | 'ticked' | 'not-needed'

/** The actions of a row's sheet. The row itself only opens the sheet; the tick stays on the row. */
export type LineAction = 'mark-it' | 'not-needed' | 'needed-after-all' | 'delete' | 'change-amount' | 'untick' | 'get-something-else'

export interface RowMeta {
  text: string
  /**
   * SSP-05: the short form of `text`, which ListRow shows while the row's own text column is narrow (under 12 rem); the long text stays
   * the accessible one. Absent when the meta has no shorter form.
   */
  compact?: string
  /** the tone of the meta line: info (unconfirmed past meals, a Restock reason, more since a tick), success (a tick that added Stock) */
  status?: 'info' | 'success'
  /** B9-34: the meta's own glyph (a ticked row's Package, MinusCircle or Barcode; ArrowBendDownRight for more since a tick) */
  icon?: IconName
}

export interface RowValue {
  value?: string
  subValue?: string
}

/** The short English weekday of a YYYY-MM-DD date ("Tue"). */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return weekdayShortName(jsDay === 0 ? 7 : jsDay)
}

/** "A", "A and B", "A, B and C" (the order given is kept). */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${shopStrings.andJoin} ${items[items.length - 1]}`
}

/**
 * The slots of some unconfirmed past meals, in the order given: "Tue Dinner", "Tue Dinner and Wed Lunch", and with
 * `withCourses` a slot with several Courses names them: "Tue Dinner (Main, Side)". '' without meals.
 */
export function slotsLabel(meals: PastPlannedMeal[] | undefined, withCourses = true): string {
  if (!meals || meals.length === 0) return ''
  const slots = new Map<string, { label: string; courses: string[] }>()
  for (const m of meals) {
    const key = `${m.date}|${m.mealSlotId}`
    const slot = slots.get(key) ?? { label: `${weekdayOf(m.date)} ${m.mealSlotName}`, courses: [] }
    if (m.courseName && !slot.courses.includes(m.courseName)) slot.courses.push(m.courseName)
    slots.set(key, slot)
  }
  const named = [...slots.values()].map((s) => (withCourses && s.courses.length > 1 ? shopStrings.unconfirmedCourses(s.label, s.courses.join(', ')) : s.label))
  return joinAnd(named)
}

/**
 * The one meta line, and its compact form when it has one (SSP-05: the row shows it by the width of its own text column, so there is
 * no viewport option):
 * - a "more since your tick" row: "More since your tick" (compact "More needed"), info;
 * - a ticked row: what the tick did to Stock (lib/tickAmount tickedMeta), success when it added Stock, else muted;
 * - a Supply's Restock reason ("Below 1 l · 400 ml in Stock", compact "400 ml in Stock"), info;
 * - the unconfirmed past meals ("Tue Dinner +1"), info; else the pack line ("2 × Mutti 700 g", compact "2 × 700 g").
 */
export function rowMeta(entry: ListEntry): RowMeta {
  if (entry.moreSince) return { text: shopStrings.moreSince, compact: shopStrings.moreSinceCompact, status: 'info', icon: 'moreSince' }
  if (entry.ticked && entry.tickMeta) {
    const m = entry.tickMeta
    return {
      text: m.text,
      ...(m.compact ? { compact: m.compact } : {}),
      ...(m.tone === 'success' ? { status: 'success' as const } : {}),
      icon: m.icon,
    }
  }
  if (entry.restockText) {
    return { text: entry.restockText, ...(entry.restockCompact ? { compact: entry.restockCompact } : {}), status: 'info' }
  }
  if (entry.hintShort) return { text: entry.hintShort, status: 'info' }
  // SSP-05: a narrow card keeps the pack count and size, not a cut Product name
  return { text: entry.packLine, ...(entry.packLine && entry.packCompact && entry.packCompact !== entry.packLine ? { compact: entry.packCompact } : {}) }
}

/**
 * B9-34 (SSP-05, P23): how wide a text column the long meta needs before ListRow's 12 rem switch can show it uncut. ListRow shows the
 * compact form under 12 rem of text column, which fits a long meta of about 26 characters at the meta size; a longer one ("Added twice ·
 * Sam 50 g, you 50 g", "Below 1 l · 400 ml in Stock") would be cut just above 12 rem. 'm' (27 to 34 characters) keeps the compact
 * form under 16 rem, 'l' (longer) under 22 rem (shop.css). undefined when the meta has no compact form or fits 12 rem.
 */
export function metaWidth(meta: RowMeta): 'm' | 'l' | undefined {
  if (!meta.compact) return undefined
  const n = [...meta.text].length
  if (n > 34) return 'l'
  if (n > 26) return 'm'
  return undefined
}

/** The value column: the quantity, and the estimated cost under it when there is a Price. Nothing for free text or a ticked Line. */
export function rowValue(entry: ListEntry): RowValue {
  const out: RowValue = {}
  if (entry.quantityText) out.value = entry.quantityText
  if (entry.estimatedCost !== null) out.subValue = entry.estimatedCost
  return out
}

/**
 * What the row's sheet offers, in order. "Mark it" first when the Line has unconfirmed past meals; then Not needed on an open
 * Line (a "more since your tick" row included: it takes only the difference off), Needed after all on a Not needed one. A ticked
 * entry (SSP-18) offers Change amount when the viewer has a hand addition on it, then Untick. Delete stays last on an extra (open or
 * ticked).
 */
export function lineActions(entry: ListEntry, group: RowGroup): LineAction[] {
  const out: LineAction[] = []
  if (entry.markIt) out.push('mark-it')
  if (group === 'ticked') {
    if (changeTargetOf(entry)) out.push('change-amount')
    out.push('untick')
  }
  if (entry.kind === 'extra') {
    if (group !== 'not-needed') out.push('delete')
  } else if (group === 'open') {
    // B9-43 (SSP-14, SSP 6): a substitute for an open Line; not on the "more since your tick" row (it takes only the difference off)
    if (!entry.moreSince) out.push('get-something-else')
    out.push('not-needed')
  } else if (group === 'not-needed') {
    out.push('needed-after-all')
  }
  return out
}

/**
 * Batch w5a (P38: every button on a page has its own accessible name): what a row is called, in its tick ("Tick …") and its target.
 * A row is called by its title, except where two rows on the page would share it: then the "more since your tick" row is
 * "750 g more of Chestnut mushrooms" and an Ingredient extra is "the extra 200 g of Chestnut mushrooms"; the plain Line keeps its title.
 * Returns the names by entry key.
 */
export function rowNames(entries: readonly ListEntry[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const e of entries) count.set(e.title, (count.get(e.title) ?? 0) + 1)
  const names = new Map<string, string>()
  for (const e of entries) {
    if ((count.get(e.title) ?? 0) < 2) names.set(e.key, e.title)
    else if (e.moreSince) names.set(e.key, shopStrings.moreOf(e.quantityText, e.title))
    else if (e.kind === 'extra') names.set(e.key, shopStrings.extraOf(e.quantityText, e.title))
    else names.set(e.key, e.title)
  }
  return names
}
