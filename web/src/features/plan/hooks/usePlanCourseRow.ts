import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefCallback, type RefObject } from 'react'
import { usePhraseContext } from './usePhraseContext'
import { wholeMealChip, type CourseRowModel } from '../lib/courses'
import { actionName, dayLabel } from '../lib/actionNames'
import { capChips, emptyRow, fitChips, rowChips, type ChipMore, type EmptyRowModel, type RowChip } from '../lib/rowChips'
import { rowActions, type RowAction } from '../lib/rowActions'
import type { PlanSlot } from '../types'

export interface PlanCourseRowView {
  /** Every chip of the row, in priority order (the measuring copy holds them all). */
  all: RowChip[]
  /** PC-06: the chips the line shows whole (before measuring: at most two). */
  chips: RowChip[]
  /** The "+N" chip for the chips left out; null when all show. */
  more: ChipMore | null
  /** Only a lone chip wider than the line is cut (the line carries data-cut). */
  cut: boolean
  /** The icon actions at the row's end, in order. */
  actions: RowAction[]
  /** Set for an empty Course: its title, its cause chip and whether it can be chosen. */
  empty: EmptyRowModel | null
  /** A11Y-08: "Tue 17 Breakfast", the day and Meal Slot that describe the row (never "Today"). */
  when: string
  /** A11Y-08: the names of the row's actions. */
  names: { swap: string; pin: string; choose: string }
  /** The visible chip line (observed with a ResizeObserver). */
  lineRef: RefCallback<HTMLElement>
  /** The line can be measured (there is a ResizeObserver): the row renders the measuring copy. */
  measuring: boolean
  /** The aria-hidden copy of every chip, whose natural widths decide the fit. */
  measureRef: RefObject<HTMLDivElement | null>
}

/** The natural width of each chip of the measuring copy. */
function widthsOf(el: HTMLElement | null): number[] | null {
  if (!el) return null
  return [...el.children].map((c) => (c as HTMLElement).offsetWidth)
}

/**
 * The view model of one Course row: what it says (chips, fitted to the measured line), which icon actions it offers, how
 * an empty Course reads, and the names of its actions.
 */
export function usePlanCourseRow(row: CourseRowModel, slot: PlanSlot): PlanCourseRowView {
  const phrase = usePhraseContext(slot.date)
  const meal = row.course.meal
  const now = Date.now()
  const all = useMemo(
    () => (meal ? rowChips(meal, phrase, wholeMealChip(slot, row), { slotAt: slot.at, now, everyoneAway: slot.everyoneAway }) : []),
    // `now` moves every render; the start chips only need it when the row renders again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meal, phrase, slot, row],
  )
  const empty = meal ? null : emptyRow(row.course)
  const shownChips = empty ? (empty.chip ? [empty.chip] : []) : all
  const signature = shownChips.map((c) => c.key).join('|')

  const measureRef = useRef<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState<number | null>(null)
  const [widths, setWidths] = useState<number[] | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  const lineRef = useCallback<RefCallback<HTMLElement>>((el) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      setAvailable(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width)
      setWidths(widthsOf(measureRef.current))
    })
    ro.observe(el)
    observer.current = ro
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  useLayoutEffect(() => {
    setWidths(widthsOf(measureRef.current))
  }, [signature])

  const measured = available !== null && widths !== null && widths.length === shownChips.length
  const fit = measured ? fitChips(shownChips, widths, available) : { ...capChips(shownChips), cut: false }
  const when = `${dayLabel(slot.date)} ${slot.name}`
  const ctx = { recipe: meal?.recipeName ?? '', course: row.course.name, day: dayLabel(slot.date), slot: slot.name }
  return {
    all: shownChips,
    chips: fit.shown,
    more: fit.more,
    cut: fit.cut,
    actions: rowActions(meal),
    empty,
    when,
    names: { swap: actionName('swap', ctx), pin: actionName('pin', ctx), choose: actionName('choose', ctx) },
    lineRef,
    measuring: typeof ResizeObserver !== 'undefined',
    measureRef,
  }
}
