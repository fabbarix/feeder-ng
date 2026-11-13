// hf-recipes-filter round 2: a popover can line its END edge up with its anchor's end edge (the Filters panel under the Filters
// button, docs/design/recipes-filter.md 7.1, 13.5). Start alignment stays the default (Select, DateField).
import { describe, expect, it } from 'vitest'
import { placePopover } from './placePopover'

const viewport = { width: 834, height: 1194 }
const button = { top: 180, left: 690, right: 802, bottom: 216 }

describe('placePopover align: end', () => {
  it('puts the popover\'s right edge on the anchor\'s right edge', () => {
    const placed = placePopover({ anchor: button, size: { width: 384, height: 500 }, viewport, align: 'end' })
    expect(placed.left + 384).toBe(802)
    expect(placed.placement).toBe('below')
  })
  it('stays inside the margin when the anchor is near the start edge', () => {
    const near = { top: 180, left: 20, right: 100, bottom: 216 }
    expect(placePopover({ anchor: near, size: { width: 384, height: 500 }, viewport, align: 'end', margin: 16 }).left).toBe(16)
  })
  it('stays inside the margin at the end edge too', () => {
    const edge = { top: 180, left: 760, right: 830, bottom: 216 }
    const placed = placePopover({ anchor: edge, size: { width: 384, height: 500 }, viewport, align: 'end', margin: 16 })
    expect(placed.left + 384).toBe(834 - 16)
  })
  it('start alignment is still the default', () => {
    expect(placePopover({ anchor: button, size: { width: 100, height: 50 }, viewport }).left).toBe(690)
  })
})
