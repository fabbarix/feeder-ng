// B9-37 (RX-09): what the Tag chooser lists for a query. Chosen Tags first (with their check), then the others, each group by name; the
// "Add Tag" row is offered only while the query matches no Tag exactly (case and spacing aside, the server's tagKey).
import { describe, expect, it } from 'vitest'
import { chooserRows } from './tagChooser'

const known = [
  { name: 'spicy', recipes: 3 },
  { name: 'family', recipes: 5 },
  { name: 'quick', recipes: 2 },
  { name: 'spiced rice', recipes: 1 },
  { name: 'weekend', recipes: 4 },
]

describe('chooserRows', () => {
  it('lists every known Tag by name when the query is empty, chosen ones first', () => {
    const { rows, create } = chooserRows(known, ['weekend', 'quick'], '')
    expect(rows.map((r) => [r.name, r.chosen])).toEqual([
      ['quick', true], ['weekend', true],
      ['family', false], ['spiced rice', false], ['spicy', false],
    ])
    expect(create).toBeNull()
  })

  it('carries the Recipe count of each row', () => {
    const { rows } = chooserRows(known, [], '')
    expect(rows.find((r) => r.name === 'family')!.recipes).toBe(5)
  })

  it('filters by what is typed (case and spacing aside)', () => {
    expect(chooserRows(known, [], 'SPIC').rows.map((r) => r.name)).toEqual(['spiced rice', 'spicy'])
    expect(chooserRows(known, [], '  spiced   ri ').rows.map((r) => r.name)).toEqual(['spiced rice'])
  })

  it('offers the create row with the typed words when no Tag matches exactly', () => {
    expect(chooserRows(known, [], 'spic').create).toBe('spic')
    expect(chooserRows(known, [], '  Brand   new ').create).toBe('Brand new')
    expect(chooserRows(known, [], 'zzweekend').rows).toEqual([])
    expect(chooserRows(known, [], 'zzweekend').create).toBe('zzweekend')
  })

  it('offers no create row for an exact match, in any case or spacing', () => {
    expect(chooserRows(known, [], 'quick').create).toBeNull()
    expect(chooserRows(known, [], 'QUICK ').create).toBeNull()
    expect(chooserRows(known, [], 'Spiced  Rice').create).toBeNull()
  })

  it('a chosen Tag that no one has saved yet is listed (chosen, 0 Recipes) and counts as an exact match', () => {
    const { rows, create } = chooserRows(known, ['brand new'], 'brand new')
    expect(rows).toEqual([{ name: 'brand new', recipes: 0, chosen: true }])
    expect(create).toBeNull()
  })

  it('no create row for an empty or blank query', () => {
    expect(chooserRows(known, [], '').create).toBeNull()
    expect(chooserRows(known, [], '   ').create).toBeNull()
  })

  it('an empty Household has no rows; typing offers the create row alone', () => {
    expect(chooserRows([], [], '')).toEqual({ rows: [], create: null })
    expect(chooserRows([], [], 'weekend')).toEqual({ rows: [], create: 'weekend' })
  })

  it('matches a chosen Tag by its key, so a different spelling is one row, not two', () => {
    const { rows } = chooserRows(known, ['Quick'], '')
    expect(rows.filter((r) => r.name.toLowerCase() === 'quick')).toHaveLength(1)
    expect(rows[0]).toMatchObject({ chosen: true })
  })
})
