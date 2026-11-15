// B9-48 (SAFE-02; B9-06 backend): what Delete Ingredient / Delete Supply and Merge show of an Ingredient's impact, as rows (R-E), never sentences.
// GET /api/ingredients/{id}/impact answers { references: { <mover name>: n }, total: n } (the same map the detail serves).
//
// API pinned here (lib/impact.ts, plain TypeScript):
//   impactRows(references: Record<string, number>): ConfirmRow[]     { key, state } per mover with a count above 0, the biggest-first order
//     of the server is not kept: fixed order below; a mover this build does not know is shown as its own name with the first letter capitalised
//     labels: "recipe lines" -> "Recipe lines", "products" -> "Products", "stock lots" -> "Stock Lots", "shopping list" -> "Shopping List",
//             "ingredient exclusions" -> "Exclusions", "scan events" -> "Scans", "bought Planned Meals" -> "Bought Planned Meals"
//     order: Recipe lines, Products, Stock Lots, Shopping List, Exclusions, Scans, Bought Planned Meals, then unknown ones by name
//     state = the count as text ("3")
//   deleteConfirm(kind: IngredientKind, name: string, impact: { references: Record<string, number>; total: number } | undefined): ConfirmOptions
//   mergeMovesGroup(targetName: string, sourceReferences: Record<string, number>): ConfirmGroup | null   null when nothing moves
import { describe, expect, it } from 'vitest'
import { deleteConfirm, impactRows, mergeMovesGroup } from './impact'

describe('impactRows', () => {
  it('one row per mover with a count, the count as the state', () => {
    expect(impactRows({ products: 2, 'recipe lines': 3 })).toEqual([
      { key: 'Recipe lines', state: '3' },
      { key: 'Products', state: '2' },
    ])
  })
  it('leaves out zero counts and says nothing for an empty map', () => {
    expect(impactRows({ products: 0 })).toEqual([])
    expect(impactRows({})).toEqual([])
  })
  it('names every known mover in the Household words (GLOSSARY terms)', () => {
    const rows = impactRows({ 'stock lots': 1, 'shopping list': 1, 'ingredient exclusions': 1, 'scan events': 1, 'bought Planned Meals': 1 })
    expect(rows.map((r) => r.key)).toEqual(['Stock Lots', 'Shopping List', 'Exclusions', 'Scans', 'Bought Planned Meals'])
  })
  it('shows an unknown mover under its own name, capitalised, after the known ones', () => {
    expect(impactRows({ 'gift cards': 2, products: 1 }).map((r) => r.key)).toEqual(['Products', 'Gift cards'])
  })
})

describe('deleteConfirm: Delete Ingredient and Delete Supply are a confirm only (SAFE-02)', () => {
  const none = { references: {}, total: 0 }
  it('an Ingredient on nothing: the title names it, the lead says so, the note says it cannot be undone', () => {
    expect(deleteConfirm('food', 'temp ingredient', none)).toMatchObject({
      title: 'Delete Temp ingredient?',
      body: 'It is on no Recipe, Product or Shopping List.',
      note: "Nothing else changes. This can't be undone.",
      confirmLabel: 'Delete Ingredient',
      tone: 'danger',
    })
  })
  it('a Supply says Supply on the button', () => {
    expect(deleteConfirm('supply', 'toilet paper', none)).toMatchObject({ title: 'Delete Toilet paper?', confirmLabel: 'Delete Supply' })
  })
  it('no groups when nothing refers to it', () => {
    expect(deleteConfirm('food', 'x', none).groups ?? []).toEqual([])
  })
  it('when the read finds it in use (it changed since the page loaded): a "Used by" group of rows, and no "on no Recipe" lead', () => {
    const o = deleteConfirm('food', 'passata', { references: { products: 2, 'recipe lines': 1 }, total: 3 })
    expect(o.groups).toEqual([{ label: 'Used by', rows: [{ key: 'Recipe lines', state: '1' }, { key: 'Products', state: '2' }] }])
    expect(o.body).not.toBe('It is on no Recipe, Product or Shopping List.')
    expect(o.body).toBe('It is used in 3 places.')
  })
  // User decision (B9-48): a still-used Ingredient cannot be deleted, so the dialog explains and offers only Close and the way
  // forward, Merge; no Delete button that would just be refused.
  // Batch w3e ruling: the still-used dialog is titled "<Name> is still used", not "Delete <Name>?".
  it('when it is still used: Close and "Merge into another Ingredient" (Supply: "...Supply"), no Delete, not the danger tone', () => {
    const used = { references: { products: 2 }, total: 2 }
    expect(deleteConfirm('food', 'passata', used)).toMatchObject({ title: 'Passata is still used', cancelLabel: 'Close', confirmLabel: 'Merge into another Ingredient', tone: 'default' })
    expect(deleteConfirm('supply', 'soap', used)).toMatchObject({ confirmLabel: 'Merge into another Supply' })
    expect(deleteConfirm('food', 'passata', used).note).not.toMatch(/can't be undone/)
  })
  it('while the read has not come back: no claim about its use, and still the note', () => {
    const o = deleteConfirm('food', 'x', undefined)
    expect(o.body).toBeUndefined()
    expect(o.groups ?? []).toEqual([])
    expect(o.note).toBe("Nothing else changes. This can't be undone.")
  })
})

describe('mergeMovesGroup: what moves to the Ingredient that is kept', () => {
  it('a group named for the target, rows by mover', () => {
    expect(mergeMovesGroup('tomato puree', { 'recipe lines': 3, products: 1 })).toEqual({
      label: 'Moves to Tomato puree',
      rows: [{ key: 'Recipe lines', state: '3' }, { key: 'Products', state: '1' }],
    })
  })
  it('null when nothing moves', () => {
    expect(mergeMovesGroup('tomato puree', {})).toBeNull()
  })
})
