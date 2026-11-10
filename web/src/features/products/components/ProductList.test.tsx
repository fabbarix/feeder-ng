import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Product } from '../types'
import { ProductList } from './ProductList'

const passata = { id: 1, name: 'Passata', packSize: 700, baseUnit: 'g' } as Product

describe('ProductList pack sizes (B9)', () => {
  it('shows grams in metric', () => {
    render(<MemoryRouter><ProductList products={[passata]} system="metric" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).toHaveTextContent('700 g')
  })
  it('shows the imperial equivalent in imperial', () => {
    render(<MemoryRouter><ProductList products={[passata]} system="imperial" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).toHaveTextContent('1 lb 9 oz')
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).not.toHaveTextContent('700 g')
  })
})

describe('ProductList rows (WP11)', () => {
  it('is a ListGroup of ListRows: name, "Ingredient · pack size", chevron; no Tile bullets', () => {
    const p = { ...passata, ingredientName: 'Tomato passata' }
    render(<MemoryRouter><ProductList products={[p]} /></MemoryRouter>)
    const list = screen.getByRole('list', { name: 'Products' })
    expect(list).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).toHaveTextContent('Tomato passata · 700 g')
  })

  it('marks an archived Product with an Archived chip (trailing) and keeps active rows unmarked', () => {
    const old = { ...passata, id: 2, name: 'Old', archived: true }
    render(<MemoryRouter><ProductList products={[passata, old]} /></MemoryRouter>)
    const row = screen.getByRole('link', { name: 'Old' }).closest('li')!
    expect(row).toHaveTextContent('Archived')
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).not.toHaveTextContent('Archived')
  })

  it('says "No archived Products" instead of the first-run text when showing archived only', () => {
    render(<MemoryRouter><ProductList products={[]} showingArchived /></MemoryRouter>)
    expect(screen.getByText('No archived Products')).toBeInTheDocument()
    expect(screen.queryByText('No Products yet')).toBeNull()
  })
})
