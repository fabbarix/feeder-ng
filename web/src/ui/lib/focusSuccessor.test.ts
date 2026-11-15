// B9-14 / A11Y-07: `focusSuccessor(before, after, focused)`, pure (`ui/lib/focusSuccessor.ts`). Where focus goes when the focused
// row leaves its list: the next row that is still there, else the previous one, else null (the caller then takes the list's
// heading, then the empty state's heading). A row that is still in the list needs no move: the answer is the row itself.
import { describe, expect, it } from 'vitest'
import { focusSuccessor } from './focusSuccessor'

describe('focusSuccessor (A11Y-07)', () => {
  it('goes to the next row in the same list', () => {
    expect(focusSuccessor(['a', 'b', 'c'], ['a', 'c'], 'b')).toBe('c')
  })
  it('goes to the previous row when the last row left', () => {
    expect(focusSuccessor(['a', 'b', 'c'], ['a', 'b'], 'c')).toBe('b')
  })
  it('skips rows that left too: the next one still there wins, then the previous one', () => {
    expect(focusSuccessor(['a', 'b', 'c', 'd'], ['a', 'd'], 'b')).toBe('d')
    expect(focusSuccessor(['a', 'b', 'c', 'd'], ['a', 'b'], 'c')).toBe('b')
    expect(focusSuccessor(['a', 'b', 'c'], ['c'], 'a')).toBe('c')
  })
  it('is null when no row is left (the heading, then the empty state, take the focus)', () => {
    expect(focusSuccessor(['a'], [], 'a')).toBeNull()
    expect(focusSuccessor(['a', 'b'], [], 'b')).toBeNull()
  })
  it('is the row itself while it is still in the list', () => {
    expect(focusSuccessor(['a', 'b', 'c'], ['a', 'b', 'c'], 'b')).toBe('b')
  })
  it('is null for a key that was never in the list', () => {
    expect(focusSuccessor(['a', 'b'], ['a', 'b'], 'zzz')).toBeNull()
  })
})
