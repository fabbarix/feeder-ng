import { describe, expect, it } from 'vitest'
import { slotAnchorId, slotHash, slotIdFromHash } from './slotAnchor'

describe('Meal Slot anchors (deep link from "Choose who attends")', () => {
  it('builds the element id and the URL hash', () => {
    expect(slotAnchorId(12)).toBe('meal-slot-12')
    expect(slotHash(12)).toBe('#meal-slot-12')
  })
  it('reads the slot id back, or null', () => {
    expect(slotIdFromHash('#meal-slot-12')).toBe(12)
    for (const bad of ['', '#', '#meal-slot-', '#meal-slot-x', '#other-12', 'meal-slot-12']) expect(slotIdFromHash(bad), bad).toBeNull()
  })
})
