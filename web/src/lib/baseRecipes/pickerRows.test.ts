import { describe, expect, it } from 'vitest'
import { pickerRows, type PickerInput } from './pickerRows'
import type { PickerBaseRecipe, PickerPlannable } from './types'

const base = (id: number, name: string, over: Partial<PickerBaseRecipe> = {}): PickerBaseRecipe => ({ id, name, yield: 1, yieldUnit: 'l', archived: false, ...over })
const plan = (id: number, name: string, over: Partial<PickerPlannable> = {}): PickerPlannable => ({ id, name, archived: false, yield: 4, ...over })
const input = (over: Partial<PickerInput> = {}): PickerInput => ({
  query: '', lineName: 'béchamel',
  baseRecipes: [base(1, 'Roux', { yield: 300, yieldUnit: 'g' }), base(2, 'Béchamel'), base(3, 'Béchamel light'), base(4, 'Pasta frolla', { yield: 8, yieldUnit: 'portion' })],
  plannable: [plan(10, 'Pesto'), plan(11, 'Lasagne')],
  ...over,
})
const ids = (rows: { kind: string; id?: number }[]) => rows.map((r) => ('id' in r ? r.id : undefined))

describe('pickerRows: Base recipes, name matches first (design §3.7)', () => {
  it('with nothing typed lists every Base recipe, the line name ranking exact, then close, then the rest by name', () => {
    expect(ids(pickerRows(input()).base)).toEqual([2, 3, 4, 1])
  })
  it('marks the exact match so the sheet can preselect it', () => {
    const rows = pickerRows(input()).base
    expect(rows[0]).toMatchObject({ kind: 'base', id: 2, exact: true })
    expect(rows[1]).toMatchObject({ id: 3, exact: false })
  })
  it('treats case, accents and a trailing plural as the same name', () => {
    expect(pickerRows(input({ lineName: 'BECHAMELS' })).base[0]).toMatchObject({ id: 2, exact: true })
  })
  it('filters by the typed query (contains, accents folded) and ranks the query, not the line', () => {
    const rows = pickerRows(input({ query: 'roux' })).base
    expect(ids(rows)).toEqual([1])
    expect(ids(pickerRows(input({ query: 'bech' })).base)).toEqual([2, 3])
  })
  it('says the Yield on each row ("Yield 1 l", "Yield 300 g", "Yield 8 portion")', () => {
    const rows = pickerRows(input()).base
    expect(rows.find((r) => r.kind === 'base' && r.id === 2)).toMatchObject({ detail: 'Yield 1 l' })
    expect(rows.find((r) => r.kind === 'base' && r.id === 1)).toMatchObject({ detail: 'Yield 300 g' })
  })
  it('leaves out archived Base recipes and the Recipe being edited', () => {
    const rows = pickerRows(input({ baseRecipes: [base(1, 'Roux'), base(2, 'Béchamel', { archived: true }), base(3, 'Stock')], selfId: 1 }))
    expect(ids(rows.base)).toEqual([3])
  })
  it('lists a blocked Base recipe disabled with its reason (a cycle), still in order', () => {
    const rows = pickerRows(input({ blocked: { 2: 'Béchamel already calls for this Recipe' } })).base
    expect(rows[0]).toMatchObject({ id: 2, disabled: true, reason: 'Béchamel already calls for this Recipe' })
    expect(rows[1]).toMatchObject({ id: 3, disabled: false })
  })
})

describe('pickerRows: create new Base recipe', () => {
  it('offers "Add "Béchamel" as a new Base recipe" named from the line when nothing is typed and no Base recipe has that exact name', () => {
    const rows = pickerRows(input({ lineName: 'ragù', baseRecipes: [base(1, 'Roux')] }))
    expect(rows.create).toEqual({ kind: 'new', name: 'Ragù', label: 'Add "Ragù" as a new Base recipe' })
  })
  it('is named from the typed query once there is one', () => {
    expect(pickerRows(input({ query: 'white sauce' })).create).toMatchObject({ name: 'White sauce', label: 'Add "White sauce" as a new Base recipe' })
  })
  it('is absent when a Base recipe already has exactly that name (key compare), archived ones included', () => {
    expect(pickerRows(input()).create).toBeNull()
    expect(pickerRows(input({ baseRecipes: [base(2, 'Béchamel', { archived: true })] })).create).toBeNull()
  })
  it('is absent when there is neither a query nor a line name', () => {
    expect(pickerRows(input({ lineName: '  ' })).create).toBeNull()
  })
})

describe('pickerRows: Recipes you plan', () => {
  it('lists the plannable Recipes whose name contains the query, by name', () => {
    expect(ids(pickerRows(input({ query: 'a' })).plannable)).toEqual([11])
  })
  it('with nothing typed lists the ones that contain the line name; none for an unrelated line', () => {
    expect(pickerRows(input()).plannable).toEqual([])
    expect(ids(pickerRows(input({ lineName: 'pesto' })).plannable)).toEqual([10])
  })
  it('leaves out archived Recipes and the Recipe itself, and disables a blocked one with its reason', () => {
    const rows = pickerRows(input({ query: 'a', plannable: [plan(11, 'Lasagne'), plan(12, 'Pasta', { archived: true }), plan(13, 'Paella')], selfId: 13, blocked: { 11: 'Lasagne already calls for this Recipe' } }))
    expect(rows.plannable).toEqual([{ kind: 'plannable', id: 11, name: 'Lasagne', disabled: true, reason: 'Lasagne already calls for this Recipe' }])
  })
})
