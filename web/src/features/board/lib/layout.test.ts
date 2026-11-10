import { describe, expect, it } from 'vitest'
import { BOARD_LAYOUT } from './layout'

describe('BOARD_LAYOUT (5.13: 4 x 3 at 1280 x 800, no overlap)', () => {
  it('has the eight tiles, each once', () => {
    expect(BOARD_LAYOUT.map((c) => c.id).sort()).toEqual(['clock', 'leftovers', 'nextAdvance', 'streak', 'timers', 'tomorrow', 'tonight', 'useSoon'])
  })

  it('stays inside a 4 x 3 grid', () => {
    for (const c of BOARD_LAYOUT) {
      expect(c.col).toBeGreaterThanOrEqual(1)
      expect(c.row).toBeGreaterThanOrEqual(1)
      expect(c.col + c.colSpan - 1).toBeLessThanOrEqual(4)
      expect(c.row + c.rowSpan - 1).toBeLessThanOrEqual(3)
    }
  })

  it('covers all 12 cells exactly once: no overlap, no hole', () => {
    const seen = new Map<string, string>()
    for (const c of BOARD_LAYOUT) {
      for (let r = c.row; r < c.row + c.rowSpan; r++) {
        for (let k = c.col; k < c.col + c.colSpan; k++) {
          const key = `${k},${r}`
          expect(seen.has(key), `${c.id} overlaps ${seen.get(key)} at ${key}`).toBe(false)
          seen.set(key, c.id)
        }
      }
    }
    expect(seen.size).toBe(12)
  })

  it('makes Tonight the 2 x 2 hero at the top left and Use soon 2 x 1', () => {
    const by = Object.fromEntries(BOARD_LAYOUT.map((c) => [c.id, c]))
    expect(by.tonight).toMatchObject({ col: 1, row: 1, colSpan: 2, rowSpan: 2 })
    expect(by.useSoon).toMatchObject({ colSpan: 2, rowSpan: 1 })
  })
})
