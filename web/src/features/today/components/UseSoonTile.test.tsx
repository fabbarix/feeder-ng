// B9-44 (TB-09, TB-11; changed on purpose): Use soon is a spoil status tile with a TileHeader ("Pantry ›" link), ListRows in a ul
// (a Picture or monogram, the name, "Good until tomorrow" in the spoil tone, the amount as the value), at most 3 rows, then a
// "+2 more" link to the Pantry. Pressing a row opens the Lot that goes off soonest (the Pantry's Lot sheet, through onOpenLot).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { UseSoonItem } from '../types'
import { UseSoonTile } from './UseSoonTile'

const item = (id: number, name: string, when = 'good until tomorrow', over: Partial<UseSoonItem> = {}): UseSoonItem => ({
  ingredientId: id, name, when, quantity: 500, baseUnit: 'g', soonestLotId: id * 10, ...over,
})
const view = (items: UseSoonItem[], extra: Partial<Parameters<typeof UseSoonTile>[0]> = {}) =>
  render(
    <MemoryRouter>
      <UseSoonTile items={items} system="metric" onOpenLot={() => {}} {...extra} />
    </MemoryRouter>,
  )

describe('UseSoonTile: the tile', () => {
  it('is a spoil status section named by its h2 "Use soon", with one TileHeader and a count', () => {
    const { container } = view([item(1, 'Flour'), item(2, 'Milk')])
    const section = screen.getByRole('region', { name: 'Use soon' })
    expect(section).toHaveAttribute('data-variant', 'status')
    expect(section).toHaveAttribute('data-status', 'spoil')
    expect(section).toHaveAttribute('aria-labelledby', within(section).getByRole('heading', { level: 2, name: 'Use soon' }).id)
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'spoil')
    expect(container.querySelector('.tile-header .chip[data-kind="count"]')).toHaveTextContent('2')
    expect(container.querySelector('.today__tile-title')).toBeNull()
  })

  it('the header link "Pantry ›" goes to the Pantry filtered to Use soon, named "Pantry, Use soon"', () => {
    view([item(1, 'Flour')])
    const link = screen.getByRole('link', { name: 'Pantry, Use soon' })
    expect(link).toHaveAttribute('href', '/pantry?status=useSoon')
  })

  it('renders nothing when empty', () => {
    const { container } = view([])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('UseSoonTile: the rows', () => {
  it('are ListRows in a ul: the name, "Good until tomorrow" as the meta, the amount as the value', () => {
    const { container } = view([item(1, 'Flour', 'good until tomorrow', { quantity: 500 })])
    const ul = container.querySelector('ul')!
    const li = within(ul).getAllByRole('listitem')[0]!
    expect(li).toHaveClass('list-row')
    expect(within(li).getByText('Flour')).toBeInTheDocument()
    expect(within(li).getByText('Good until tomorrow')).toBeInTheDocument()
    expect(within(li).getByText('500 g')).toBeInTheDocument()
    expect(li.querySelector('.list-row__meta')).toHaveAttribute('data-status', 'spoil')
  })

  it('formats the amount in the Household’s unit system', () => {
    view([item(1, 'Flour', 'good until tomorrow', { quantity: 454 })], { system: 'imperial' })
    expect(screen.getByText(/lb|oz/)).toBeInTheDocument()
  })

  it('the row is one target named "Flour, 500 g, good until tomorrow" that opens the soonest Lot', async () => {
    const onOpenLot = vi.fn()
    view([item(1, 'Flour', 'good until tomorrow', { soonestLotId: 11 })], { onOpenLot })
    await userEvent.click(screen.getByRole('button', { name: 'Flour, 500 g, good until tomorrow' }))
    expect(onOpenLot).toHaveBeenCalledWith(11)
  })

  it('a row without a Lot to open (Lots not loaded yet) is a plain row, not a button', () => {
    view([item(1, 'Flour', 'good until tomorrow', { soonestLotId: undefined })])
    expect(screen.queryByRole('button', { name: /Flour/ })).toBeNull()
    expect(screen.getByText('Flour')).toBeInTheDocument()
  })

  it('has no ⋮ and no stretched tile target', () => {
    const { container } = view([item(1, 'Flour')])
    expect(screen.queryByRole('button', { name: /actions/i })).toBeNull()
    expect(container.querySelector('.tile__stretch')).toBeNull()
  })

  it('shows at most three rows and a "+2 more" link to the Pantry (a link, never a bare tertiary button)', () => {
    const { container } = view([1, 2, 3, 4, 5].map((n) => item(n, `I${n}`)))
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
    expect(screen.queryByText('I4')).toBeNull()
    const more = screen.getByRole('link', { name: '+2 more' })
    expect(more).toHaveAttribute('href', '/pantry?status=useSoon')
    expect(container.querySelector('button[data-variant="tertiary"], .button[data-variant="tertiary"]')).toBeNull()
  })

  it('three or fewer: no "+N more"', () => {
    view([1, 2, 3].map((n) => item(n, `I${n}`)))
    expect(screen.queryByText(/more$/)).toBeNull()
  })
})
