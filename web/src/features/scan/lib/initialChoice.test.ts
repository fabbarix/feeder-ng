import { describe, expect, it } from 'vitest'
import { initialChoice } from './initialChoice'

const shops = [
  { id: 1, name: 'Aldi' },
  { id: 2, name: 'Coop' },
]

describe('initialChoice', () => {
  it('goes straight to the last Shop used', () => {
    expect(initialChoice(shops, 2)).toEqual({ kind: 'shop', shop: { id: 2, name: 'Coop' } })
  })

  it('asks when there is no last Shop', () => {
    expect(initialChoice(shops, null)).toBeNull()
  })

  it('asks when the last Shop no longer exists, or there are no Shops', () => {
    expect(initialChoice(shops, 99)).toBeNull()
    expect(initialChoice([], 2)).toBeNull()
  })
})
