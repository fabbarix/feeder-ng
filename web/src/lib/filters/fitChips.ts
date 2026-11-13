// The fit of a one-line chip line with "+N" (docs/design/recipes-filter.md 5.4, 14; docs/design/pantry-filter.md 5). Plain
// TypeScript, no React: the Recipes and the Pantry filter headers both use it, through ui/FilterBar/useFittingChips.

/**
 * The room a shown chip must leave before one more chip is shown again (docs/design/recipes-filter.md 14). Hiding happens
 * as soon as a chip does not fit; showing one more needs this much spare, so a line at the edge cannot flip between two answers.
 */
export const FIT_MARGIN = 12

/**
 * How many chips of a line show: all of them when they fit with their gaps, else as many as fit with a gap and the "+N" chip
 * (`plusWidth`) after them. At least one chip shows, and an unmeasured line (0 px) shows every chip.
 *
 * `current` is the number of chips shown now. With it, showing a chip beyond `current` needs FIT_MARGIN px to spare; hiding does
 * not. The answer is a fixed point: fitting again from it gives the same answer, so a re-render with the same widths settles.
 */
export function fitChips(
  widths: readonly number[],
  available: number,
  gap: number,
  plusWidth: number,
  current?: number,
): { visible: number; hidden: number } {
  const n = widths.length
  if (n === 0) return { visible: 0, hidden: 0 }
  // An unmeasured line (0 px: not laid out, or jsdom) shows every chip, whatever is shown now (pantry-filter: a chip added to a line
  // that was never measured stayed in "+N", the margin of a line with no room).
  if (available <= 0) return { visible: n, hidden: 0 }
  const used = (k: number) => {
    const chips = widths.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 1)
    return k === n ? chips : chips + gap + plusWidth
  }
  for (let k = n; k >= 2; k--) {
    const margin = current !== undefined && k > current ? FIT_MARGIN : 0
    if (used(k) + margin <= available) return { visible: k, hidden: n - k }
  }
  return { visible: 1, hidden: n - 1 }
}
