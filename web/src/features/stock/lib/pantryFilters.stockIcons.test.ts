// b8-pantry G2 (docs/dev/design/b8-pantry.md): the row 3 chip of Food or Supplies leads with its icon, as a Kind chip does.
import { describe, expect, it } from 'vitest'
import { pantryFilterChips, pantryFiltersFromParams } from './pantryFilters'

const chips = (q: string) => pantryFilterChips(pantryFiltersFromParams(new URLSearchParams(q)), 'places', [])

describe('the Food or Supplies chip of row 3 has an icon', () => {
  it('Supplies leads with the Supply icon', () => {
    expect(chips('stock=supply')).toEqual([{ key: 'stock', label: 'Supplies', removeLabel: 'Remove Supplies', icon: 'supply' }])
  })
  it('Food leads with the Ingredient icon', () => {
    expect(chips('stock=food')).toEqual([{ key: 'stock', label: 'Food', removeLabel: 'Remove Food', icon: 'ingredients' }])
  })
  it('keeps the chip order: status, Leftovers, Food or Supplies, kinds, places', () => {
    expect(chips('status=useSoon&stock=supply&kind=fridge').map((c) => c.key)).toEqual(['status', 'stock', 'kind:fridge'])
  })
})
