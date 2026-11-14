// b8-pantry G1 (docs/dev/design/b8-pantry.md): the open Filters popover is capped to the viewport by useFloatingPopover (a max-height
// on the panel), and the panel is `overflow: visible`, so a body taller than the cap (the Pantry with a Food or Supplies section on a
// 768 or 900 px high window) spilled over the footer and past the window. The body scrolls inside the cap instead.
import { describe, expect, it } from 'vitest'
import { cssRules } from '../../test/cssRules'

const { valueFor } = cssRules(['ui/FilterBar/FilterBar.css'])

describe('the Filters popover body', () => {
  it('scrolls inside the panel (the popover is flex, its body may shrink), and never sideways', () => {
    expect(valueFor('.filter-panel .popover__body', 'overflow-y', 1280)).toBe('auto')
    expect(valueFor('.filter-panel .popover__body', 'overflow-x', 1280)).toBe('hidden')
    expect(valueFor('.filter-panel .popover__body', 'min-block-size', 1280)).toBe('0')
  })
  it('keeps a wheel at the end of the body from scrolling the page under the open panel', () => {
    expect(valueFor('.filter-panel .popover__body', 'overscroll-behavior', 1280)).toBe('contain')
  })
  it('keeps the bottom sheet as it was (the sheet scrolls as a whole)', () => {
    expect(valueFor('.filter-panel .popover__body', 'overflow-y', 390)).toBeUndefined()
  })
})
