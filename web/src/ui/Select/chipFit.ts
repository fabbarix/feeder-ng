// B9-15 (SET-06; replaces the Shop's 26.25 em window query): whether a chip Select shows its option's full label or its `shortLabel`.
// The rule is pure; the measure reads the chip's own room in its row (the row's inner width minus its other items and the gaps), so the
// window width plays no part. Items before the chip count at their width now, items after it at their full width (a chip Select sibling
// with its full value), so the first chips yield first and each answer depends only on answers already settled: two chips that shorten
// never flip each other back and forth.

export interface ChipFitMetrics {
  /** The chip's width with its full label shown. */
  natural: number
  /** The width its row leaves it. */
  room: number
}

/** True when the full label fits, and while nothing is measured. */
export function chipShowsFull(metrics: ChipFitMetrics | null): boolean {
  return metrics === null || metrics.natural <= metrics.room
}

/** A chip's width with its full label: its trigger's chrome (padding, icon, chevron, gaps) plus the hidden copy's text width. */
function naturalWidth(frame: HTMLElement): number | null {
  const trigger = frame.querySelector<HTMLElement>('.select__trigger')
  const value = trigger?.querySelector<HTMLElement>('.select__value')
  const copy = frame.querySelector<HTMLElement>('.select__measure')
  if (!trigger || !value || !copy) return null
  return trigger.getBoundingClientRect().width - value.getBoundingClientRect().width + copy.getBoundingClientRect().width
}

/** The chip's natural width and its room, or null where nothing is laid out (jsdom, or not shown). */
export function measureChipFit(frame: HTMLElement): ChipFitMetrics | null {
  const row = frame.parentElement
  if (!row || frame.getClientRects().length === 0 || row.clientWidth === 0) return null
  const natural = naturalWidth(frame)
  if (natural === null) return null
  const cs = getComputedStyle(row)
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  const gap = parseFloat(cs.columnGap) || 0
  let others = 0
  let items = 1
  let after = false
  for (const child of row.children) {
    if (child === frame) {
      after = true
      continue
    }
    if (!(child instanceof HTMLElement) || child.getClientRects().length === 0) continue
    const position = getComputedStyle(child).position
    if (position === 'absolute' || position === 'fixed') continue
    items += 1
    others += (after ? naturalWidth(child) : null) ?? child.getBoundingClientRect().width
  }
  return { natural, room: row.clientWidth - padding - others - gap * (items - 1) }
}
