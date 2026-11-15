// B9-48 (SET-05): the pure rules of the "Keeping" tile: one draft of Base Unit, Shelf Life, Frozen Shelf Life and Restock level,
// dirty after one change, one PATCH body with only what changed, the row hints.
//
// API pinned here (lib/keeping.ts, plain TypeScript, no React):
//   KeepingDraft = { baseUnit: BaseUnit; shelfLifeDays: number | null; frozenShelfLifeDays: number | null; restockText: string }
//     restockText is what the field shows (lib/kind restockText): '' for none, the Base Unit amount otherwise.
//   keepingDraft(saved: Ingredient): KeepingDraft
//   isKeepingDirty(saved: Ingredient, draft: KeepingDraft): boolean
//   keepingPatch(saved: Ingredient, draft: KeepingDraft): IngredientPatch   only the fields that changed; a cleared value is null;
//     a food Ingredient never sends restockLevel, a Supply never sends shelfLifeDays or frozenShelfLifeDays (the kind is saved.kind, food when absent)
//   validateKeeping(draft: KeepingDraft, kind: IngredientKind): KeepingErrors   {} when valid;
//     { shelfLife?: string; frozenShelfLife?: string; restock?: string }: days must be whole, 1 to 3650 ("Enter a whole number of days, 1 to 3650");
//     a Restock level text must pass lib/kind parseRestockText ("Enter an amount greater than 0"); only the kind's own fields are checked
//   shelfLifeHint(variant: 'shelfLife' | 'frozen', saved: number | null, draft: number | null): string | undefined
//   baseUnitHint(referenceCount: number): string | undefined
import { describe, expect, it } from 'vitest'
import { baseUnitHint, isKeepingDirty, keepingDraft, keepingPatch, shelfLifeHint, validateKeeping } from './keeping'
import { dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { Ingredient } from '../types'

const flour: Ingredient = { id: 3, name: 'flour', baseUnit: 'g', shelfLifeDays: 7, frozenShelfLifeDays: null, conversions: [], kind: 'food', restockLevel: null }

describe('keepingDraft', () => {
  it('copies what is saved; the Restock level is the field text', () => {
    expect(keepingDraft(flour)).toEqual({ baseUnit: 'g', shelfLifeDays: 7, frozenShelfLifeDays: null, restockText: '' })
    expect(keepingDraft(dishSoapJSON)).toEqual({ baseUnit: 'ml', shelfLifeDays: null, frozenShelfLifeDays: null, restockText: '500' })
  })
  it('reads a missing frozen Shelf Life (older fixtures) as none', () => {
    const { frozenShelfLifeDays: _drop, ...older } = flour
    expect(keepingDraft(older).frozenShelfLifeDays).toBeNull()
  })
})

describe('isKeepingDirty', () => {
  it('is clean right after keepingDraft', () => {
    expect(isKeepingDirty(flour, keepingDraft(flour))).toBe(false)
  })
  it('is dirty after one change to any field', () => {
    expect(isKeepingDirty(flour, { ...keepingDraft(flour), shelfLifeDays: 10 })).toBe(true)
    expect(isKeepingDirty(flour, { ...keepingDraft(flour), shelfLifeDays: null })).toBe(true)
    expect(isKeepingDirty(flour, { ...keepingDraft(flour), frozenShelfLifeDays: 90 })).toBe(true)
    expect(isKeepingDirty(flour, { ...keepingDraft(flour), baseUnit: 'ml' })).toBe(true)
    expect(isKeepingDirty(dishSoapJSON, { ...keepingDraft(dishSoapJSON), restockText: '750' })).toBe(true)
  })
  it('a Restock level typed the same way another way is not a change ("500.0", " 500 ", "500,0")', () => {
    for (const text of ['500.0', ' 500 ', '500,0']) expect(isKeepingDirty(dishSoapJSON, { ...keepingDraft(dishSoapJSON), restockText: text })).toBe(false)
  })
  it('putting a value back is clean again', () => {
    const d = { ...keepingDraft(flour), shelfLifeDays: 10 }
    expect(isKeepingDirty(flour, { ...d, shelfLifeDays: 7 })).toBe(false)
  })
})

describe('keepingPatch: one PATCH body, only what changed', () => {
  it('both Shelf Lives at once', () => {
    expect(keepingPatch(flour, { ...keepingDraft(flour), shelfLifeDays: 10, frozenShelfLifeDays: 90 })).toEqual({ shelfLifeDays: 10, frozenShelfLifeDays: 90 })
  })
  it('a cleared value is null', () => {
    expect(keepingPatch(flour, { ...keepingDraft(flour), shelfLifeDays: null })).toEqual({ shelfLifeDays: null })
  })
  it('an unchanged draft is an empty body', () => {
    expect(keepingPatch(flour, keepingDraft(flour))).toEqual({})
  })
  it('the Base Unit goes in the same body', () => {
    expect(keepingPatch(flour, { ...keepingDraft(flour), baseUnit: 'ml', shelfLifeDays: 8 })).toEqual({ baseUnit: 'ml', shelfLifeDays: 8 })
  })
  it('a Supply: the Restock level as a number in Base Units, null when emptied, a comma read as a point', () => {
    expect(keepingPatch(dishSoapJSON, { ...keepingDraft(dishSoapJSON), restockText: '750' })).toEqual({ restockLevel: 750 })
    expect(keepingPatch(dishSoapJSON, { ...keepingDraft(dishSoapJSON), restockText: '' })).toEqual({ restockLevel: null })
    expect(keepingPatch(dishSoapJSON, { ...keepingDraft(dishSoapJSON), restockText: '0,5' })).toEqual({ restockLevel: 0.5 })
  })
  it('food never sends a Restock level and a Supply never sends a Shelf Life', () => {
    expect(keepingPatch(garlicJSON, { ...keepingDraft(garlicJSON), restockText: '9' })).toEqual({})
    expect(keepingPatch(dishSoapJSON, { ...keepingDraft(dishSoapJSON), shelfLifeDays: 3, frozenShelfLifeDays: 4 })).toEqual({})
  })
})

describe('validateKeeping', () => {
  const ok = keepingDraft(flour)
  it('a saved Ingredient is valid', () => {
    expect(validateKeeping(ok, 'food')).toEqual({})
    expect(validateKeeping(keepingDraft(dishSoapJSON), 'supply')).toEqual({})
  })
  it('days outside 1 to 3650 or not whole name the field', () => {
    expect(validateKeeping({ ...ok, shelfLifeDays: 0 }, 'food').shelfLife).toBe('Enter a whole number of days, 1 to 3650')
    expect(validateKeeping({ ...ok, shelfLifeDays: 3651 }, 'food').shelfLife).toBe('Enter a whole number of days, 1 to 3650')
    expect(validateKeeping({ ...ok, frozenShelfLifeDays: 2.5 }, 'food').frozenShelfLife).toBe('Enter a whole number of days, 1 to 3650')
    expect(validateKeeping({ ...ok, shelfLifeDays: 3650, frozenShelfLifeDays: 1 }, 'food')).toEqual({})
  })
  it('a Restock level must be above 0', () => {
    const d = keepingDraft(dishSoapJSON)
    expect(validateKeeping({ ...d, restockText: '0' }, 'supply').restock).toBe('Enter an amount greater than 0')
    expect(validateKeeping({ ...d, restockText: 'abc' }, 'supply').restock).toBe('Enter an amount greater than 0')
    expect(validateKeeping({ ...d, restockText: '' }, 'supply')).toEqual({})
  })
  it('checks only the fields of its kind', () => {
    expect(validateKeeping({ ...ok, restockText: 'abc' }, 'food')).toEqual({})
    expect(validateKeeping({ ...keepingDraft(dishSoapJSON), shelfLifeDays: 0 }, 'supply')).toEqual({})
  })
})

describe('row hints', () => {
  it('Shelf Life: nothing while saved and set; "No Shelf Life" while none; "Changed from 7 days" while dirty', () => {
    expect(shelfLifeHint('shelfLife', 7, 7)).toBeUndefined()
    expect(shelfLifeHint('shelfLife', null, null)).toBe('No Shelf Life')
    expect(shelfLifeHint('shelfLife', 7, 10)).toBe('Changed from 7 days')
    expect(shelfLifeHint('shelfLife', 1, 2)).toBe('Changed from 1 day')
    expect(shelfLifeHint('shelfLife', 7, null)).toBe('Changed from 7 days')
    expect(shelfLifeHint('shelfLife', null, 5)).toBe('Changed from not set')
  })
  it('Frozen Shelf Life: the Freezer line while none; the existing explanation while set; "Changed from ..." while dirty', () => {
    expect(shelfLifeHint('frozen', null, null)).toBe('Not set: moving a Stock Lot into a Freezer does not change when it goes off')
    expect(shelfLifeHint('frozen', 90, 90)).toBe('How long it keeps in a Freezer. A Stock Lot moved into one is good for this long from that day.')
    expect(shelfLifeHint('frozen', 90, 60)).toBe('Changed from 90 days')
    expect(shelfLifeHint('frozen', null, 30)).toBe('Changed from not set')
  })
  it('Base Unit: only a referenced Ingredient has a hint', () => {
    expect(baseUnitHint(0)).toBeUndefined()
    expect(baseUnitHint(4)).toBe("Used in 4 places, so it can't change")
    expect(baseUnitHint(1)).toBe("Used in 1 place, so it can't change")
  })
})
