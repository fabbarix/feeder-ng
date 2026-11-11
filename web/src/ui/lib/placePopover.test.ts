// XS: where a floating popover goes (pure; jsdom cannot lay out). Used by Select and DateField, which float their
// popovers in the top layer so no dialog's overflow can clip them.
import { describe, expect, it } from 'vitest'
import { placePopover } from './placePopover'

const viewport = { width: 1024, height: 768 }
const anchor = { top: 100, left: 200, right: 520, bottom: 148 }

describe('placePopover', () => {
  it('opens below the anchor, left edges aligned, when it fits', () => {
    expect(placePopover({ anchor, size: { width: 360, height: 300 }, viewport })).toEqual({ top: 152, left: 200, maxHeight: 608, placement: 'below' })
  })

  it('flips above when it does not fit below and there is more room above', () => {
    const low = { top: 600, left: 200, right: 520, bottom: 648 }
    expect(placePopover({ anchor: low, size: { width: 360, height: 300 }, viewport })).toEqual({ top: 296, left: 200, maxHeight: 588, placement: 'above' })
  })

  it('stays below and caps maxHeight when it fits on neither side but below has more room', () => {
    const high = { top: 300, left: 200, right: 520, bottom: 348 }
    expect(placePopover({ anchor: high, size: { width: 360, height: 900 }, viewport })).toEqual({ top: 352, left: 200, maxHeight: 408, placement: 'below' })
  })

  it('goes above and caps maxHeight when it fits on neither side but above has more room', () => {
    const low = { top: 500, left: 200, right: 520, bottom: 548 }
    const placed = placePopover({ anchor: low, size: { width: 360, height: 900 }, viewport })
    expect(placed.placement).toBe('above')
    expect(placed.maxHeight).toBe(488)
    expect(placed.top).toBe(8) // the capped height (488) ends 4 px above the anchor
  })

  it('keeps the popover inside the viewport horizontally (8 px margin)', () => {
    const right = { top: 100, left: 900, right: 1000, bottom: 148 }
    expect(placePopover({ anchor: right, size: { width: 360, height: 100 }, viewport }).left).toBe(656)
    const left = { top: 100, left: -20, right: 80, bottom: 148 }
    expect(placePopover({ anchor: left, size: { width: 360, height: 100 }, viewport }).left).toBe(8)
  })

  it('a popover wider than the viewport starts at the margin (CSS caps its width)', () => {
    expect(placePopover({ anchor, size: { width: 500, height: 100 }, viewport: { width: 400, height: 768 } }).left).toBe(8)
  })

  it('honours custom gap and margin', () => {
    expect(placePopover({ anchor, size: { width: 100, height: 100 }, viewport, gap: 10, margin: 16 })).toMatchObject({ top: 158, maxHeight: 768 - 148 - 10 - 16 })
  })
})
