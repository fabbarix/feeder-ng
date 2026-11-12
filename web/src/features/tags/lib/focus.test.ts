// focusAfterRemoval: same rule as the Courses page (D2), on Tag ids by name.
import { describe, expect, it } from 'vitest'
import { focusAfterRemoval } from './focus'

describe('focusAfterRemoval', () => {
  it('the next row takes the place of the removed one', () => {
    expect(focusAfterRemoval([1, 2, 3, 4], 1)).toBe(2)
    expect(focusAfterRemoval([1, 2, 3, 4], 2)).toBe(3)
  })
  it('the previous row when the removed one was last', () => expect(focusAfterRemoval([1, 2, 3, 4], 4)).toBe(3))
  it('null when no Tag is left (Add Tag takes focus)', () => expect(focusAfterRemoval([5], 5)).toBeNull())
  it('the first row when the id was not in the order', () => expect(focusAfterRemoval([1, 2], 9)).toBe(1))
  it('null for an empty order', () => expect(focusAfterRemoval([], 9)).toBeNull())
  it('does not change the order it is given', () => {
    const order = [1, 2, 3]
    focusAfterRemoval(order, 2)
    expect(order).toEqual([1, 2, 3])
  })
})
