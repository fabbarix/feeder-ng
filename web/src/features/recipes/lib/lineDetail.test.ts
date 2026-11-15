import { describe, expect, it } from 'vitest'
import { lineDetail } from './lineDetail'

describe('lineDetail (RX-04: the muted line under an Ingredient line)', () => {
  it('joins "Optional" and the note with a middle dot', () => {
    expect(lineDetail({ optional: true, note: 'crushed' })).toBe('Optional · crushed')
  })
  it('is "Optional" alone, the note alone, or nothing', () => {
    expect(lineDetail({ optional: true, note: '' })).toBe('Optional')
    expect(lineDetail({ optional: false, note: ' finely sliced ' })).toBe('finely sliced')
    expect(lineDetail({ optional: false, note: '' })).toBe('')
  })
  it('says an empty Base recipe has no Ingredients yet', () => {
    expect(lineDetail({ optional: false, note: '', baseRecipe: { id: 3, name: 'Béchamel', archived: false, empty: true } })).toBe('No Ingredients yet')
  })
})
