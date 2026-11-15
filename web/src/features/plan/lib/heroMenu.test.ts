// B9-39 (TB-10): the hero's ⋮ menu gains, before the per-date items: Swap, Pin / Unpin, Open Recipe (the Planned Meal sheet's own actions).
// The pure part: which of them the hero's meal offers, with their labels. The rendered order is in TonightHero.menu.test.tsx.
import { describe, expect, it } from 'vitest'
import { meal } from '../test-utils'
import { heroMenuHead } from './heroMenu'

describe('heroMenuHead', () => {
  it('a planned meal: Swap, Pin and Open Recipe, in that order', () => {
    expect(heroMenuHead(meal())).toEqual([
      { id: 'swap', label: 'Swap' },
      { id: 'pin', label: 'Pin' },
      { id: 'open-recipe', label: 'Open Recipe' },
    ])
  })

  it('a Pinned meal offers Unpin where it offered Pin', () => {
    expect(heroMenuHead(meal({ pinned: true })).map((i) => i.label)).toEqual(['Swap', 'Unpin', 'Open Recipe'])
    expect(heroMenuHead(meal({ pinned: true })).map((i) => i.id)).toEqual(['swap', 'unpin', 'open-recipe'])
  })

  it('a meal served from a Leftover is swapped, pinned and opened like any other (the Planned Meal sheet does the same)', () => {
    const leftover = meal({ servedFromLeftover: { date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry', leftoverId: 5 } })
    expect(heroMenuHead(leftover).map((i) => i.label)).toEqual(['Swap', 'Pin', 'Open Recipe'])
  })
})
