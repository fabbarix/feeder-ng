import { describe, expect, it } from 'vitest'
import {
  lineState, overPickedLots, pickedTotal, setPickAmount, togglePick, toUsedFrom, usedFromLines, usedFromSummary,
  type CourseSelection, type UsedFromNeed,
} from './usedFrom'

const lot = (id: number, quantity: number, place = 'Fridge', goesOff: string | null = '2026-11-14') =>
  ({ id, quantity, purchased: '2026-11-09', goesOff, storagePlaceName: place })
const chicken: UsedFromNeed = {
  ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800, baseUnit: 'g',
  lots: [lot(1, 500), lot(2, 600, 'Freezer', '2027-02-01'), lot(3, 300, 'Fridge', null)],
}
const rice: UsedFromNeed = { ingredientId: 12, ingredient: 'Rice', quantity: 200, baseUnit: 'g', lots: [lot(9, 1000, 'Pantry', null)] }

describe('togglePick prefill', () => {
  it('ticking the first Lot takes up to the need or the whole Lot', () => {
    expect(togglePick({}, chicken, 1, true)).toEqual({ 11: { 1: 500 } })
    expect(togglePick({}, rice, 9, true)).toEqual({ 12: { 9: 200 } })
  })
  it('a second Lot is prefilled with what is still needed, in pick order', () => {
    const s = togglePick({ 11: { 1: 500 } }, chicken, 2, true)
    expect(s).toEqual({ 11: { 1: 500, 2: 300 } })
  })
  it('when the need is covered a further Lot is prefilled whole (the cook used more)', () => {
    const s = togglePick({ 11: { 1: 500, 2: 300 } }, chicken, 3, true)
    expect(s[11]![3]).toBe(300)
  })
  it('unticking removes the pick and drops the Ingredient when empty', () => {
    expect(togglePick({ 11: { 1: 500 } }, chicken, 1, false)).toEqual({})
    expect(togglePick({ 11: { 1: 500, 2: 300 } }, chicken, 1, false)).toEqual({ 11: { 2: 300 } })
  })
  it('does not mutate the input', () => {
    const s = { 11: { 1: 500 } }
    togglePick(s, chicken, 2, true)
    expect(s).toEqual({ 11: { 1: 500 } })
  })
  it('ignores a Lot the need does not list', () => {
    expect(togglePick({}, chicken, 99, true)).toEqual({})
  })
})

describe('setPickAmount', () => {
  it('sets the amount, clamped to 0..Lot quantity', () => {
    const s = { 11: { 1: 500 } }
    expect(setPickAmount(s, chicken, 1, 250)).toEqual({ 11: { 1: 250 } })
    expect(setPickAmount(s, chicken, 1, 900)).toEqual({ 11: { 1: 500 } })
    expect(setPickAmount(s, chicken, 1, -5)).toEqual({ 11: { 1: 0 } })
  })
  it('ignores a Lot that is not picked', () => {
    expect(setPickAmount({}, chicken, 1, 100)).toEqual({})
  })
})

describe('totals against the need', () => {
  it('pickedTotal sums the Ingredient picks', () => {
    expect(pickedTotal({ 11: { 1: 500, 2: 100 } }, 11)).toBe(600)
    expect(pickedTotal({}, 11)).toBe(0)
  })
  it('lineState: none, short, exact, over', () => {
    expect(lineState(chicken, {})).toBe('none')
    expect(lineState(chicken, { 11: { 1: 500 } })).toBe('short')
    expect(lineState(chicken, { 11: { 1: 500, 2: 300 } })).toBe('exact')
    expect(lineState(chicken, { 11: { 1: 500, 2: 400 } })).toBe('over')
    expect(lineState(chicken, { 11: { 1: 0 } })).toBe('none')
  })
})

describe('usedFromSummary', () => {
  it('default when nothing is picked', () => {
    expect(usedFromSummary([chicken, rice], {})).toBe('Soonest to go off first')
    expect(usedFromSummary([chicken, rice], { 11: { 1: 0 } })).toBe('Soonest to go off first')
  })
  it('counts the Ingredients with a pick', () => {
    expect(usedFromSummary([chicken, rice], { 11: { 1: 500 } })).toBe('Your choice for 1 Ingredient')
    expect(usedFromSummary([chicken, rice], { 11: { 1: 500 }, 12: { 9: 200 } })).toBe('Your choice for 2 Ingredients')
  })
})

describe('toUsedFrom payload', () => {
  it('is undefined when nothing is picked', () => {
    expect(toUsedFrom([chicken, rice], {})).toBeUndefined()
    expect(toUsedFrom([chicken], { 11: { 1: 0 } })).toBeUndefined()
  })
  it('lists picked Ingredients in need order and Lots in Deduction order, dropping zero amounts', () => {
    const sel = { 12: { 9: 200 }, 11: { 2: 300, 1: 500, 3: 0 } }
    expect(toUsedFrom([chicken, rice], sel)).toEqual([
      { ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }, { lotId: 2, quantity: 300 }] },
      { ingredientId: 12, lots: [{ lotId: 9, quantity: 200 }] },
    ])
  })
})

describe('overPickedLots across Courses', () => {
  const main = (amount: number): CourseSelection => ({ courseId: 1, needs: [chicken], selection: { 11: { 1: amount } } })
  const side = (amount: number): CourseSelection => ({ courseId: 2, needs: [chicken], selection: { 11: { 1: amount } } })
  it('none when the picks fit the Lot', () => {
    expect(overPickedLots([main(300), side(200)])).toEqual([])
  })
  it('reports a Lot that the Courses together over-pick', () => {
    expect(overPickedLots([main(400), side(300)])).toEqual([
      { lotId: 1, ingredientId: 11, ingredient: 'Chicken thighs', storagePlaceName: 'Fridge', held: 500, picked: 700, courseIds: [1, 2] },
    ])
  })
  it('a single Course within its Lot is no conflict', () => {
    expect(overPickedLots([main(500)])).toEqual([])
  })
})

describe('usedFromLines view models', () => {
  it('titles the line with the need and lists Lots with Storage Place, dates and unpicked state', () => {
    const [line] = usedFromLines([chicken], {})
    expect(line!.title).toBe('Chicken thighs · 800 g')
    expect(line!.state).toBe('none')
    expect(line!.message).toBeNull()
    expect(line!.lots.map((l) => l.label)).toEqual(['500 g · Fridge', '600 g · Freezer', '300 g · Fridge'])
    expect(line!.lots[0]!.meta).toBe('Good until 14 Nov · Bought 9 Nov')
    expect(line!.lots[2]!.meta).toBe('No go-off date · Bought 9 Nov')
    expect(line!.lots.every((l) => !l.picked)).toBe(true)
  })
  it('marks picked Lots with amount and max', () => {
    const [line] = usedFromLines([chicken], { 11: { 1: 500 } })
    expect(line!.lots[0]).toMatchObject({ lotId: 1, picked: true, amount: 500, max: 500, amountLabel: 'Amount used from Fridge' })
  })
  it('says what is short and over', () => {
    expect(usedFromLines([chicken], { 11: { 1: 500 } })[0]!.message).toBe('500 g of 800 g chosen. The rest follows soonest to go off first.')
    expect(usedFromLines([chicken], { 11: { 1: 500, 2: 400 } })[0]!.message).toBe('900 g chosen, more than the 800 g needed. Taken as chosen.')
    expect(usedFromLines([chicken], { 11: { 1: 500, 2: 300 } })[0]!.message).toBeNull()
  })
  it('an Ingredient without Lots says so', () => {
    const none = { ...rice, lots: [] }
    const [line] = usedFromLines([none], {})
    expect(line!.empty).toBe('No Stock of this Ingredient')
    expect(line!.lots).toEqual([])
  })
  it('formats pieces and imperial through the shared units', () => {
    const eggs: UsedFromNeed = { ingredientId: 5, ingredient: 'Eggs', quantity: 4, baseUnit: 'piece', lots: [lot(7, 6, 'Fridge')] }
    expect(usedFromLines([eggs], {})[0]!.title).toBe('Eggs · 4 pieces')
    expect(usedFromLines([rice], {}, 'imperial')[0]!.title).toMatch(/^Rice · 7(\.\d)? oz$/)
  })
})
