import { describe, expect, it } from 'vitest'
import { addBoughtChip, boughtLine, boughtNames, regenerateBoughtLines, swapBoughtNote, warningLine, type BoughtInfo } from './bought'
import type { PlanChip } from './chips'

const bought: BoughtInfo = { ingredients: [{ id: 1, name: 'chicken thighs' }, { id: 2, name: 'cream' }] }
const pinned: PlanChip = { key: 'state:pinned', kind: 'state', status: 'pinned', label: 'Pinned' }
const fav: PlanChip = { key: 'why:f', kind: 'why', label: "Anna's favourite" }
const chip: PlanChip = { key: 'status:bought', kind: 'why', label: 'Bought' }

describe('boughtNames', () => {
  it('lists the Ingredient names in server order, [] when not Bought', () => {
    expect(boughtNames(bought)).toEqual(['chicken thighs', 'cream'])
    expect(boughtNames(null)).toEqual([])
    expect(boughtNames(undefined)).toEqual([])
  })
})

describe('addBoughtChip', () => {
  it('a row with no other chip gets the Bought chip', () => {
    expect(addBoughtChip([], bought, 'row')).toEqual([chip])
  })
  it('a row with another chip stays as it is', () => {
    expect(addBoughtChip([fav], bought, 'row')).toEqual([fav])
    expect(addBoughtChip([pinned], bought, 'row')).toEqual([pinned])
  })
  it('the sheet always shows it, after the state chips (Pinned and Bought both shown)', () => {
    expect(addBoughtChip([pinned, fav], bought, 'sheet')).toEqual([pinned, chip, fav])
    expect(addBoughtChip([], bought, 'sheet')).toEqual([chip])
  })
  it('nothing when not Bought', () => {
    expect(addBoughtChip([], null, 'row')).toEqual([])
    expect(addBoughtChip([pinned], undefined, 'sheet')).toEqual([pinned])
  })
})

describe('lines', () => {
  it('the sheet line names what was bought', () => {
    expect(boughtLine(bought)).toBe('Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is.')
    expect(boughtLine(null)).toBeNull()
  })
  it('the Swap note says it stays in Stock', () => {
    expect(swapBoughtNote({ ingredients: [{ id: 1, name: 'chicken thighs' }] })).toBe('You bought chicken thighs for this; it stays in Stock.')
    expect(swapBoughtNote(undefined)).toBeNull()
  })
})

describe('warningLine', () => {
  const ctx = { memberName: (id: number) => (id === 3 ? 'Sam' : undefined), ingredientName: (id: number) => (id === 9 ? 'garlic' : undefined), courseName: 'Side' }
  it('excluded names the Member and the Ingredient', () => {
    expect(warningLine({ code: 'excluded', memberId: 3, ingredientId: 9 }, ctx)).toBe('Sam now excludes garlic, which this uses. Swap it to change it.')
  })
  it('excluded with unknown names falls back', () => {
    expect(warningLine({ code: 'excluded', memberId: 4, ingredientId: 8 }, ctx)).toBe('A Member now excludes an Ingredient, which this uses. Swap it to change it.')
  })
  it('archived and course_lost', () => {
    expect(warningLine({ code: 'archived' }, ctx)).toBe('This Recipe is archived. Swap it to change it.')
    expect(warningLine({ code: 'course_lost' }, ctx)).toBe('This Recipe is no longer a Side Recipe. Swap it to change it.')
    expect(warningLine({ code: 'course_lost' }, {})).toBe('This Recipe is no longer a Recipe for this Course. Swap it to change it.')
  })
  it('null without a warning', () => {
    expect(warningLine(null, ctx)).toBeNull()
  })
})

describe('regenerateBoughtLines', () => {
  it('names each Bought meal', () => {
    const r = regenerateBoughtLines([{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken', ingredients: ['chicken thighs', 'cream'] }])
    expect(r.intro).toBe('These have Ingredients you already bought and are replaced too:')
    expect(r.lines).toEqual(['Tue Dinner · Roast chicken (chicken thighs, cream).'])
  })
  it('says nothing when none', () => {
    expect(regenerateBoughtLines([])).toEqual({ intro: null, lines: [] })
    expect(regenerateBoughtLines(undefined)).toEqual({ intro: null, lines: [] })
  })
})
