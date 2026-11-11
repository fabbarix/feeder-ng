// PE: the Product list draws its Picture through the shared ui/Thumb (the feature-local PictureThumb is gone).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Product } from '../types'
import { ProductList } from './ProductList'

const pic = 'a'.repeat(32)
const mutti = { id: 1, name: 'Mutti passata', packSize: 700, baseUnit: 'g', image: pic, imageUrl: `/api/images/${pic}` } as Product
const own = { id: 2, name: 'Own-brand passata', packSize: 700, baseUnit: 'g', image: '', imageUrl: '' } as Product
const leading = (name: string) => screen.getByRole('link', { name }).closest('li')!.querySelector('.list-row__leading')!

describe('ProductList: shared Thumb', () => {
  it('leads every row with a Thumb of size 40; the image only when there is a Picture', () => {
    render(<MemoryRouter><ProductList products={[mutti, own]} /></MemoryRouter>)
    expect(leading('Mutti passata').firstElementChild).toHaveClass('thumb')
    expect(leading('Mutti passata').querySelector('img')).toHaveAttribute('src', mutti.imageUrl)
    expect(leading('Own-brand passata').firstElementChild).toHaveClass('thumb')
    expect(leading('Own-brand passata').querySelector('img')).toBeNull()
    expect(document.querySelector('.picture-thumb')).toBeNull()
  })
})
