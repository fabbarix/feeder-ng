// B9-27 (RX-04, ruling 6): the hero's chip line measured for useFittingChips. Plain TypeScript (DOM reads only, no React).
// The lead chips (Courses, Archived, Whole meal, Ready Meal) are never collapsed: the line wraps them when they alone are wider than it.
// The Tags fit into the room after the last lead chip; when not even one Tag and the "+N" fit there, they start the next line and fit its
// whole width. While some Tags are hidden, an inert copy (`.recipe-tags__measure`) holds every Tag chip and a "+N" at their natural width.
import type { ChipLineMetrics } from '../../../ui/lib/useFittingChips'

const width = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().width : 0)

/** The room the Tags of a hero chip line may take, each Tag chip's natural width, the gap and the "+N" chip's width. */
export function measureHeroChipLine(line: HTMLElement): ChipLineMetrics {
  if (line.clientWidth === 0) return { available: 0, widths: [], gap: 0, plusWidth: 0 }
  const cs = getComputedStyle(line)
  const gap = parseFloat(cs.columnGap) || 0
  const padStart = parseFloat(cs.paddingLeft) || 0
  const padEnd = parseFloat(cs.paddingRight) || 0
  const box = line.getBoundingClientRect()
  const full = line.clientWidth - padStart - padEnd
  const copy = line.querySelector<HTMLElement>(':scope > .recipe-tags__measure')
  const widths = copy
    ? [...copy.querySelectorAll<HTMLElement>(':scope > .recipe-tags__measure-tag')].map(width)
    : [...line.querySelectorAll<HTMLElement>(':scope > .recipe-tags__tag')].map(width)
  const plusWidth = width(copy ? copy.querySelector(':scope > .recipe-tags__measure-more') : line.querySelector(':scope > .recipe-tags__more-item'))
  const leads = line.querySelectorAll<HTMLElement>(':scope > .recipe-tags__lead')
  const lastLead = leads[leads.length - 1]
  return { available: tagRoom(full, lastLead ? box.right - padEnd - lastLead.getBoundingClientRect().right - gap : null, widths, gap, plusWidth), widths, gap, plusWidth }
}

/**
 * The room for the Tags: the line's full width without lead chips; else what is left after the last lead chip when every Tag fits there,
 * or one Tag and the "+N" do; else the full width of the next line.
 */
export function tagRoom(full: number, afterLead: number | null, widths: readonly number[], gap: number, plusWidth: number): number {
  if (afterLead === null || widths.length === 0) return full
  const all = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
  const one = (widths[0] ?? 0) + (widths.length > 1 ? gap + plusWidth : 0)
  return all <= afterLead || one <= afterLead ? afterLead : full
}
