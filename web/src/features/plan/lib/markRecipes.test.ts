// B9-32 (PC-07): the rows of "Mark Recipes as <Course>". Pure.
import { describe, expect, it } from 'vitest'
import { markRows } from './markRecipes'

describe('markRows', () => {
  it('reads the Courses and the cooking time, and leaves out "0 min" for a Recipe with no cooking time (a Ready Meal)', () => {
    const rows = markRows(
      [
        { id: 1, name: 'Tiramisu', totalMinutes: 30, courses: [{ id: 1, name: 'Main' }] },
        { id: 2, name: 'Frozen lasagne', totalMinutes: 0, courses: [{ id: 1, name: 'Main' }] },
        { id: 3, name: 'Panna cotta', totalMinutes: 50, courses: [] },
      ],
      new Map(),
      '',
      new Set([2]),
    )
    expect(rows.map((r) => [r.name, r.meta, r.checked])).toEqual([
      ['Tiramisu', 'Main · 30 min', false],
      ['Frozen lasagne', 'Main', true],
      ['Panna cotta', 'No Course yet · 50 min', false],
    ])
  })
})
