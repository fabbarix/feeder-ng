// B9-15 (SET-06; replaces the Shop's 26.25 em window query): whether a chip Select shows its option's full label or its `shortLabel`.
// The rule is pure; the measure reads the chip's own room in its row (the row's inner width minus its other items and the gaps, plus
// what a content-sized row may still grow into in the row that holds it), so the window width plays no part. Items before the chip count
// at their width now, items after it at their full width (with their chip Selects' full values), so the first chips yield first and each
// answer depends only on answers already settled: two chips that shorten never flip each other back and forth.

export interface ChipFitMetrics {
  /** The chip's width with its full label shown. */
  natural: number
  /** The width its row leaves it. */
  room: number
}

/** A shortened chip shows its full label again only with this much room to spare, so a row on a sub-pixel boundary settles. */
export const CHIP_FIT_MARGIN = 2

/**
 * True when the full label fits, and while nothing is measured. `showsFull` is the answer so far: a chip that shows its short value goes
 * back to the full one only with CHIP_FIT_MARGIN to spare (two chips in a row whose rooms depend on each other never flap).
 */
export function chipShowsFull(metrics: ChipFitMetrics | null, showsFull = true): boolean {
  if (metrics === null) return true
  return metrics.natural + (showsFull ? 0 : CHIP_FIT_MARGIN) <= metrics.room
}

/** How much wider `el` would be with every chip Select in it showing its full value (0 when none is shortened). */
function growth(el: HTMLElement): number {
  const frames = [...(el.matches('.select') ? [el] : []), ...el.querySelectorAll<HTMLElement>('.select')]
  let grow = 0
  for (const select of frames) {
    const value = select.querySelector<HTMLElement>(':scope > .select__trigger .select__value')
    const copy = select.querySelector<HTMLElement>(':scope > .select__measure')
    if (value && copy) grow += Math.max(0, copy.getBoundingClientRect().width - value.getBoundingClientRect().width)
  }
  return grow
}

/** A flex row that keeps its items on one line: an item's room there is shared with its siblings. */
function isOneLineRow(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const cs = getComputedStyle(el)
  return (cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row') && cs.flexWrap === 'nowrap'
}

/** How far up a content-sized row is followed into the row that holds it. */
const MAX_DEPTH = 4

/**
 * The width `item` may take in its parent. In a one-line flex row: the row's inner width less its other items and the gaps (an item
 * after `item` at its width with its chips full). A row that is itself an item of a one-line row (the Shop chip beside its locate button,
 * inside the header's row) may grow into that row's room too, so its own content-sized width never caps the chip. Elsewhere: the whole
 * inner width of the parent. Null where nothing is laid out.
 */
function roomIn(item: HTMLElement, depth = 0): number | null {
  const row = item.parentElement
  if (!row || row.clientWidth === 0) return null
  const cs = getComputedStyle(row)
  const inner = row.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
  if (!isOneLineRow(row)) return inner
  const gap = parseFloat(cs.columnGap) || 0
  let others = 0
  let items = 1
  let after = false
  for (const child of row.children) {
    if (child === item) {
      after = true
      continue
    }
    if (!(child instanceof HTMLElement) || child.getClientRects().length === 0) continue
    const position = getComputedStyle(child).position
    if (position === 'absolute' || position === 'fixed') continue
    items += 1
    others += child.getBoundingClientRect().width + (after ? growth(child) : 0)
  }
  let room = inner - others - gap * (items - 1)
  if (depth < MAX_DEPTH && isOneLineRow(row.parentElement)) {
    const outer = roomIn(row, depth + 1)
    const width = row.getBoundingClientRect().width
    if (outer !== null && outer > width) room += outer - width
  }
  return room
}

/** The rows whose size changes a chip's room: its parent and, while that is an item of a one-line row, the rows above it. */
export function chipFitRows(frame: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = []
  let row = frame.parentElement
  for (let depth = 0; row && depth <= MAX_DEPTH; depth += 1) {
    rows.push(row)
    if (!isOneLineRow(row) || !isOneLineRow(row.parentElement)) break
    row = row.parentElement
  }
  return rows
}

/** The chip's natural width (its width with its full value) and its room, or null where nothing is laid out (jsdom, or not shown). */
export function measureChipFit(frame: HTMLElement): ChipFitMetrics | null {
  if (frame.getClientRects().length === 0 || !frame.querySelector('.select__measure')) return null
  const room = roomIn(frame)
  if (room === null) return null
  return { natural: frame.getBoundingClientRect().width + growth(frame), room }
}
