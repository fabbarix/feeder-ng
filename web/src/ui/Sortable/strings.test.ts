// The words of ui/Sortable (docs/dev/design/sort-drag.md section 4).
import { describe, expect, it } from 'vitest'
import { sortableStrings as s } from './strings'

describe('sortableStrings', () => {
  it('names the handle and gives the instructions every handle points at', () => {
    expect(s.handleLabel('garlic')).toBe('Reorder garlic')
    expect(s.instructions).toBe('Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.')
  })
  it('announces a pick up with the keys for the keyboard and without them for the pointer', () => {
    expect(s.liftedKeyboard('garlic', 1, 3)).toBe('Picked up garlic. Position 1 of 3. Use the arrow keys to move, Space to drop, Escape to cancel.')
    expect(s.liftedPointer('garlic', 1, 3)).toBe('Picked up garlic. Position 1 of 3.')
  })
  it('announces each move, an edge, the drop and the cancel', () => {
    expect(s.moved('garlic', 2, 3)).toBe('garlic moved to position 2 of 3.')
    expect(s.atEdge('garlic', 'first')).toBe('garlic is already first.')
    expect(s.atEdge('garlic', 'last')).toBe('garlic is already last.')
    expect(s.dropped('garlic', 2, 3)).toBe('Dropped garlic at position 2 of 3.')
    expect(s.droppedUnchanged('garlic', 1, 3)).toBe('Dropped garlic. Position unchanged, 1 of 3.')
    expect(s.cancelled('garlic', 1, 3)).toBe('Reordering cancelled. garlic stays at position 1 of 3.')
  })
  it('uses no word the GLOSSARY avoids for these things (no "drag and drop" jargon, no "re-order")', () => {
    const all = [s.instructions, s.handleLabel('x'), s.liftedKeyboard('x', 1, 2), s.moved('x', 1, 2), s.dropped('x', 1, 2), s.cancelled('x', 1, 2)].join(' ')
    expect(all).not.toMatch(/re-order|drag and drop|grab/i)
  })
})
