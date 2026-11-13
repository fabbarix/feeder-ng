// PE (DS-SHOP): Shopping List rows lead with the Ingredient's Picture through the shared ui/Thumb. Without one (or when it fails to
// load) the Thumb draws the monogram of the name, never an empty box (docs/design/system.md §7). Every row, extras included.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

const url = `/api/images/${'a'.repeat(32)}`
const noop = vi.fn()
function setup(list = makeList()) {
  render(<ShoppingBody list={list} system="metric" shopName="Coop" onTick={noop} onUntick={noop} onOpenLine={noop} onScan={noop} />)
}
const row = (title: string) => screen.getByText(title).closest('.list-row')!

describe('ShoppingBody: Ingredient pictures', () => {
  it('a Line with a Picture leads with a 40 px Thumb of it', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url })] }))
    const lead = row('Passata').querySelector('.list-row__leading')!
    expect(lead.querySelector('.thumb')).toHaveAttribute('data-size', '40')
    expect(lead.querySelector('img')).toHaveAttribute('src', url)
    expect(lead.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('a Line without one draws the monogram of its name, so the names line up', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url }), makeLine({ ingredientId: 3, name: 'salt', imageUrl: '' })] }))
    const lead = row('Salt').querySelector('.list-row__leading')!
    expect(lead.querySelector('img')).toBeNull()
    expect(lead.querySelector('.thumb')).toHaveAttribute('data-monogram', 'true')
    expect(lead.querySelector('.thumb__monogram')).toHaveTextContent('S')
  })

  it('a ticked Line keeps its Picture', () => {
    setup(makeList({ lines: [makeLine({ name: 'passata', imageUrl: url, ticked: true })], progress: { ticked: 1, total: 1 } }))
    expect(row('Passata').querySelector('.list-row__leading img')).toHaveAttribute('src', url)
  })

  it('an Ingredient extra shows the Picture; a free-text extra shows the monogram of its text', () => {
    setup(makeList({
      lines: [],
      extras: [
        makeExtra({ id: 1, text: null, ingredientId: 5, name: 'milk', baseUnit: 'ml', quantity: 1000, imageUrl: url }),
        makeExtra({ id: 2, text: 'toilet paper' }),
      ],
    }))
    expect(row('Milk').querySelector('.list-row__leading img')).toHaveAttribute('src', url)
    expect(row('toilet paper').querySelector('.list-row__leading .thumb__monogram')).toHaveTextContent('T')
  })
})
