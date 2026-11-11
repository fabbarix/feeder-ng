// R2-4 L-10: below 600 px the kitchen board has 2 columns with the hero full width; the wall layout is unchanged.
import { describe, expect, it } from 'vitest'
import { BOARD_LAYOUT, boardLayout } from './layout'

const ids = ['clock', 'leftovers', 'nextAdvance', 'streak', 'timers', 'tomorrow', 'tonight', 'useSoon']

describe('boardLayout(columns)', () => {
  it('4 columns is the wall layout, unchanged', () => {
    expect(boardLayout(4)).toEqual(BOARD_LAYOUT)
  })

  const phone = () => boardLayout(2)
  it('2 columns has the eight tiles, each once', () => {
    expect(phone().map((c) => c.id).sort()).toEqual(ids)
  })
  it('stays inside 2 columns', () => {
    for (const c of phone()) {
      expect(c.col).toBeGreaterThanOrEqual(1)
      expect(c.col + c.colSpan - 1).toBeLessThanOrEqual(2)
      expect(c.rowSpan).toBe(1)
    }
  })
  it('Tonight (the hero) is full width in the first row', () => {
    expect(phone().find((c) => c.id === 'tonight')).toMatchObject({ col: 1, row: 1, colSpan: 2, rowSpan: 1 })
  })
  it('Use soon is full width too (it lists up to five rows)', () => {
    expect(phone().find((c) => c.id === 'useSoon')).toMatchObject({ col: 1, colSpan: 2 })
  })
  it('no overlap and no hole: every cell of the used rows is covered once', () => {
    const seen = new Set<string>()
    let maxRow = 0
    for (const c of phone()) {
      for (let k = c.col; k < c.col + c.colSpan; k++) {
        const key = `${k},${c.row}`
        expect(seen.has(key), `overlap at ${key}`).toBe(false)
        seen.add(key)
      }
      maxRow = Math.max(maxRow, c.row)
    }
    expect(seen.size).toBe(maxRow * 2)
  })
})
