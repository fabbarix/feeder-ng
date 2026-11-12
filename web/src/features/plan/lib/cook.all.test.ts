// CRS F review (spec 8): the sentences for the outcome of Mark all Cooked (POST .../all/cooked), the same words as the
// single Course's (cookedSuccessText, leftoverOutcomeText). 2026-11-12 is a Thursday, 2026-11-13 a Friday.
import { describe, expect, it } from 'vitest'
import { allCookedResult } from '../test-utils'
import { cookedAllOutcomes, cookedAllOutcomeText, cookedAllSuccessText, cookedSuccessText } from './cook'

const one = () => {
  const r = allCookedResult()
  return { ...r, leftovers: [r.leftovers[0]!] }
}

describe('cookedAllOutcomes: one outcome per recorded Leftover', () => {
  it('matches each Leftover to the meals planned for it by its Course', () => {
    expect(cookedAllOutcomes(allCookedResult())).toEqual([
      { kind: 'planned', portions: 2, useBy: '2026-11-13', meals: [{ date: '2026-11-12', mealSlotName: 'Lunch', recipeName: 'Roast chicken' }] },
      { kind: 'kept', portions: 1, useBy: '2026-11-13' },
    ])
  })

  it('with one Leftover every planned meal is its own, even without a courseId on it', () => {
    const r = one()
    const plannedFor = r.plannedFor.map(({ courseId: _c, ...m }) => m)
    expect(cookedAllOutcomes({ ...r, plannedFor })).toEqual([
      { kind: 'planned', portions: 2, useBy: '2026-11-13', meals: [{ date: '2026-11-12', mealSlotName: 'Lunch', recipeName: 'Roast chicken' }] },
    ])
  })

  it('no Leftover recorded: none', () => {
    expect(cookedAllOutcomes(allCookedResult({ leftovers: [], plannedFor: [] }))).toEqual([])
  })
})

describe('cookedAllOutcomeText: the sentence of the confirmation', () => {
  it('no Leftovers', () => {
    expect(cookedAllOutcomeText(allCookedResult({ leftovers: [], plannedFor: [] }))).toBe('No Leftovers')
  })

  it('one Leftover: the same sentence as for a single Course, no Recipe name', () => {
    expect(cookedAllOutcomeText(one())).toBe('2 portions planned for Thu Lunch')
  })

  it('several Leftovers: each sentence is named by its Recipe', () => {
    expect(cookedAllOutcomeText(allCookedResult())).toBe('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept, good until Fri')
  })
})

describe('cookedAllSuccessText: the toast', () => {
  it('no Leftover: just the cheer', () => {
    expect(cookedAllSuccessText(allCookedResult({ leftovers: [], plannedFor: [] }))).toBe('Cooked, nice one!')
  })

  it('one Leftover: exactly the single Course\'s toast', () => {
    const r = one()
    const single = cookedSuccessText({
      meal: { ...r.leftovers[0]!, date: '', mealSlotId: 0 } as never,
      leftover: r.leftovers[0]!,
      warnings: [],
      plannedFor: r.plannedFor,
    })
    expect(single).toBe('Cooked, nice one! 2 portions → Thu Lunch')
    expect(cookedAllSuccessText(r)).toBe(single)
  })

  it('several Leftovers: each part named by its Recipe, separated by a semicolon', () => {
    expect(cookedAllSuccessText(allCookedResult())).toBe('Cooked, nice one! Roast chicken: 2 portions → Thu Lunch; Green beans: 1 portion kept, good until Fri')
  })
})
