// The Add… seam's mapping (design 3.4): the new-Product sheet's values to the AddDraft, and back to what the sheet opens with.
import { describe, expect, it } from 'vitest'
import { emptyForm, type UnknownFormValues } from '../../scan/lib/unknownForm'
import { add0, proposal } from '../fixtures.test-helper'
import { draftFromValues, initialFromAdd } from './addDraft'

const values = (over: Partial<UnknownFormValues>): UnknownFormValues => ({ ...emptyForm(), ...over })
const choices = [{ id: 31, name: 'Bread', baseUnit: 'g' as const }, { id: 40, name: 'Kitchen roll', baseUnit: 'piece' as const, kind: 'supply' as const }]

describe('draftFromValues', () => {
  it('an existing Ingredient goes by id; the pack size is in Base Units', () => {
    expect(draftFromValues(values({ ingredient: choices[0], packSize: '0.45', packUnit: 'kg', productName: ' Pane casereccio ', scope: 'global' }))).toEqual({
      ingredient: { id: 31 },
      productName: 'Pane casereccio',
      packSize: 450,
      scope: 'global',
    })
  })
  it('a new Ingredient or Supply goes by name, Base Unit and kind (food when none)', () => {
    expect(draftFromValues(values({ ingredient: { name: ' Rye bread ', baseUnit: 'g' }, packSize: '500', packUnit: 'g', productName: 'Rye bread 500 g' })).ingredient).toEqual({ name: 'Rye bread', baseUnit: 'g', kind: 'food' })
    expect(draftFromValues(values({ ingredient: { name: 'Sponges', baseUnit: 'piece', kind: 'supply' }, packSize: '3', packUnit: 'piece', productName: 'Sponges 3', scope: 'shop' }))).toEqual({
      ingredient: { name: 'Sponges', baseUnit: 'piece', kind: 'supply' },
      productName: 'Sponges 3',
      packSize: 3,
      scope: 'shop',
    })
  })
  it('a pack size in ounces is rounded to whole grams; none is 0 (the review then asks for it)', () => {
    expect(draftFromValues(values({ ingredient: choices[0], packSize: '16', packUnit: 'oz', productName: 'x' })).packSize).toBe(454)
    expect(draftFromValues(values({ ingredient: null, productName: '' }))).toMatchObject({ ingredient: null, packSize: 0 })
  })
})

describe('initialFromAdd', () => {
  it('a new Add opens with the receipt line\'s name and its weight in grams', () => {
    expect(initialFromAdd(add0, undefined, choices)).toEqual({ productName: 'Pane casereccio', packSize: 450, packUnit: 'g' })
  })
  it('a pack size on the line wins over a weight', () => {
    const p = proposal({ id: 'add:2', kind: 'add', needsInput: true, after: { name: 'Eggs', packSize: 6, packUnit: 'piece' } })
    expect(initialFromAdd(p, undefined, choices)).toEqual({ productName: 'Eggs', packSize: 6, packUnit: 'piece' })
  })
  it('an Add edited again opens on its saved choices, the Ingredient found among the choices', () => {
    expect(initialFromAdd(add0, { ingredient: { id: 40 }, productName: 'Kitchen roll 4', packSize: 4, scope: 'shop' }, choices)).toEqual({
      ingredient: choices[1],
      productName: 'Kitchen roll 4',
      packSize: 4,
      packUnit: 'piece',
      scope: 'shop',
    })
    expect(initialFromAdd(add0, { ingredient: { name: 'Rye', baseUnit: 'g', kind: 'food' }, productName: 'Rye 500 g', packSize: 500 }, choices).ingredient).toEqual({ name: 'Rye', baseUnit: 'g', kind: 'food' })
  })
})
