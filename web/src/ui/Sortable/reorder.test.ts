// Pure reorder maths of ui/Sortable (docs/dev/design/sort-drag.md section 3). No DOM, no React.
import { describe, expect, it } from 'vitest'
import {
  AUTO_SCROLL_EDGE,
  AUTO_SCROLL_MAX_STEP,
  DRAG_THRESHOLD,
  autoScrollDelta,
  displayOrder,
  exceedsThreshold,
  keyTarget,
  moveItem,
  slotAt,
} from './reorder'

describe('moveItem', () => {
  it('moves an item down and up, shifting the ones in between', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('clamps the target to the list and ignores a source outside it', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -4)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 7, 0)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], -1, 0)).toEqual(['a', 'b', 'c'])
  })
  it('returns a new array and never mutates the input, even for a no-op', () => {
    const input = Object.freeze(['a', 'b', 'c'])
    const same = moveItem(input, 1, 1)
    expect(same).toEqual(['a', 'b', 'c'])
    expect(same).not.toBe(input)
    expect(moveItem(input, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(input).toEqual(['a', 'b', 'c'])
  })
  it('keeps object identity of the items', () => {
    const a = { id: 1 }
    const b = { id: 2 }
    expect(moveItem([a, b], 0, 1)[1]).toBe(a)
  })
})

describe('displayOrder', () => {
  it('lists the original indices in the order they are shown while one is moved', () => {
    expect(displayOrder(4, 1, 3)).toEqual([0, 2, 3, 1])
    expect(displayOrder(4, 3, 0)).toEqual([3, 0, 1, 2])
    expect(displayOrder(3, 1, 1)).toEqual([0, 1, 2])
    expect(displayOrder(0, 0, 0)).toEqual([])
  })
})

describe('slotAt', () => {
  const slots = [
    { top: 0, bottom: 50 },
    { top: 50, bottom: 100 },
    { top: 100, bottom: 150 },
  ]
  it('finds the slot under the pointer; a shared edge belongs to the lower slot', () => {
    expect(slotAt(slots, 25)).toBe(0)
    expect(slotAt(slots, 75)).toBe(1)
    expect(slotAt(slots, 149)).toBe(2)
    expect(slotAt(slots, 50)).toBe(1)
  })
  it('clamps above the first and below the last slot', () => {
    expect(slotAt(slots, -30)).toBe(0)
    expect(slotAt(slots, 400)).toBe(2)
  })
  it('puts a point in the gap between slots with the nearer one, a tie with the following slot', () => {
    const gapped = [
      { top: 0, bottom: 50 },
      { top: 58, bottom: 108 },
    ]
    expect(slotAt(gapped, 53)).toBe(0)
    expect(slotAt(gapped, 54)).toBe(1)
    expect(slotAt(gapped, 57)).toBe(1)
  })
  it('answers 0 for an empty list', () => {
    expect(slotAt([], 10)).toBe(0)
  })
})

describe('autoScrollDelta', () => {
  const bounds = { top: 0, bottom: 800 }
  it('uses a 48 px edge zone and a 20 px step', () => {
    expect(AUTO_SCROLL_EDGE).toBe(48)
    expect(AUTO_SCROLL_MAX_STEP).toBe(20)
  })
  it('is 0 away from the edges and at the edge of the zone', () => {
    expect(autoScrollDelta(400, bounds)).toBe(0)
    expect(autoScrollDelta(752, bounds)).toBe(0)
    expect(autoScrollDelta(48, bounds)).toBe(0)
  })
  it('ramps linearly towards the bottom edge (positive) and the top edge (negative)', () => {
    expect(autoScrollDelta(776, bounds)).toBe(10)
    expect(autoScrollDelta(800, bounds)).toBe(20)
    expect(autoScrollDelta(24, bounds)).toBe(-10)
    expect(autoScrollDelta(0, bounds)).toBe(-20)
  })
  it('stays at the full step beyond the bounds', () => {
    expect(autoScrollDelta(900, bounds)).toBe(20)
    expect(autoScrollDelta(-50, bounds)).toBe(-20)
  })
  it('honours a custom edge and step', () => {
    expect(autoScrollDelta(90, bounds, 100, 40)).toBe(-4)
  })
})

describe('drag threshold', () => {
  it('is 4 px for a mouse and 8 px for touch and pen', () => {
    expect(DRAG_THRESHOLD).toEqual({ mouse: 4, touch: 8, pen: 8 })
  })
  it('needs the pointer to travel further than the threshold, in any direction', () => {
    expect(exceedsThreshold(3, 0, 'mouse')).toBe(false)
    expect(exceedsThreshold(4, 0, 'mouse')).toBe(false)
    expect(exceedsThreshold(0, -5, 'mouse')).toBe(true)
    expect(exceedsThreshold(3, 3, 'mouse')).toBe(true)
    expect(exceedsThreshold(5, 5, 'touch')).toBe(false)
    expect(exceedsThreshold(6, 6, 'touch')).toBe(true)
    expect(exceedsThreshold(0, 9, 'pen')).toBe(true)
  })
})

describe('keyTarget', () => {
  it('maps the arrow keys to one step, Home and End to the ends', () => {
    expect(keyTarget('ArrowDown', 0, 3)).toBe(1)
    expect(keyTarget('ArrowUp', 2, 3)).toBe(1)
    expect(keyTarget('Home', 2, 3)).toBe(0)
    expect(keyTarget('End', 0, 3)).toBe(2)
  })
  it('returns the same index at an edge so the caller can announce it', () => {
    expect(keyTarget('ArrowDown', 2, 3)).toBe(2)
    expect(keyTarget('ArrowUp', 0, 3)).toBe(0)
  })
  it('ignores every other key, including the horizontal arrows (the list is vertical)', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'a', 'Enter', 'Tab', ' ']) expect(keyTarget(k, 1, 3), k).toBeNull()
  })
})
