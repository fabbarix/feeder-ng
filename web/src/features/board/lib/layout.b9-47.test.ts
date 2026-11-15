// B9-47 (TB-07, SHORT-03): the board has four layouts. wall (4 x 3, landscape, 600 px wide and 560 px high), portrait (a portrait tablet:
// 2 columns, 5 rows, filling one screen), scroll (a phone held sideways: 4 columns, content-height rows, the board scrolls) and phone
// (2 columns, below 600 px). A viewport picks one through boardLayoutKind({ wide, short, portrait }).
import { describe, expect, it } from 'vitest'
import { boardLayout, boardLayoutKind, type BoardCell } from './layout'

const ids = (cells: BoardCell[]) => cells.map((c) => c.id).sort()
const ALL = ['clock', 'leftovers', 'nextAdvance', 'streak', 'timers', 'tomorrow', 'tonight', 'useSoon']

/** Every grid slot (col, row) a cell covers; fails on a slot taken twice. */
function slotsOf(cells: BoardCell[]): { taken: Set<string>; clash: string[] } {
  const taken = new Set<string>()
  const clash: string[] = []
  for (const c of cells) {
    for (let col = c.col; col < c.col + c.colSpan; col++) {
      for (let row = c.row; row < c.row + c.rowSpan; row++) {
        const key = `${col}/${row}`
        if (taken.has(key)) clash.push(key)
        taken.add(key)
      }
    }
  }
  return { taken, clash }
}
const cell = (cells: BoardCell[], id: BoardCell['id']) => cells.find((c) => c.id === id)!

describe('boardLayoutKind picks the layout from the viewport', () => {
  it('below 600 px wide it is the phone layout, whatever the height and orientation', () => {
    expect(boardLayoutKind({ wide: false, short: false, portrait: true })).toBe('phone')
    expect(boardLayoutKind({ wide: false, short: true, portrait: false })).toBe('phone')
  })
  it('a portrait screen from 600 px wide is the portrait layout', () => {
    expect(boardLayoutKind({ wide: true, short: false, portrait: true })).toBe('portrait')
  })
  it('a landscape screen under 560 px high (a phone held sideways) is the scroll layout', () => {
    expect(boardLayoutKind({ wide: true, short: true, portrait: false })).toBe('scroll')
  })
  it('a landscape screen from 560 px high is the wall layout', () => {
    expect(boardLayoutKind({ wide: true, short: false, portrait: false })).toBe('wall')
  })
})

describe('boardLayout by name (the numbers 2 and 4 still mean phone and wall)', () => {
  it('2 and "phone" are the 2-column layout; 4 and "wall" the 4 x 3 layout', () => {
    expect(boardLayout(2)).toEqual(boardLayout('phone'))
    expect(boardLayout(4)).toEqual(boardLayout('wall'))
    expect(boardLayout('wall').map((c) => c.id)).toEqual(boardLayout(4).map((c) => c.id))
  })
})

describe('boardLayout("portrait"): 2 columns, 5 rows, one screen (TB-07)', () => {
  const layout = boardLayout('portrait')
  it('has the 8 tiles once and no two overlap', () => {
    expect(layout).toHaveLength(8)
    expect(ids(layout)).toEqual(ALL)
    expect(slotsOf(layout).clash).toEqual([])
  })
  it('is the chapter\'s table: Hero; Clock, Next Advance Step; Leftovers, Timers; Use soon; Tomorrow, streak', () => {
    const at = (id: BoardCell['id']) => [cell(layout, id).row, cell(layout, id).col, cell(layout, id).colSpan, cell(layout, id).rowSpan]
    expect(at('tonight')).toEqual([1, 1, 2, 1])
    expect(at('clock')).toEqual([2, 1, 1, 1])
    expect(at('nextAdvance')).toEqual([2, 2, 1, 1])
    expect(at('leftovers')).toEqual([3, 1, 1, 1])
    expect(at('timers')).toEqual([3, 2, 1, 1])
    expect(at('useSoon')).toEqual([4, 1, 2, 1])
    expect(at('tomorrow')).toEqual([5, 1, 1, 1])
    expect(at('streak')).toEqual([5, 2, 1, 1])
  })
  it('fills a 2 x 5 grid exactly: no empty slot', () => {
    expect(slotsOf(layout).taken.size).toBe(10)
  })
})

describe('boardLayout("scroll"): a phone held sideways (SHORT-03)', () => {
  const layout = boardLayout('scroll')
  it('has the 8 tiles once, in 4 columns, with none overlapping', () => {
    expect(ids(layout)).toEqual(ALL)
    expect(slotsOf(layout).clash).toEqual([])
    expect(Math.max(...layout.map((c) => c.col + c.colSpan - 1))).toBe(4)
  })
  it('the hero is 2 x 2 at the top left; the clock and Next Advance Step, Leftovers and Timers follow beside and below it', () => {
    expect(cell(layout, 'tonight')).toMatchObject({ col: 1, row: 1, colSpan: 2, rowSpan: 2 })
    expect(cell(layout, 'clock')).toMatchObject({ col: 3, row: 1 })
    expect(cell(layout, 'nextAdvance')).toMatchObject({ col: 4, row: 1 })
    expect(cell(layout, 'leftovers')).toMatchObject({ col: 3, row: 2 })
    expect(cell(layout, 'timers')).toMatchObject({ col: 4, row: 2 })
  })
  it('Tomorrow is at row 3, columns 1 to 2, and Use soon at row 3, column 3 (the chapter\'s unit test)', () => {
    expect(cell(layout, 'tomorrow')).toMatchObject({ row: 3, col: 1, colSpan: 2 })
    expect(cell(layout, 'useSoon')).toMatchObject({ row: 3, col: 3, colSpan: 1 })
  })
  it('the streak is the last of row 3 (a choice: the chapter lists it last), so the 4 x 3 grid is full', () => {
    expect(cell(layout, 'streak')).toMatchObject({ row: 3, col: 4 })
    expect(slotsOf(layout).taken.size).toBe(12)
  })
})
