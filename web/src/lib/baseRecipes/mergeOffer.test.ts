import { describe, expect, it } from 'vitest'
import { mergeOffers } from './mergeOffer'

describe('mergeOffers (the last step of the bulk link)', () => {
  it('names the Ingredient, the Base recipe and what moves', () => {
    const [v] = mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 2, products: 1, exclusions: 0 }], 'Béchamel')
    expect(v).toMatchObject({
      ingredientId: 5,
      title: 'béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?',
      body: 'Its 2 Stock Lots and 1 Product move too.',
      mergeLabel: 'Merge',
      keepLabel: 'Keep it',
    })
  })
  it('says nothing else moves when it has no Stock and no Products', () => {
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 0, exclusions: 0 }], 'Béchamel')[0]?.body).toBe('Nothing else moves.')
  })
  it('singular Stock Lot, Products only', () => {
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 1, products: 0, exclusions: 0 }], 'Béchamel')[0]?.body).toBe('Its 1 Stock Lot moves too.')
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 3, exclusions: 0 }], 'Béchamel')[0]?.body).toBe('Its 3 Products move too.')
  })
  it('offers nothing when the server offers nothing (a line still uses the old Ingredient)', () => {
    expect(mergeOffers([], 'Béchamel')).toEqual([])
  })
})

// Round 4 (BR-B round 2): the offer counts the Members' Exclusions of the old Ingredient that the merge moves.
describe('mergeOffers: the Exclusions count', () => {
  const body = (stockLots: number, products: number, exclusions: number) => mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots, products, exclusions }], 'Béchamel')[0]?.body
  it('names them after Stock Lots and Products: "Its 2 Stock Lots, 1 Product and 3 Exclusions move too."', () => {
    expect(body(2, 1, 3)).toBe('Its 2 Stock Lots, 1 Product and 3 Exclusions move too.')
  })
  it('singular: "1 Exclusion"', () => {
    expect(body(2, 0, 1)).toBe('Its 2 Stock Lots and 1 Exclusion move too.')
  })
  it('alone, one is "moves" and several are "move"', () => {
    expect(body(0, 0, 1)).toBe('Its 1 Exclusion moves too.')
    expect(body(0, 0, 2)).toBe('Its 2 Exclusions move too.')
  })
  it('Products and Exclusions without Stock', () => {
    expect(body(0, 2, 1)).toBe('Its 2 Products and 1 Exclusion move too.')
  })
  it('says nothing else moves only when all three are zero', () => {
    expect(body(0, 0, 0)).toBe('Nothing else moves.')
  })
  it('treats a missing count as zero (an older answer)', () => {
    const [v] = mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 1, products: 0 } as never], 'Béchamel')
    expect(v?.body).toBe('Its 1 Stock Lot moves too.')
  })
})
