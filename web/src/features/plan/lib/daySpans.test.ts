// B9-32 (PC-11 option B, decision PC 2): the week grid has 12 tracks; each day spans 12 / columns and the r days of an incomplete
// last row span 12 / r each. Plain functions, no React. TEST-AUTHOR tests: gridColumns and daySpans are stubs that throw.
import { describe, expect, it } from 'vitest'
import { daySpans, gridColumns } from './days'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
/** The spans cut into rows of `columns` days (the last row may be shorter). */
const rowsOf = (spans: number[], columns: number): number[][] => {
  const out: number[][] = []
  for (let i = 0; i < spans.length; i += columns) out.push(spans.slice(i, i + columns))
  return out
}

describe('gridColumns: min(4, floor((container + gap) / (21 rem + gap)))', () => {
  // The chapter's table: 1 below 684 px of container, 2 up to 1031, 3 up to 1379, 4 from 1380 (gap 12 px, 1 rem = 16 px).
  it.each([
    [320, 1],
    [375, 1],
    [683, 1],
    [684, 2],
    [772, 2],
    [1031, 2],
    [1032, 3],
    [1136, 3],
    [1379, 3],
    [1380, 4],
    [1480, 4],
    [2560, 4],
  ])('a container of %i px has %i column(s)', (px, columns) => {
    expect(gridColumns(px)).toBe(columns)
  })

  it('never drops below one column, whatever the width (0 and negative included)', () => {
    expect(gridColumns(0)).toBe(1)
    expect(gridColumns(-40)).toBe(1)
  })

  it('follows the root font size: at 24 px a rem, 21 rem is 504 px and 684 px holds one column', () => {
    expect(gridColumns(684, { remPx: 24 })).toBe(1)
    expect(gridColumns(1020, { remPx: 24 })).toBe(2)
  })

  it('takes the gap as an option (default 12 px)', () => {
    expect(gridColumns(672, { gapPx: 0 })).toBe(2)
    expect(gridColumns(672)).toBe(1)
  })
})

describe('daySpans: 12 tracks, an incomplete last row shared by its days', () => {
  it('chapter: daySpans(7, 2) is six days of 6 and one of 12', () => {
    expect(daySpans(7, 2)).toEqual([6, 6, 6, 6, 6, 6, 12])
  })
  it('chapter: daySpans(7, 3) is six days of 4 and one of 12', () => {
    expect(daySpans(7, 3)).toEqual([4, 4, 4, 4, 4, 4, 12])
  })
  it('chapter: daySpans(7, 4) is four days of 3 and three of 4', () => {
    expect(daySpans(7, 4)).toEqual([3, 3, 3, 3, 4, 4, 4])
  })
  it('chapter: daySpans(5, 3) is three days of 4 and two of 6', () => {
    expect(daySpans(5, 3)).toEqual([4, 4, 4, 6, 6])
  })
  it('one column: every day has the whole row (12)', () => {
    expect(daySpans(7, 1)).toEqual([12, 12, 12, 12, 12, 12, 12])
  })
  it('a complete last row has no sharing: 8 days in 4 columns are all 3', () => {
    expect(daySpans(8, 4)).toEqual([3, 3, 3, 3, 3, 3, 3, 3])
  })
  it('fewer days than columns share the one row: 2 days in 4 columns are 6 each, 1 day is 12', () => {
    expect(daySpans(2, 4)).toEqual([6, 6])
    expect(daySpans(1, 4)).toEqual([12])
    expect(daySpans(3, 4)).toEqual([4, 4, 4])
  })
  it('works for any Planning Horizon, not only 7 days: 14 days in 4 columns end with two days of 6', () => {
    expect(daySpans(14, 4)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 6])
  })
  it('no days, no spans', () => {
    expect(daySpans(0, 3)).toEqual([])
  })
  it('every row sums to 12 for every horizon from 1 to 28 days and 1 to 4 columns, and no day is wider than 12', () => {
    for (let count = 1; count <= 28; count++) {
      for (let columns = 1; columns <= 4; columns++) {
        const spans = daySpans(count, columns)
        expect(spans).toHaveLength(count)
        for (const row of rowsOf(spans, columns)) expect(sum(row), `${count} days in ${columns} columns: ${spans}`).toBe(12)
        expect(Math.max(...spans)).toBeLessThanOrEqual(12)
      }
    }
  })
  it('a week never ends with a lone day beside an empty space: the last row is always full', () => {
    for (const columns of [2, 3, 4]) {
      const last = rowsOf(daySpans(7, columns), columns).at(-1)!
      expect(sum(last)).toBe(12)
    }
  })
})
