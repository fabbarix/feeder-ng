// SR-int: on a phone the Price entry is a non-modal half sheet fixed at the bottom; the page scrolls so the row being priced
// (outlined, `data-pricing`) sits just above it (shop-scan-proposals.md 13.4). From 768 px the sheet is docked beside the
// list and nothing scrolls. The maths is lib/sheetScroll.
import { useEffect } from 'react'
import { scrollAboveSheet } from '../lib/sheetScroll'

/** Scrolls when the priced row changes (`rowKey`), once the sheet and the outlined row are laid out. */
export function useScrollAboveSheet(rowKey: string | null): void {
  useEffect(() => {
    if (rowKey === null || typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      const sheet = document.querySelector<HTMLElement>(".sheet[data-modal='false']")
      const row = document.querySelector<HTMLElement>("[data-pricing='true']")
      if (!sheet || !row || getComputedStyle(sheet).position !== 'fixed') return
      const delta = scrollAboveSheet(row.getBoundingClientRect(), sheet.getBoundingClientRect().top)
      if (delta === 0) return
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [rowKey])
}
