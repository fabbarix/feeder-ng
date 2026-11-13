import { describe, expect, it } from 'vitest'
import { mergeOffers } from './mergeOffer'

describe('mergeOffers (the last step of the bulk link)', () => {
  it('names the Ingredient, the Base recipe and what moves', () => {
    const [v] = mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 2, products: 1 }], 'Béchamel')
    expect(v).toMatchObject({
      ingredientId: 5,
      title: 'béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?',
      body: 'Its 2 Stock Lots and 1 Product move too.',
      mergeLabel: 'Merge',
      keepLabel: 'Keep it',
    })
  })
  it('says nothing else moves when it has no Stock and no Products', () => {
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 0 }], 'Béchamel')[0]?.body).toBe('Nothing else moves.')
  })
  it('singular Stock Lot, Products only', () => {
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 1, products: 0 }], 'Béchamel')[0]?.body).toBe('Its 1 Stock Lot moves too.')
    expect(mergeOffers([{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 3 }], 'Béchamel')[0]?.body).toBe('Its 3 Products move too.')
  })
  it('offers nothing when the server offers nothing (a line still uses the old Ingredient)', () => {
    expect(mergeOffers([], 'Béchamel')).toEqual([])
  })
})
