// batch w5a (P38: every button on a page has its own accessible name): the Shop with all four ticked kinds, a "more since your tick" row
// and an Ingredient extra of a Ingredient that also has a Line. No two buttons share a name; the second row of a title says which it is.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeAddition, makeExtra, makeLine, makeList, makeTick } from '../testData'
import { rowNames } from '../lib/rows'
import { listEntries } from '../lib/lines'
import { ShoppingBody } from './ShoppingBody'

const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const mushrooms = makeLine({ ingredientId: 5, name: 'Chestnut mushrooms', need: 1500, quantity: 750, more: 750, ticked: true, pack: null, estimatedCostCents: null, tick: makeTick({ added: 750, additions: [makeAddition({ quantity: 750 })] }) })
const carrot = makeLine({ ingredientId: 6, name: 'Carrot', quantity: 0, ticked: true, pack: null, estimatedCostCents: null, tick: makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 50 }), makeAddition({ quantity: 25, clientUuid: 'u-2' })] }) })
const cauliflower = makeLine({ ingredientId: 7, name: 'Cauliflower', quantity: 0, ticked: true, pack: null, estimatedCostCents: null, tick: makeTick({ added: null, additions: [makeAddition({ quantity: null })] }) })
const cheese = makeLine({ ingredientId: 8, name: 'Cheese', quantity: 0, ticked: true, pack: null, estimatedCostCents: null, tick: makeTick({ by: 'scan', added: null, additions: [makeAddition({ by: 'scan', quantity: null })] }) })
const passata = makeLine()
const passataExtra = makeExtra({ id: 9, text: null, ingredientId: 2, name: 'Passata', baseUnit: 'g', quantity: 200 })
const list = makeList({ lines: [passata, mushrooms, carrot, cauliflower, cheese], extras: [passataExtra, makeExtra()] })

const duplicates = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i)

describe('Shop: every button has its own name (P38)', () => {
  it('a Line, its "more since your tick" row, an Ingredient extra of the same Ingredient and all four ticked kinds: no name twice', () => {
    render(<ShoppingBody {...base} list={list} />)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    expect(duplicates(names)).toEqual([])
    expect(screen.getByRole('button', { name: 'Tick 750 g more of Chestnut mushrooms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tick Chestnut mushrooms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tick the extra 200 g of Passata' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tick Passata' })).toBeInTheDocument()
  })

  it('a title that is unique on the page keeps its plain name', () => {
    const { open } = listEntries(makeList({ lines: [passata] }), 'metric')
    expect([...rowNames(open).values()]).toEqual(['Passata'])
  })
})
