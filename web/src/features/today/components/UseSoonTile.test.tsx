import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UseSoonTile } from './UseSoonTile'

const item = (id: number, name: string, when: string) => ({ ingredientId: id, name, when })

describe('UseSoonTile', () => {
  it('lists each Ingredient as "Spinach · Thu" under the Use soon heading', () => {
    render(<UseSoonTile items={[item(1, 'Spinach', 'Thu'), item(2, 'Chicken thighs', 'today')]} />)
    expect(screen.getByRole('heading', { name: 'Use soon' })).toBeInTheDocument()
    expect(screen.getByText('Spinach · Thu')).toBeInTheDocument()
    expect(screen.getByText('Chicken thighs · today')).toBeInTheDocument()
  })

  it('shows at most three rows and counts the rest', () => {
    render(<UseSoonTile items={[item(1, 'Spinach', 'Thu'), item(2, 'Feta', 'Thu'), item(3, 'Milk', 'Fri'), item(4, 'Yoghurt', 'Fri'), item(5, 'Basil', 'Sat')]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText(/Yoghurt/)).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('is a half status tile in the fixed spoil colour, never an accent', () => {
    const { container } = render(<UseSoonTile items={[item(1, 'Spinach', 'Thu')]} />)
    const tile = container.querySelector('[data-variant="status"]')!
    expect(tile).toHaveAttribute('data-status', 'spoil')
    expect(tile).toHaveAttribute('data-span', '1')
  })

  it('renders nothing when empty', () => {
    const { container } = render(<UseSoonTile items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
