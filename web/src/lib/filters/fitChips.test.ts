// fitChips is stable (docs/design/recipes-filter.md 14). Hiding a chip happens as soon as it does not
// fit; showing a hidden chip again needs FIT_MARGIN px to spare, so a line at the edge cannot flip between the two answers.
import { describe, expect, it } from 'vitest'
import { FIT_MARGIN, fitChips } from './fitChips'

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

describe('fitChips: the chip line with "+N"', () => {
  it('shows every chip that fits with its gaps', () => {
    expect(fitChips([80, 100], 188, 8, 32)).toEqual({ visible: 2, hidden: 0 })
  })
  it('collapses the chips that do not fit into +N, leaving room for it', () => {
    // 80 + 8 + 100 = 188 > 180; 80 + 8 + 32 = 120 fits
    expect(fitChips([80, 100], 180, 8, 32)).toEqual({ visible: 1, hidden: 1 })
    expect(fitChips([60, 60, 60, 60], 200, 8, 32)).toEqual({ visible: 2, hidden: 2 })
  })
  it('always shows at least one chip (it then ends in an ellipsis)', () => {
    expect(fitChips([300, 100], 150, 8, 32)).toEqual({ visible: 1, hidden: 1 })
    expect(fitChips([300], 150, 8, 32)).toEqual({ visible: 1, hidden: 0 })
  })
  it('no chips: nothing visible, nothing hidden', () => {
    expect(fitChips([], 300, 8, 32)).toEqual({ visible: 0, hidden: 0 })
  })
  it('an unmeasured line (0 px, jsdom) shows every chip', () => {
    expect(fitChips([0, 0, 0], 0, 0, 0)).toEqual({ visible: 3, hidden: 0 })
  })
})

describe('fitChips on a line that is not measured', () => {
  it('shows every chip even when fewer are shown now (a chip added to an unmeasured line is not held back by the margin)', () => {
    expect(fitChips([0, 0], 0, 0, 0, 1)).toEqual({ visible: 2, hidden: 0 })
    expect(fitChips([80, 100], 0, 8, 32, 1)).toEqual({ visible: 2, hidden: 0 })
  })
})
