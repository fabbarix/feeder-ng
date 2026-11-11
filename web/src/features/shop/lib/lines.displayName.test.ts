// R2-4 S-02 (Shop part): Ingredient names are shown through displayName ("aubergine" -> "Aubergine"); data stays as stored,
// and free text the User typed is shown as typed.
import { describe, expect, it } from 'vitest'
import { extraEntry, lineEntry } from './lines'
import { makeExtra, makeLine } from '../testData'

describe('Shopping List entry titles', () => {
  it('a Line takes its title from displayName', () => {
    expect(lineEntry(makeLine({ name: 'basmati rice' }), 'USD', 'metric').title).toBe('Basmati rice')
    expect(lineEntry(makeLine({ name: 'aubergine' }), 'USD', 'metric').title).toBe('Aubergine')
  })
  it('an Ingredient extra takes its title from displayName', () => {
    expect(extraEntry(makeExtra({ text: null, ingredientId: 3, name: 'olive oil', baseUnit: 'ml', quantity: 500 }), 'metric').title).toBe('Olive oil')
  })
  it('a free-text extra is shown exactly as typed', () => {
    expect(extraEntry(makeExtra({ text: 'toilet paper' }), 'metric').title).toBe('toilet paper')
  })
  it('the stored name is not changed (ingredientId and keys stay)', () => {
    expect(lineEntry(makeLine({ ingredientId: 5, name: 'aubergine' }), 'USD', 'metric')).toMatchObject({ key: 'line:5', ingredientId: 5 })
  })
})
