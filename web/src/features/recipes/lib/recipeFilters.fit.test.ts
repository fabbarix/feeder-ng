// hf-recipes-filter round 3: fitChips is stable (docs/design/recipes-filter.md 14). Hiding a chip happens as soon as it does not
// fit; showing a hidden chip again needs FIT_MARGIN px to spare, so a line at the edge cannot flip between the two answers.
import { describe, expect, it } from 'vitest'
import { FIT_MARGIN, fitChips } from './recipeFilters'

describe('FIT_MARGIN', () => {
  it('is a small number of px: 8 to 16 (more than subpixel rounding and the round-2 8 px disagreement, less than a chip)', () => {
    expect(FIT_MARGIN).toBeGreaterThanOrEqual(8)
    expect(FIT_MARGIN).toBeLessThanOrEqual(16)
  })
})

describe('fitChips with the current answer', () => {
  // Side 64, Tag 200, gap 8, "+1" 32: all visible need 272 px.
  const widths = [64, 200]
  it('with every chip shown, they stay while they fit exactly (no margin to hide)', () => {
    expect(fitChips(widths, 272, 8, 32, 2)).toEqual({ visible: 2, hidden: 0 })
    expect(fitChips(widths, 271, 8, 32, 2)).toEqual({ visible: 1, hidden: 1 })
  })
  it('with a chip hidden, it shows again only with FIT_MARGIN px to spare', () => {
    expect(fitChips(widths, 272, 8, 32, 1)).toEqual({ visible: 1, hidden: 1 })
    expect(fitChips(widths, 272 + FIT_MARGIN - 1, 8, 32, 1)).toEqual({ visible: 1, hidden: 1 })
    expect(fitChips(widths, 272 + FIT_MARGIN, 8, 32, 1)).toEqual({ visible: 2, hidden: 0 })
  })
  it('the margin applies to showing any one more chip, not only to showing all', () => {
    const three = [60, 60, 60] // two + "+1": 60 + 8 + 60 + 8 + 32 = 168
    expect(fitChips(three, 168, 8, 32, 1)).toEqual({ visible: 1, hidden: 2 })
    expect(fitChips(three, 168 + FIT_MARGIN, 8, 32, 1)).toEqual({ visible: 2, hidden: 1 })
  })
  it('without a current answer it behaves as before', () => {
    expect(fitChips(widths, 272, 8, 32)).toEqual({ visible: 2, hidden: 0 })
    expect(fitChips(widths, 271, 8, 32)).toEqual({ visible: 1, hidden: 1 })
  })
  it('is a fixed point: fitting again from its own answer gives the same answer, at every width', () => {
    for (let available = 60; available <= 400; available++) {
      for (const start of [1, 2]) {
        const first = fitChips(widths, available, 8, 32, start).visible
        expect(fitChips(widths, available, 8, 32, first).visible, `${available} px from ${start}`).toBe(first)
      }
    }
  })
})
