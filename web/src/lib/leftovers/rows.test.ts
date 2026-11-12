import { describe, expect, it } from 'vitest'
import { frozenChilli, leftover, TODAY } from './fixtures'
import { actionLabel, freezerChoices, menuActions, tileRows } from './rows'

describe('tileRows', () => {
  const soon = leftover({ id: 1, recipeName: 'Chilli', useBy: '2026-11-13' })
  const later = leftover({ id: 2, recipeName: 'Dal', portions: 1.5, useBy: '2026-11-16' })
  const answer1 = leftover({ id: 3, recipeName: 'Stew', useBy: '2026-11-10', toAnswer: true })
  const answer2 = leftover({ id: 4, recipeName: 'Soup', useBy: '2026-11-09', toAnswer: true })

  it('puts the questions first, oldest Use-by first, then the Leftovers soonest first', () => {
    const rows = tileRows([later, soon, answer1, answer2], TODAY)
    expect(rows.map((r) => [r.id, r.kind])).toEqual([[4, 'question'], [3, 'question'], [1, 'leftover'], [2, 'leftover']])
  })
  it('a question carries the decided text in the info tone', () => {
    const [row] = tileRows([answer1], TODAY)
    expect(row).toMatchObject({ tone: 'info', icon: 'question', text: "Stew was to be used by Tue. Had it, threw it out, or wasn't there?" })
  })
  it('a Leftover shows portions and Use-by; spoil tone from tomorrow back, else leftover', () => {
    const rows = tileRows([soon, later], TODAY)
    expect(rows[0]).toMatchObject({ text: '3 portions · Use by tomorrow', tone: 'spoil' })
    expect(rows[1]).toMatchObject({ text: '1.5 portions · Use by Mon', tone: 'leftover' })
  })
  it('frozen Leftovers are not on Today (they are on the Pantry page)', () => {
    expect(tileRows([frozenChilli(), soon], TODAY).map((r) => r.id)).toEqual([1])
  })
})

describe('menuActions', () => {
  it('a Leftover before its Use-by: Had it, Threw it out, Freeze it', () => {
    expect(menuActions(leftover(), TODAY)).toEqual(['had-it', 'threw-out', 'freeze'])
    expect(menuActions(leftover({ useBy: TODAY }), TODAY)).toEqual(['had-it', 'threw-out', 'freeze'])
  })
  it('Freeze it is not offered once the Use-by has passed', () => {
    expect(menuActions(leftover({ useBy: '2026-11-11' }), TODAY)).toEqual(['had-it', 'threw-out'])
  })
  it('a frozen Leftover: Had it, Threw it out, Take out', () => {
    expect(menuActions(frozenChilli(), TODAY)).toEqual(['had-it', 'threw-out', 'take-out'])
  })
  it('a question has no menu', () => {
    expect(menuActions(leftover({ toAnswer: true, useBy: '2026-11-10' }), TODAY)).toEqual([])
  })
  it('labels', () => {
    expect(['had-it', 'threw-out', 'freeze', 'take-out'].map((k) => actionLabel(k as 'had-it'))).toEqual(['Had it', 'Threw it out', 'Freeze it', 'Take out'])
  })
})

describe('freezerChoices (Choose a Recipe, "From the freezer")', () => {
  it('lists frozen Leftovers with portions by Recipe name', () => {
    const list = freezerChoices([
      frozenChilli({ id: 5 }),
      frozenChilli({ id: 6, recipeId: 11, recipeName: 'Dal', portions: 1, storagePlaceId: null, storagePlaceName: null }),
      frozenChilli({ id: 7, recipeId: 12, recipeName: 'Empty', portions: 0 }),
      leftover({ id: 8, recipeName: 'Not frozen' }),
    ])
    expect(list).toEqual([
      { leftoverId: 5, recipeId: 10, recipeName: 'Chilli', meta: '3 portions · Garage Freezer' },
      { leftoverId: 6, recipeId: 11, recipeName: 'Dal', meta: '1 portion · Not sorted' },
    ])
  })
})
