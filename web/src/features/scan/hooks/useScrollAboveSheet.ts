// SR-int: on a phone the Price entry is a non-modal half sheet fixed at the bottom; the page scrolls so the row being priced
// (outlined, `data-pricing`) sits just above it (shop-scan-proposals.md 13.4). From 768 px the sheet is docked beside the
// list and nothing scrolls. The maths is lib/sheetScroll.
// SSP-06: a new scan (typed or read) puts its row on top, marked data-fresh; it is scrolled into view (nearest), and its
// scroll-margin-block-end (scan.css: --nav-clearance) keeps it above the bottom bar. While a Price entry is open that scroll waits.
import { useEffect } from 'react'
import { scrollAboveSheet } from '../lib/sheetScroll'
import type { JustScanned } from './useJustScanned'

const smoothScroll = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Scrolls when the priced row changes (`rowKey`), once the sheet and the outlined row are laid out; and the newest row into view on each scan (`fresh`). */
export function useScrollAboveSheet(rowKey: string | null, fresh: JustScanned | null = null): void {
  const freshKey = fresh ? `${fresh.key}:${fresh.pulse}` : null
  useEffect(() => {
    if (freshKey === null || rowKey !== null || typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>('.list-row[data-fresh]')
      // jsdom has no scrollIntoView
      if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest', behavior: smoothScroll() ? 'smooth' : 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
    // a new scan only: the keypad closing does not scroll the last fresh row again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey])

  useEffect(() => {
    if (rowKey === null || typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      const sheet = document.querySelector<HTMLElement>(".sheet[data-modal='false']")
      const row = document.querySelector<HTMLElement>(".list-row[data-pricing='true']")
      if (!sheet || !row || getComputedStyle(sheet).position !== 'fixed') return
      // The sheet sits at the bottom of the viewport; its height, not its rect, since it may still be sliding in.
      const delta = scrollAboveSheet(row.getBoundingClientRect(), window.innerHeight - sheet.offsetHeight)
      if (delta === 0) return
      window.scrollBy({ top: delta, behavior: smoothScroll() ? 'smooth' : 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [rowKey])
}
