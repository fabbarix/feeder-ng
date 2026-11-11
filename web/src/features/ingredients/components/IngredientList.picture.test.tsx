// IM2: an Ingredient with a picture shows it as a small thumb in the list, so "plain" and "strong" flour can be told apart at a glance.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { IngredientList } from './IngredientList'

const flour: Ingredient = { id: 1, name: 'flour', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: 'a'.repeat(32), imageUrl: `/api/images/${'a'.repeat(32)}` }
const salt: Ingredient = { id: 2, name: 'salt', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: '', imageUrl: '' }

describe('IngredientList: pictures', () => {
  it('draws the picture of an Ingredient that has one, as a decorative 40 px thumb (the name is next to it)', () => {
    render(<IngredientList ingredients={[flour, salt]} system="metric" onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: 'Flour' }).closest('li')!
    expect(row.querySelector('img')).toHaveAttribute('src', flour.imageUrl)
    expect(row.querySelector('img')).toHaveAttribute('alt', '')
  })
  it('draws no picture for an Ingredient without one, but keeps the same leading slot so the names line up', () => {
    render(<IngredientList ingredients={[flour, salt]} system="metric" onOpen={() => {}} />)
    const withPic = screen.getByRole('button', { name: 'Flour' }).closest('li')!
    const without = screen.getByRole('button', { name: 'Salt' }).closest('li')!
    expect(without.querySelector('img')).toBeNull()
    expect(without.querySelector('.list-row__leading')).not.toBeNull()
    expect(without.getAttribute('data-height')).toBe(withPic.getAttribute('data-height'))
    expect(without.querySelector('.list-row__leading')!.firstElementChild).toHaveAttribute('data-size', '40')
  })
})
