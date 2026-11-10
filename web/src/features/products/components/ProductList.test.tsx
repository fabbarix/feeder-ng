import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Product } from '../types'
import { ProductList } from './ProductList'

const passata = { id: 1, name: 'Passata', packSize: 700, baseUnit: 'g' } as Product

describe('ProductList pack sizes (B9)', () => {
  it('shows grams in metric', () => {
    render(<MemoryRouter><ProductList products={[passata]} system="metric" /></MemoryRouter>)
    expect(screen.getByText('700 g')).toBeInTheDocument()
  })
  it('shows the imperial equivalent in imperial', () => {
    render(<MemoryRouter><ProductList products={[passata]} system="imperial" /></MemoryRouter>)
    expect(screen.getByText('1 lb 9 oz')).toBeInTheDocument()
    expect(screen.queryByText('700 g')).not.toBeInTheDocument()
  })
})
