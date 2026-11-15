// B9-40 (SHORT-01): the words of the Advance Steps chip in short landscape.
import { describe, expect, it } from 'vitest'
import { advanceChipLabel, advanceChipName } from './advanceChip'

describe('advanceChipLabel', () => {
  it('singular and plural', () => {
    expect(advanceChipLabel(1)).toBe('1 Advance Step to do')
    expect(advanceChipLabel(2)).toBe('2 Advance Steps to do')
    expect(advanceChipLabel(12)).toBe('12 Advance Steps to do')
  })
  it('nothing to do: no label (the chip is absent)', () => {
    expect(advanceChipLabel(0)).toBe('')
    expect(advanceChipLabel(-1)).toBe('')
  })
})

describe('advanceChipName (the name stays the same when the label shortens to the count)', () => {
  it('is "Advance Steps: N to do"', () => {
    expect(advanceChipName(1)).toBe('Advance Steps: 1 to do')
    expect(advanceChipName(3)).toBe('Advance Steps: 3 to do')
    expect(advanceChipName(0)).toBe('')
  })
})
