// R2-3 (S-02, Products part): the Ingredient in the meta line is shown with displayName ("Tomato passata"), the data stays as stored.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Product } from '../types'
import { ProductList } from './ProductList'

const p = { id: 1, name: 'Passata', packSize: 700, baseUnit: 'g', ingredientName: 'tomato passata' } as Product

describe('ProductList Ingredient names (S-02)', () => {
  it('capitalises the stored lower-case Ingredient name in the meta line', () => {
    render(<MemoryRouter><ProductList products={[p]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).toHaveTextContent('Tomato passata · 700 g')
    expect(screen.getByRole('link', { name: 'Passata' }).closest('li')).not.toHaveTextContent('tomato passata')
  })
})
