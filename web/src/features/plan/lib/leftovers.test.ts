import { describe, expect, it } from 'vitest'
import type { Leftover } from '../types'
import { leftoverRows } from './leftovers'

const l = (id: number, name: string, portions: number, useBy: string): Leftover => ({
  id, recipeId: id, recipeName: name, portions, cookedOn: '2026-11-08', useBy, fromDate: '2026-11-08', fromMealSlotId: 1,
})

describe('leftoverRows', () => {
  it('lists the soonest Use-by first, worded against today', () => {
    const rows = leftoverRows([l(2, 'Stew', 1, '2026-11-12'), l(1, 'Chicken', 2, '2026-11-09'), l(3, 'Soup', 3.5, '2026-11-10')], '2026-11-09')
    expect(rows.map((r) => [r.recipeName, r.portions, r.useBy])).toEqual([
      ['Chicken', '2 portions', 'Use by today'],
      ['Soup', '3.5 portions', 'Use by tomorrow'],
      ['Stew', '1 portion', 'Use by Thu'],
    ])
  })

  it('uses the spoil tone for Leftovers that must go today or tomorrow, the Leftover tone otherwise', () => {
    const rows = leftoverRows([l(1, 'A', 1, '2026-11-09'), l(2, 'B', 1, '2026-11-10'), l(3, 'C', 1, '2026-11-11')], '2026-11-09')
    expect(rows.map((r) => r.tone)).toEqual(['spoil', 'spoil', 'leftover'])
  })

  it('no Leftovers, no rows', () => {
    expect(leftoverRows([], '2026-11-09')).toEqual([])
  })
})
