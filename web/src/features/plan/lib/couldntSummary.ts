import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { weekdayName } from './phrase'

function plural(name: string): string {
  return /(s|ch|sh|x)$/.test(name) ? `${name}es` : `${name}s`
}

function joinNames(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return s.summaryAnd(parts.slice(0, -1).join(', '), parts[parts.length - 1]!)
}

const WEEKEND = ['Saturday', 'Sunday']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && b.every((x) => a.includes(x))
}

interface Clause {
  text: string
  count: number
  every: boolean
}

/** One Meal Slot name: "weekend breakfasts", "every dinner", "Tuesday and Thursday dinners", "4 dinners". */
function clauseFor(name: string, affected: PlanSlot[], inPlan: number): Clause {
  const days = [...new Set(affected.map((x) => weekdayName(x.date)))]
  const count = affected.length
  const lower = name.toLowerCase()
  if (count === 2 && sameSet(days, WEEKEND)) return { text: `weekend ${plural(lower)}`, count, every: false }
  if (count === 5 && sameSet(days, WEEKDAYS)) return { text: `weekday ${plural(lower)}`, count, every: false }
  if (count >= 2 && count >= inPlan) return { text: lower, count, every: true }
  if (count <= 3) {
    const noun = count === 1 ? lower : plural(lower)
    return { text: `${joinNames(affected.map((x) => weekdayName(x.date)))} ${noun}`, count, every: false }
  }
  return { text: `${count} ${plural(lower)}`, count, every: false }
}

/**
 * "Every dinner this week, plus weekend breakfasts and Tuesday lunch": what the affected meals are, by Meal Slot name,
 * biggest part first. `all` is the whole plan (what "every" is measured against); without it the affected meals are all
 * it knows.
 */
export function summarizeSlots(affected: PlanSlot[], all: PlanSlot[] = affected): string {
  if (affected.length === 0) return ''
  const names = new Map<string, PlanSlot[]>()
  for (const slot of affected) {
    const key = slot.name.toLowerCase()
    names.set(key, [...(names.get(key) ?? []), slot])
  }
  const totals = new Map<string, number>()
  for (const slot of all) totals.set(slot.name.toLowerCase(), (totals.get(slot.name.toLowerCase()) ?? 0) + 1)
  const clauses = [...names.entries()]
    .map(([key, list]) => clauseFor(list[0]!.name, list, Math.max(totals.get(key) ?? 0, list.length)))
    .sort((a, b) => b.count - a.count)
  const planDays = new Set(all.map((x) => x.date)).size || new Set(affected.map((x) => x.date)).size
  const horizon = planDays <= 7 ? s.summaryThisWeek : s.summaryNextDays(planDays)
  const texts = clauses.map((c, i) => (i === 0 && c.every ? s.summaryEvery(c.text, horizon) : c.every ? s.summaryEvery(c.text, '').trim() : c.text))
  const head = texts[0]!
  const rest = texts.slice(1)
  const out = rest.length === 0 ? head : s.summaryPlus(head, joinNames(rest))
  return out.charAt(0).toUpperCase() + out.slice(1)
}

