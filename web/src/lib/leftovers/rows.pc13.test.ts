// B9-45 (PC-13, decision PC 7): Leftovers of one Recipe with the same Use-by are one row; actions take from the soonest first;
// a Leftover that is planned for says so on a second line. Today is 2026-11-12 (a Thursday); 2026-11-17 is a Tuesday.
import { describe, expect, it } from 'vitest'
import { frozenChilli, leftover, TODAY } from './fixtures'
import { mergeRows, spareHint, takeFromSoonest, tileRows } from './rows'

const a = leftover({ id: 1, recipeId: 10, portions: 1.25, cookedOn: '2026-11-10', useBy: '2026-11-17' })
const b = leftover({ id: 2, recipeId: 10, portions: 1.25, cookedOn: '2026-11-11', useBy: '2026-11-17' })

describe('mergeRows', () => {
  it('shows two Leftovers of one Recipe with the same Use-by as one: portions summed, the soonest\'s id, every id', () => {
    const [row, ...rest] = mergeRows([b, a])
    expect(rest).toEqual([])
    expect(row).toMatchObject({ id: 1, ids: [1, 2], portions: 2.5, useBy: '2026-11-17', recipeId: 10, cookedOn: '2026-11-10' })
  })
  it('sums the planned portions too', () => {
    const [row] = mergeRows([{ ...a, plannedPortions: 1 }, { ...b, plannedPortions: 0.25 }])
    expect(row!.plannedPortions).toBe(1.25)
  })
  it('keeps different Use-by dates apart', () => {
    expect(mergeRows([a, { ...b, useBy: '2026-11-18' }]).map((r) => r.ids)).toEqual([[1], [2]])
  })
  it('keeps different Recipes apart', () => {
    expect(mergeRows([a, { ...b, recipeId: 11, recipeName: 'Dal' }]).map((r) => r.ids)).toEqual([[1], [2]])
  })
  it('NEVER joins a frozen and a not frozen Leftover', () => {
    const frozen = frozenChilli({ id: 3, recipeId: 10, useBy: '2026-11-17' })
    expect(mergeRows([a, frozen]).map((r) => r.ids)).toEqual([[1], [3]])
  })
  it('joins frozen ones only in the same Storage Place', () => {
    const f1 = frozenChilli({ id: 3, recipeId: 10, useBy: '2027-02-10', storagePlaceId: 2 })
    const f2 = frozenChilli({ id: 4, recipeId: 10, useBy: '2027-02-10', storagePlaceId: 2 })
    const f3 = frozenChilli({ id: 5, recipeId: 10, useBy: '2027-02-10', storagePlaceId: 4, storagePlaceName: 'Basement Freezer' })
    expect(mergeRows([f1, f3, f2]).map((r) => r.ids)).toEqual([[3, 4], [5]])
  })
  it('never merges a question (a Leftover to answer)', () => {
    const q1 = leftover({ id: 7, recipeId: 10, useBy: '2026-11-10', toAnswer: true })
    const q2 = leftover({ id: 8, recipeId: 10, useBy: '2026-11-10', toAnswer: true })
    expect(mergeRows([q1, q2]).map((r) => r.ids)).toEqual([[7], [8]])
  })
  it('keeps the order of the first member, and a Leftover on its own has ids [id]', () => {
    const other = leftover({ id: 9, recipeId: 12, recipeName: 'Dal', useBy: '2026-11-16' })
    expect(mergeRows([other, a, b]).map((r) => r.ids)).toEqual([[9], [1, 2]])
  })
  it('breaks a tie of cooked dates by id', () => {
    const c = { ...b, id: 0, cookedOn: '2026-11-10' }
    expect(mergeRows([a, c])[0]!.ids).toEqual([0, 1])
  })
})

describe('takeFromSoonest', () => {
  it('takes from the soonest Leftover first and carries on into the next', () => {
    expect(takeFromSoonest([a, b], 2)).toEqual([{ leftoverId: 1, portions: 1.25 }, { leftoverId: 2, portions: 0.75 }])
  })
  it('stays inside the first when it is enough', () => {
    expect(takeFromSoonest([a, b], 1)).toEqual([{ leftoverId: 1, portions: 1 }])
  })
  it('takes all of them', () => {
    expect(takeFromSoonest([a, b], 2.5)).toEqual([{ leftoverId: 1, portions: 1.25 }, { leftoverId: 2, portions: 1.25 }])
  })
})

describe('spareHint', () => {
  it('has none when nothing is planned', () => {
    expect(spareHint(2.5, 0, [])).toBeNull()
  })
  it('says how much a meal takes and how much is spare: "1.25 for Mon Dinner · 1.25 spare: have it or freeze it"', () => {
    expect(spareHint(2.5, 1.25, ['Mon Dinner'])).toBe('1.25 for Mon Dinner · 1.25 spare: have it or freeze it')
  })
  it('joins several meals', () => {
    expect(spareHint(4, 2, ['Mon Dinner', 'Tue Lunch'])).toBe('2 for Mon Dinner and Tue Lunch · 2 spare: have it or freeze it')
  })
  it('says "Planned for" when all of it is planned', () => {
    expect(spareHint(3.25, 3.25, ['Sun Dinner'])).toBe('Planned for Sun Dinner')
    expect(spareHint(2, 3, ['Sun Dinner'])).toBe('Planned for Sun Dinner')
  })
  it('says "a planned meal" without names', () => {
    expect(spareHint(2.5, 1.25, [])).toBe('1.25 for a planned meal · 1.25 spare: have it or freeze it')
  })
})

describe('tileRows with merged Leftovers', () => {
  it('shows one row for the merged Leftovers: "Use by Tue · 2.5 portions" with every id', () => {
    const rows = tileRows([a, b], TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 1, ids: [1, 2], text: 'Use by Tue · 2.5 portions', kind: 'leftover' })
  })
  it('carries the spare hint of a Leftover that is planned for', () => {
    const planned = { ...a, portions: 2.5, plannedPortions: 1.25 }
    const [row] = tileRows([planned], TODAY, { 1: ['Mon Dinner'] })
    expect(row!.hint).toBe('1.25 for Mon Dinner · 1.25 spare: have it or freeze it')
  })
  it('has no hint without planned portions, and none on a question', () => {
    expect(tileRows([a], TODAY)[0]!.hint).toBeUndefined()
    const q = leftover({ id: 3, useBy: '2026-11-10', toAnswer: true, plannedPortions: 1 })
    expect(tileRows([q], TODAY, { 3: ['Mon Dinner'] })[0]!.hint).toBeUndefined()
  })
})
