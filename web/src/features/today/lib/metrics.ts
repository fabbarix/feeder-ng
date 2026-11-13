// DS-TODAY (docs/design/system.md §2, §4): the Today metric strip: zero-waste streak, Leftovers to use, Lines to get.
// Colour roles: success (streak), the leftover teal (Leftovers), the accent container (Lines to get). Plain TypeScript.
import type { IconName } from '../../../ui/icons'
import { todayStrings as s } from '../strings'
import { streakMetric } from './streak'

export type MetricId = 'streak' | 'leftovers' | 'lines'

export interface Metric {
  id: MetricId
  /** The big number: "2 d", "3 wk", "3", "16". */
  value: string
  label: string
  tone: 'success' | 'leftover' | 'accent'
  icon: IconName
}

export interface MetricCounts {
  streakDays: number
  leftovers: number
  linesToGet: number
}

/** The metrics that have something to say, in order: streak (from one day on), Leftovers, Lines to get (no zero counts). */
export function composeMetrics(c: MetricCounts): Metric[] {
  const out: Metric[] = []
  if (c.streakDays >= 1) out.push({ id: 'streak', value: streakMetric(c.streakDays).value, label: s.streakLabel, tone: 'success', icon: 'streak' })
  if (c.leftovers > 0) out.push({ id: 'leftovers', value: String(c.leftovers), label: s.leftoversMetric, tone: 'leftover', icon: 'leftover' })
  if (c.linesToGet > 0) out.push({ id: 'lines', value: String(c.linesToGet), label: s.linesMetric, tone: 'accent', icon: 'shop' })
  return out
}

/** The Lines still to buy: the ones not ticked. 0 with no list yet. */
export function countLinesToGet(lines: { ticked: boolean }[] | undefined): number {
  return (lines ?? []).filter((line) => !line.ticked).length
}
