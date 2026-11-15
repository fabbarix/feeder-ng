// B9-34 (SSP-01, SSP-02): the two glyphs a ticked row's meta needs are registered (MinusCircle "Not added to Stock", ArrowBendDownRight
// "More since your tick"); the Package ("stock") and Barcode ("scan") ones already are. Registering them is a change to ui/icons.ts
// (not a B9-34 file: the hand-back says so); the bundle budget (scripts/check-bundle-budget.sh, icons-bundle test) must still hold.
import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'

describe('icons the Shop rows use', () => {
  it.each(['stock', 'scan', 'notAdded', 'moreSince'])('"%s" is registered', (name) => {
    expect(Object.keys(icons)).toContain(name)
  })
})
