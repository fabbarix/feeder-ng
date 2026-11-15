// B9-15 (DS-03, decision DS 6): the pure rule behind the Pantry Sort chip going icon-only: natural <= row - view - gap.
import { describe, expect, it } from 'vitest'
import { sortFits } from './sortFits'

describe('sortFits({ row, view, natural, gap })', () => {
  it('fits exactly: the value needs exactly the room that is left', () => {
    expect(sortFits({ row: 288, view: 150, natural: 130, gap: 8 })).toBe(true)
  })
  it('1 px short does not fit', () => {
    expect(sortFits({ row: 288, view: 150, natural: 131, gap: 8 })).toBe(false)
  })
  it('the gap counts: without it the same chip would fit', () => {
    expect(sortFits({ row: 288, view: 150, natural: 138, gap: 0 })).toBe(true)
    expect(sortFits({ row: 288, view: 150, natural: 138, gap: 8 })).toBe(false)
  })
  it('plenty of room fits', () => {
    expect(sortFits({ row: 1000, view: 200, natural: 74, gap: 8 })).toBe(true)
  })
  it('a row narrower than the view control never fits', () => {
    expect(sortFits({ row: 100, view: 150, natural: 10, gap: 8 })).toBe(false)
  })
})
