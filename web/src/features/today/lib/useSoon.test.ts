import { describe, expect, it } from 'vitest'
import type { IngredientStock } from '../../stock/types'
import { splitUseSoon, useSoonItems } from './useSoon'

const stock = (id: number, name: string, nextGoesOff: string | null, useSoon = true) =>
  ({ ingredientId: id, name, useSoon, nextGoesOff }) as unknown as IngredientStock

describe('useSoonItems (short wording for the row "Spinach · Thu")', () => {
  it('says today, tomorrow, then the short weekday', () => {
    const items = useSoonItems([stock(1, 'Milk', '2026-11-10'), stock(2, 'Feta', '2026-11-11'), stock(3, 'Spinach', '2026-11-12')], '2026-11-10')
    expect(items.map((i) => `${i.name} ${i.when}`)).toEqual(['Milk today', 'Feta tomorrow', 'Spinach Thu'])
  })

  it('soonest first, skips spoiled lots and Ingredients not flagged', () => {
    const items = useSoonItems([stock(1, 'B', '2026-11-12'), stock(2, 'A', '2026-11-12'), stock(3, 'Old', '2026-11-09'), stock(4, 'Fine', '2026-11-11', false)], '2026-11-10')
    expect(items.map((i) => i.name)).toEqual(['A', 'B'])
  })
})

describe('splitUseSoon', () => {
  const item = (n: number) => ({ ingredientId: n, name: `I${n}`, when: 'Thu' })
  it('keeps the first three and counts the rest', () => {
    expect(splitUseSoon([1, 2, 3, 4, 5].map(item))).toEqual({ rows: [1, 2, 3].map(item), more: 2 })
  })
  it('three or fewer: no more', () => {
    expect(splitUseSoon([1, 2].map(item))).toEqual({ rows: [1, 2].map(item), more: 0 })
  })
})
