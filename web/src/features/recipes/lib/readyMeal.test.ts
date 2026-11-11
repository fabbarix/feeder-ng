import { describe, expect, it } from 'vitest'
import { flour, garlic, recipe } from '../fixtures.test-helper'
import { emptyDraft, type LineDraft, type RecipeDraft } from './draft'
import { nameKey, readyMealLine, renameOffer, syncReadyMealLine } from './readyMeal'
import type { IngredientRef } from '../types'

const pack: IngredientRef = { id: 21, name: 'Lasagne pack', baseUnit: 'piece', conversions: [] }
const pasta: IngredientRef = { id: 22, name: 'pasta', baseUnit: 'g', conversions: [] }
const known = [garlic, flour, pack, pasta]

const blank = (over: Partial<LineDraft> = {}): LineDraft => ({ key: 'b', ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '', ...over })
const draftOf = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), readyMeal: true, name: 'Lasagne pack', ...over })

describe('nameKey', () => {
  it('lower-cases, trims and collapses whitespace like units.NormalizeName', () => {
    expect(nameKey('  Lasagne   PACK ')).toBe('lasagne pack')
  })
})

describe('readyMealLine', () => {
  it('does nothing for a blank name', () => {
    expect(readyMealLine('   ', known)).toEqual({ kind: 'none' })
  })
  it('reuses the same-name Ingredient ignoring case and spacing: 1 piece', () => {
    expect(readyMealLine('  lasagne   PACK', known)).toEqual({ kind: 'reuse', ingredient: pack, quantity: '1', unit: 'piece' })
  })
  it('reuses a weighed Ingredient but leaves the pack size to the User', () => {
    expect(readyMealLine('Pasta', known)).toEqual({ kind: 'reuse', ingredient: pasta, quantity: '', unit: 'g' })
  })
  it('creates a piece Ingredient named like the Recipe when none exists', () => {
    expect(readyMealLine('  Fish   pie pack ', known)).toEqual({ kind: 'create', name: 'Fish pie pack', quantity: '1', unit: 'piece' })
  })
})

describe('syncReadyMealLine', () => {
  it('makes the pending line for a new name', () => {
    const next = syncReadyMealLine(draftOf({ name: 'Fish pie pack' }), known)
    expect(next.lines).toHaveLength(1)
    expect(next.lines[0]).toMatchObject({ ingredientId: null, ingredientName: 'Fish pie pack', quantity: '1', unit: 'piece', auto: true, optional: false, note: '' })
  })
  it('selects the existing Ingredient instead, without a duplicate', () => {
    const next = syncReadyMealLine(draftOf(), known)
    expect(next.lines).toHaveLength(1)
    expect(next.lines[0]).toMatchObject({ ingredientId: 21, ingredientName: 'Lasagne pack', quantity: '1', unit: 'piece', auto: true })
  })
  it('replaces a blank line rather than adding a second one', () => {
    const next = syncReadyMealLine(draftOf({ lines: [blank()] }), known)
    expect(next.lines).toHaveLength(1)
    expect(next.lines[0]).toMatchObject({ ingredientId: 21, auto: true })
  })
  it('follows the name while the line is automatic: pending, then reuse, then pending again', () => {
    let d = syncReadyMealLine(draftOf({ name: 'Lasagn' }), known)
    expect(d.lines[0]).toMatchObject({ ingredientId: null, ingredientName: 'Lasagn' })
    d = syncReadyMealLine({ ...d, name: 'Lasagne pack' }, known)
    expect(d.lines[0]).toMatchObject({ ingredientId: 21, ingredientName: 'Lasagne pack' })
    d = syncReadyMealLine({ ...d, name: 'Lasagne tray' }, known)
    expect(d.lines[0]).toMatchObject({ ingredientId: null, ingredientName: 'Lasagne tray' })
    expect(d.lines).toHaveLength(1)
  })
  it('keeps the line key stable while it follows the name', () => {
    const first = syncReadyMealLine(draftOf({ name: 'Lasagn' }), known)
    const second = syncReadyMealLine({ ...first, name: 'Lasagne pack' }, known)
    expect(second.lines[0]!.key).toBe(first.lines[0]!.key)
  })
  it('removes the automatic line when the name is cleared', () => {
    const d = syncReadyMealLine(draftOf(), known)
    expect(syncReadyMealLine({ ...d, name: '  ' }, known).lines).toEqual([])
  })
  it('adds nothing for a blank name', () => {
    expect(syncReadyMealLine(draftOf({ name: '' }), known).lines).toEqual([])
  })
  it("leaves the User's own line alone", () => {
    const own = blank({ key: 'own', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove' })
    const d = draftOf({ lines: [own] })
    expect(syncReadyMealLine(d, known)).toBe(d)
  })
  it('does not touch a draft that is not a Ready Meal', () => {
    const d = draftOf({ readyMeal: false })
    expect(syncReadyMealLine(d, known)).toBe(d)
  })
  it('returns the same draft when nothing changes', () => {
    const once = syncReadyMealLine(draftOf(), known)
    expect(syncReadyMealLine(once, known)).toBe(once)
  })
  describe('unmarking', () => {
    it('drops a pending line (nothing exists to keep)', () => {
      const d = syncReadyMealLine(draftOf({ name: 'Fish pie pack' }), known)
      expect(syncReadyMealLine({ ...d, readyMeal: false }, known).lines).toEqual([])
    })
    it('keeps a selected Ingredient as an ordinary, editable line', () => {
      const d = syncReadyMealLine(draftOf(), known)
      const off = syncReadyMealLine({ ...d, readyMeal: false }, known)
      expect(off.lines).toHaveLength(1)
      expect(off.lines[0]).toMatchObject({ ingredientId: 21, quantity: '1', unit: 'piece' })
      expect(off.lines[0]!.auto).toBeFalsy()
    })
    it('and re-marking does not turn that kept line back into an automatic one', () => {
      const d = syncReadyMealLine(draftOf(), known)
      const off = syncReadyMealLine({ ...d, readyMeal: false }, known)
      const back = syncReadyMealLine({ ...off, readyMeal: true, name: 'Something else' }, known)
      expect(back.lines).toHaveLength(1)
      expect(back.lines[0]).toMatchObject({ ingredientId: 21 })
    })
  })
})

describe('renameOffer', () => {
  const stored = recipe({
    name: 'Lasagne pack', readyMeal: true,
    lines: [{ ingredientId: 21, ingredient: 'Lasagne pack', quantity: 1, unit: 'piece', optional: false, note: '' }],
    steps: [],
  })
  const renamed = (name: string, over: Partial<RecipeDraft> = {}) => draftOf({ name, ...over })

  it('offers to rename the linked Ingredient to the new Recipe name', () => {
    expect(renameOffer(stored, renamed('  Big   lasagne pack '), known)).toEqual({ ingredientId: 21, from: 'Lasagne pack', to: 'Big lasagne pack' })
  })
  it('does not offer when only the case or spacing changed', () => {
    expect(renameOffer(stored, renamed('LASAGNE  pack'), known)).toBeNull()
  })
  it('does not offer for a new Recipe, a normal Recipe or one unmarked in the draft', () => {
    expect(renameOffer(undefined, renamed('Big lasagne pack'), known)).toBeNull()
    expect(renameOffer({ ...stored, readyMeal: false }, renamed('Big lasagne pack'), known)).toBeNull()
    expect(renameOffer(stored, renamed('Big lasagne pack', { readyMeal: false }), known)).toBeNull()
  })
  it('does not offer when the Ingredient was never named after the Recipe', () => {
    const odd = { ...stored, lines: [{ ...stored.lines[0]!, ingredient: 'lasagne tray' }] }
    expect(renameOffer(odd, renamed('Big lasagne pack'), known)).toBeNull()
  })
  it('does not offer when another Ingredient already has the new name (it would clash)', () => {
    expect(renameOffer(stored, renamed('Pasta'), known)).toBeNull()
  })
  it('does not offer for more than one line', () => {
    const two = { ...stored, lines: [...stored.lines, { ...stored.lines[0]!, ingredientId: 8, ingredient: 'flour' }] }
    expect(renameOffer(two, renamed('Big lasagne pack'), known)).toBeNull()
  })
})
