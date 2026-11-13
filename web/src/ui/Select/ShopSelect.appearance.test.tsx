// DS-SHOP round 3: the chip look is opt-in. ShopSelect is a normal field by default and passes `appearance` through; only the Shop
// screen asks for "chip" (the Price form's Shop field must keep its visible label).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShopSelect } from './ShopSelect'

const shops = [{ id: 1, name: 'Coop' }, { id: 2, name: 'Aldi' }]

describe('ShopSelect appearance', () => {
  it('defaults to the normal field: visible label, no data-appearance', () => {
    const { container } = render(<ShopSelect label="Shop" shops={shops} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop' })).not.toHaveAttribute('data-appearance')
    expect(container.querySelector('.ui-field__label')).not.toHaveClass('visually-hidden')
    expect(container.querySelector('[data-appearance]')).toBeNull()
  })

  it('appearance="chip" is passed through to the Select, with and without a clear row', () => {
    const { container, rerender } = render(<ShopSelect label="Shop" appearance="chip" shops={shops} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveAttribute('data-appearance', 'chip')
    expect(container.querySelector('.ui-field__label')).toHaveClass('visually-hidden')
    rerender(<ShopSelect label="Shop" appearance="chip" clearLabel="Any Shop" shops={shops} value={null} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveAttribute('data-appearance', 'chip')
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveTextContent('Any Shop')
  })

  it('an icon can be passed through too (the chip\'s leading icon, also for "Any Shop")', () => {
    render(<ShopSelect label="Shop" appearance="chip" icon="shops" clearLabel="Any Shop" shops={shops} value={null} onChange={() => {}} />)
    expect(screen.getByRole('combobox').querySelector('.select__leading svg')).toBeInTheDocument()
  })
})
