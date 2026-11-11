// PP: a Product with a Picture shows it as a small leading thumb in the list, so "Mutti" and "own-brand" passata can be told apart at a glance.
// Same slot, same size and same behaviour as the Ingredient list (IM2), through the one shared thumb.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Product } from '../types'
import { ProductList } from './ProductList'

const pic = 'a'.repeat(32)
const mutti = { id: 1, name: 'Mutti passata', packSize: 700, baseUnit: 'g', image: pic, imageUrl: `/api/images/${pic}` } as Product
const own = { id: 2, name: 'Own-brand passata', packSize: 700, baseUnit: 'g', image: '', imageUrl: '' } as Product
const renderList = (products: Product[]) => render(<MemoryRouter><ProductList products={products} /></MemoryRouter>)
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('li')!

describe('ProductList: pictures', () => {
  it('draws the picture of a Product that has one, as a decorative 40 px thumb (the name is next to it)', () => {
    renderList([mutti, own])
    const img = rowOf('Mutti passata').querySelector('img')
    expect(img).toHaveAttribute('src', mutti.imageUrl)
    expect(img).toHaveAttribute('alt', '')
    expect(rowOf('Mutti passata').querySelector('.list-row__leading')!.firstElementChild).toHaveAttribute('data-size', '40')
  })

  it('draws no picture for a Product without one, but keeps the same leading slot so the names line up', () => {
    renderList([mutti, own])
    const without = rowOf('Own-brand passata')
    expect(without.querySelector('img')).toBeNull()
    expect(without.querySelector('.list-row__leading')).not.toBeNull()
    expect(without.getAttribute('data-height')).toBe(rowOf('Mutti passata').getAttribute('data-height'))
    expect(without.querySelector('.list-row__leading')!.firstElementChild).toHaveAttribute('data-size', '40')
  })

  it('an Ingredient page list (showIngredient off) and an archived Product use the same thumb', () => {
    render(<MemoryRouter><ProductList products={[{ ...mutti, archived: true }]} showIngredient={false} /></MemoryRouter>)
    const row = rowOf('Mutti passata')
    expect(row.querySelector('img')).toHaveAttribute('src', mutti.imageUrl)
    expect(row).toHaveTextContent('Archived')
  })

  it('keeps the link and the pack size meta', () => {
    renderList([mutti])
    expect(screen.getByRole('link', { name: 'Mutti passata' })).toHaveAttribute('href', '/products/1')
    expect(rowOf('Mutti passata')).toHaveTextContent('700 g')
  })
})
