// B9-45 (PC-05, decision PC 6): the Ingredient list at the planned portions: the scaling, the Storage Place of the soonest Lot, the words.
import { describe, expect, it } from 'vitest'
import type { RecipeLine } from '../../recipes/types'
import { readyLabel, readyMeta, readyRows, readySections, soonestPlace, type ReadyContext, type ReadyLot, type ReadySource } from './ingredients'

const line = (ingredientId: number, ingredient: string, quantity: number, unit: string, over: Partial<RecipeLine> = {}): RecipeLine => ({
  ingredientId, ingredient, quantity, unit, optional: false, note: '', ...over,
})
const lot = (ingredientId: number, storagePlaceId: number | null, goesOff: string | null, over: Partial<ReadyLot> = {}): ReadyLot => ({
  ingredientId, storagePlaceId, goesOff, spoiled: false, quantity: 100, ...over,
})
const places = [{ id: 1, name: 'Pantry' }, { id: 2, name: 'Fridge' }, { id: 3, name: 'Fruit bowl' }]
const ctx: ReadyContext = {
  system: 'metric',
  places,
  lots: [lot(1, 2, '2026-11-12'), lot(2, 1, null), lot(3, 1, null), lot(4, 3, '2026-11-14')],
}
const roast: ReadySource = {
  recipeName: 'Roast chicken', yield: 4, batches: 1,
  lines: [line(1, 'Chicken', 1200, 'g'), line(2, 'Rice', 300, 'g'), line(3, 'Garlic', 20, 'g'), line(4, 'Lemons', 2, ''), line(5, 'Olive oil', 1, 'tbsp', { optional: true })],
}

describe('readyRows', () => {
  it('is one row per line in the Recipe\'s order: name, amount, Storage Place of the soonest Lot', () => {
    expect(readyRows(roast, ctx).map((r) => [r.name, r.amount, r.place])).toEqual([
      ['Chicken', '1.2 kg', 'Fridge'],
      ['Rice', '300 g', 'Pantry'],
      ['Garlic', '20 g', 'Pantry'],
      ['Lemons', '2', 'Fruit bowl'],
      ['Olive oil', '1 tbsp', 'optional'],
    ])
  })
  it('scales every line by the Batches cooked (the same scaling as the Steps\' "Uses" lines)', () => {
    const rows = readyRows({ ...roast, batches: 2 }, ctx)
    expect(rows.map((r) => r.amount)).toEqual(['2.4 kg', '600 g', '40 g', '4', '2 tbsp'])
  })
  it('scales by a part of a Batch too', () => {
    expect(readyRows({ ...roast, batches: 0.5 }, ctx)[1]!.amount).toBe('150 g')
  })
  it('writes metric amounts in the User\'s unit system; a tablespoon stays a tablespoon', () => {
    const rows = readyRows(roast, { ...ctx, system: 'imperial' })
    expect(rows[1]!.amount).toBe('10.6 oz')
    expect(rows[4]!.amount).toBe('1 tbsp')
  })
  it('marks an optional line and says so after the place: "Pantry · optional"', () => {
    const rows = readyRows(roast, { ...ctx, lots: [...ctx.lots, lot(5, 1, null)] })
    expect(rows[4]).toMatchObject({ optional: true, place: 'Pantry · optional' })
    expect(rows[0]!.optional).toBe(false)
  })
  it('has no place for an Ingredient with nothing in Stock', () => {
    expect(readyRows(roast, { ...ctx, lots: [] }).map((r) => r.place)).toEqual([null, null, null, null, 'optional'])
  })
  it('gives every row its own key, even with the same Ingredient twice', () => {
    const twice: ReadySource = { ...roast, lines: [line(1, 'Chicken', 600, 'g'), line(1, 'Chicken', 600, 'g')] }
    const keys = readyRows(twice, ctx).map((r) => r.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('soonestPlace', () => {
  it('is the place of the Lot that goes off first, a Lot with no date last', () => {
    const lots = [lot(1, 1, null), lot(1, 3, '2026-11-20'), lot(1, 2, '2026-11-13')]
    expect(soonestPlace(lots, 1, places)).toBe('Fridge')
  })
  it('ignores a spoiled Lot and an empty one', () => {
    const lots = [lot(1, 2, '2026-11-10', { spoiled: true }), lot(1, 3, '2026-11-11', { quantity: 0 }), lot(1, 1, '2026-11-15')]
    expect(soonestPlace(lots, 1, places)).toBe('Pantry')
  })
  it('says "Not sorted" for a Lot with no Storage Place, or one that was deleted', () => {
    expect(soonestPlace([lot(1, null, null)], 1, places)).toBe('Not sorted')
    expect(soonestPlace([lot(1, 99, null)], 1, places)).toBe('Not sorted')
  })
  it('is null without a Lot of the Ingredient', () => {
    expect(soonestPlace([lot(2, 1, null)], 1, places)).toBeNull()
  })
})

describe('readySections', () => {
  it('is one section without a title for one Recipe', () => {
    const sections = readySections([roast], ctx)
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ title: null })
    expect(sections[0]!.rows).toHaveLength(5)
  })
  it('is a section per Course, "Main · Roast chicken", for a timeline of several, and keys stay unique across them', () => {
    const side: ReadySource = { courseId: 2, courseName: 'Side', recipeName: 'Green beans', yield: 4, batches: 1, lines: [line(1, 'Chicken', 10, 'g')] }
    const sections = readySections([{ ...roast, courseId: 1, courseName: 'Main' }, side], ctx)
    expect(sections.map((s) => s.title)).toEqual(['Main · Roast chicken', 'Side · Green beans'])
    const keys = sections.flatMap((s) => s.rows.map((r) => r.key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(sections.map((s) => s.key)).size).toBe(2)
  })
  it('is empty when no line was given', () => {
    expect(readySections([{ ...roast, lines: [] }], ctx)).toEqual([])
    expect(readySections([], ctx)).toEqual([])
  })
})

describe('readyMeta and readyLabel', () => {
  it('a Planned Meal: "For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover"', () => {
    expect(readyMeta({ portions: 2.75, batches: 1, yield: 4 })).toBe('For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover')
  })
  it('says nothing is kept when the Batches are all eaten', () => {
    expect(readyMeta({ portions: 4, batches: 1, yield: 4 })).toBe('For 4 portions: 1 Batch of 4 portions')
  })
  it('several Batches', () => {
    expect(readyMeta({ portions: 6, batches: 2, yield: 4 })).toBe('For 6 portions: 2 Batches of 4 portions, 2 kept as a Leftover')
  })
  it('a Recipe cook uses its Yield: "For 8 portions: 2 Batches of 4 portions"', () => {
    expect(readyMeta({ portions: null, batches: 2, yield: 4 })).toBe('For 8 portions: 2 Batches of 4 portions')
    expect(readyMeta({ portions: null, batches: 1, yield: 4 })).toBe('For 4 portions: 1 Batch of 4 portions')
  })
  it('names a row for the checkbox: "Chicken, 1.2 kg"', () => {
    const [row] = readyRows(roast, ctx)
    expect(readyLabel(row!)).toBe('Chicken, 1.2 kg')
  })
})
