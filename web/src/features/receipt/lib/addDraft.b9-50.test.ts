// B9-50 (SSP-08): the draft of a line that is already a Product, and what the sheet opens with when that Add is edited again.
import { describe, expect, it } from 'vitest'
import { add0 } from '../fixtures.test-helper'
import { draftFromProduct, initialFromAdd } from './addDraft'
import { isAddComplete } from './reviewState'

describe('draftFromProduct', () => {
  it('names the Product and is complete', () => {
    const d = draftFromProduct(77)
    expect(d.productId).toBe(77)
    expect(isAddComplete(d)).toBe(true)
  })
})

describe('initialFromAdd with a draft that names a Product', () => {
  it('opens the sheet as for a line with no draft: the line\'s name and size, no Ingredient chosen', () => {
    const fresh = initialFromAdd(add0, undefined, [])
    expect(initialFromAdd(add0, draftFromProduct(77), [])).toEqual(fresh)
  })
})
