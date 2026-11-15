// B9-44 (TB-09, TB-11 follow-up of B9-29): "Throw out or keep?" has the shared TileHeader: a `spoiled` badge (spoil tone), the h2 as the section's name, a count of Lots, and a
// "Pantry ›" link to the spoiled Lots. No overline. The rows and their two buttons are B9-29's and do not change.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { StockLot } from '../types'
import { SpoiledTile } from './SpoiledTile'

const lot = (id: number, name: string): StockLot =>
  ({ id, ingredientId: id, ingredientName: name, baseUnit: 'g', quantity: 500, purchased: '2026-11-01', goesOff: '2026-11-08', source: 'manual', productId: null, shopId: null, spoiled: true, useSoon: false }) as StockLot
const view = (lots: StockLot[]) =>
  render(
    <MemoryRouter>
      <SpoiledTile lots={lots} today="2026-11-09" onThrowOut={() => {}} onKeep={() => {}} />
    </MemoryRouter>,
  )

describe('SpoiledTile: TileHeader (TB-09)', () => {
  it('has one .tile-header: a spoil-tone badge, the h2 "Throw out or keep?" naming the section, and a count of the Lots', () => {
    const { container } = view([lot(1, 'flour'), lot(2, 'milk')])
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'spoil')
    expect(container.querySelector('.tile-header .chip[data-kind="count"]')).toHaveTextContent('2')
    const section = screen.getByRole('region', { name: 'Throw out or keep?' })
    expect(section).toHaveAttribute('aria-labelledby', within(section).getByRole('heading', { level: 2, name: 'Throw out or keep?' }).id)
    expect(container.querySelector('.tile__overline')).toBeNull()
  })

  it('the trailing link "Pantry ›" goes to the Pantry filtered to spoiled Stock, and is named "Pantry, Throw out or keep?"', () => {
    view([lot(1, 'flour')])
    const link = screen.getByRole('link', { name: 'Pantry, Throw out or keep?' })
    expect(link).toHaveAttribute('href', '/pantry?status=spoiled')
  })

  it('keeps its two buttons per row', () => {
    view([lot(1, 'flour')])
    expect(screen.getByRole('button', { name: /^Throw out/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Keep/ })).toBeInTheDocument()
  })
})
