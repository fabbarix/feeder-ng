import { describe, expect, it } from 'vitest'
import { checkMoveQuantity, lotMoveNote, moveNote } from './move'

const pantry = { id: 1, name: 'Kitchen Pantry', kind: 'pantry' as const, default: true }
const fridge = { id: 2, name: 'Garage Fridge', kind: 'fridge' as const, default: false }
const freezer = { id: 3, name: 'Garage Freezer', kind: 'freezer' as const, default: false }
const deep = { id: 4, name: 'Chest Freezer', kind: 'freezer' as const, default: false }

describe('moveNote', () => {
  it('says the frozen Shelf Life starts going in, and the ordinary one coming out', () => {
    expect(moveNote(fridge, freezer)).toBe('freezer')
    expect(moveNote(null, freezer)).toBe('freezer')
    expect(moveNote(freezer, pantry)).toBe('thaw')
    expect(moveNote(freezer, deep)).toBeNull()
    expect(moveNote(pantry, fridge)).toBeNull()
    expect(moveNote(fridge, null)).toBeNull()
  })
})

describe('checkMoveQuantity', () => {
  const lot = { quantity: 1000 }
  it('moves all of it when blank or the whole quantity', () => {
    expect(checkMoveQuantity('', lot)).toEqual({ ok: true, quantity: undefined })
    expect(checkMoveQuantity('1000', lot)).toEqual({ ok: true, quantity: undefined })
  })
  it('moves part of it', () => {
    expect(checkMoveQuantity('400', lot)).toEqual({ ok: true, quantity: 400 })
    expect(checkMoveQuantity('2,5', { quantity: 3 })).toEqual({ ok: true, quantity: 2.5 })
  })
  it('refuses more than the Lot holds, zero and nonsense', () => {
    expect(checkMoveQuantity('1001', lot)).toEqual({ ok: false, error: 'tooMuch' })
    expect(checkMoveQuantity('0', lot)).toMatchObject({ ok: false })
    expect(checkMoveQuantity('lots', lot)).toMatchObject({ ok: false })
  })
})

describe('lotMoveNote', () => {
  it('a Supply never goes off: a Freezer move has no note; food keeps the note', () => {
    expect(lotMoveNote({ kind: 'supply' }, pantry, freezer)).toBeNull()
    expect(lotMoveNote({ kind: 'supply' }, freezer, pantry)).toBeNull()
    expect(lotMoveNote({ kind: 'food' }, fridge, freezer)).toBe('freezer')
    expect(lotMoveNote({}, freezer, fridge)).toBe('thaw')
  })
})
