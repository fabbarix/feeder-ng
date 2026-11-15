import { describe, expect, it } from 'vitest'
import { allSelected, exportHref, selectAllIds, selectionState, toggleId } from './exportSelection'

describe('export selection', () => {
  it('toggles an id in and out, ascending, without mutating', () => {
    const start = [5, 2]
    expect(toggleId(start, 9)).toEqual([2, 5, 9])
    expect(toggleId(start, 2)).toEqual([5])
    expect(start).toEqual([5, 2])
  })
  it('selects all ids ascending', () => expect(selectAllIds([3, 1, 2])).toEqual([1, 2, 3]))
  it('knows when everything is selected', () => {
    expect(allSelected([1, 2], [2, 1])).toBe(true)
    expect(allSelected([1, 2], [1])).toBe(false)
    expect(allSelected([], [])).toBe(false)
  })
  it('builds the download address', () => {
    expect(exportHref([1, 2, 3], [])).toBeNull()
    expect(exportHref([1, 2, 3], [3, 1])).toBe('/api/recipe-file/export?ids=1,3')
    expect(exportHref([1, 2, 3], [1, 2, 3])).toBe('/api/recipe-file/export?all=1')
    expect(exportHref([7], [7])).toBe('/api/recipe-file/export?all=1')
  })
})

// B9-28 (RX-15): the tri-state of the "All Recipes" Checkbox.
describe('selectionState', () => {
  it('is none, some or all', () => {
    expect(selectionState([1, 2, 3], [])).toBe('none')
    expect(selectionState([1, 2, 3], [2])).toBe('some')
    expect(selectionState([1, 2, 3], [3, 1, 2])).toBe('all')
  })
  it('ignores ids that are not in the list, and is none for an empty list', () => {
    expect(selectionState([1, 2], [9])).toBe('none')
    expect(selectionState([], [])).toBe('none')
  })
})
