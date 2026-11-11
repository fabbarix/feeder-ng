// PE: Shopping List tiles lead with the Ingredient's Picture through the shared ui/Thumb: lines and Ingredient extras,
// an empty slot without a Picture; a free-text extra has none (it is not an Ingredient).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

const url = `/api/images/${'a'.repeat(32)}`
const noop = vi.fn()
function setup(list = makeList()) {
  render(<ShoppingBody list={list} system="metric" shopName="Coop" onTick={noop} onUntick={noop} onDelete={noop} onScan={noop} />)
}
const tile = (title: string) => screen.getByText(title).closest('.line-tile')!

describe('ShoppingBody: Ingredient pictures', () => {
  it('a Line with a Picture leads with a 40 px Thumb of it', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url })] }))
    const lead = tile('Passata').querySelector('.line-tile__lead')!
    expect(lead.querySelector('.thumb')).toHaveAttribute('data-size', '40')
    expect(lead.querySelector('img')).toHaveAttribute('src', url)
    expect(lead.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('a Line without one keeps the empty slot, so the names line up', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url }), makeLine({ ingredientId: 3, name: 'salt', imageUrl: '' })] }))
    const lead = tile('Salt').querySelector('.line-tile__lead')!
    expect(lead.querySelector('.thumb')).not.toBeNull()
    expect(lead.querySelector('img')).toBeNull()
  })

  it('a ticked Line keeps its Picture', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url, ticked: true })], progress: { ticked: 1, total: 1 } }))
    expect(tile('Passata').querySelector('.line-tile__lead img')).toHaveAttribute('src', url)
  })

  it('an Ingredient extra shows the Picture; a free-text extra has no lead at all', () => {
    setup(makeList({
      lines: [],
      extras: [
        makeExtra({ id: 1, text: null, ingredientId: 5, name: 'milk', baseUnit: 'ml', quantity: 1000, imageUrl: url }),
        makeExtra({ id: 2, text: 'toilet paper' }),
      ],
    }))
    expect(tile('Milk').querySelector('.line-tile__lead img')).toHaveAttribute('src', url)
    expect(tile('toilet paper').querySelector('.line-tile__lead')).toBeNull()
  })
})
