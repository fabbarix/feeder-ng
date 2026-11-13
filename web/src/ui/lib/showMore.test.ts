// DS-TODAY: a long list is capped at a few rows with "Show N more" (Throw out or keep? on Today: 3 rows). Plain TypeScript.
import { describe, expect, it } from 'vitest'
import { capRows } from './showMore'

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('capRows', () => {
  it('shows the first `cap` rows and says how many are hidden', () => {
    expect(capRows(rows(7), 3, false)).toEqual({ visible: [1, 2, 3], hidden: 4, capped: true })
  })

  it('expanded shows everything and still knows the list is longer than the cap (so "Show less" can be offered)', () => {
    expect(capRows(rows(7), 3, true)).toEqual({ visible: rows(7), hidden: 0, capped: true })
  })

  it('a list that fits is never capped: no button', () => {
    expect(capRows(rows(3), 3, false)).toEqual({ visible: rows(3), hidden: 0, capped: false })
    expect(capRows([], 3, false)).toEqual({ visible: [], hidden: 0, capped: false })
  })

  it('4 rows with a cap of 3 show 3 and report 1 hidden (the button then says "Show 1 more")', () => {
    expect(capRows(rows(4), 3, false)).toEqual({ visible: [1, 2, 3], hidden: 1, capped: true })
  })

  it('does not mutate its input', () => {
    const input = rows(5)
    capRows(input, 2, false)
    expect(input).toEqual(rows(5))
  })
})
