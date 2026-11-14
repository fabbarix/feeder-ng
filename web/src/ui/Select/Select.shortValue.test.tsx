import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select } from './Select'
import { ShopSelect } from './ShopSelect'

// b8-shop: a chip that shows a short value keeps the full one as its title; the accessible name stays the label.
const options = [
  { value: 'a', label: 'Until Fri 20', triggerLabel: 'Fri 20' },
  { value: 'b', label: 'Today' },
]

describe('Select chip with a triggerLabel', () => {
  it('shows the short value, names the combobox by its label, and carries the full label as title', () => {
    render(<Select label="Shop for" appearance="chip" icon="plan" options={options} value="a" onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Shop for' })
    expect(trigger).toHaveTextContent('Fri 20')
    expect(trigger).toHaveAttribute('title', 'Until Fri 20')
  })
  it('no title when the shown value is the label', () => {
    render(<Select label="Shop for" appearance="chip" icon="plan" options={options} value="b" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop for' })).not.toHaveAttribute('title')
  })
  it('a normal field (not a chip) never gets the title', () => {
    render(<Select label="Shop for" options={options} value="a" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop for' })).not.toHaveAttribute('title')
  })
})

describe('ShopSelect shortName', () => {
  it('a Shop with a shortName shows it in the chip (title = its name)', () => {
    render(<ShopSelect label="Shop" appearance="chip" icon="shops" shops={[{ id: 0, name: 'Any Shop', shortName: 'Any' }, { id: 1, name: 'Coop' }]} value={0} onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Shop' })
    expect(trigger).toHaveTextContent(/^Any$/)
    expect(trigger).toHaveAttribute('title', 'Any Shop')
  })
})
