// PE: the Ingredient list draws its Picture through the shared ui/Thumb (the empty slot is Thumb's, not a local span).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { IngredientList } from './IngredientList'

const flour: Ingredient = { id: 1, name: 'flour', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: 'a'.repeat(32), imageUrl: `/api/images/${'a'.repeat(32)}` }
const salt: Ingredient = { id: 2, name: 'salt', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: '', imageUrl: '' }
const leading = (name: string) => screen.getByRole('button', { name }).closest('li')!.querySelector('.list-row__leading')!

describe('IngredientList: shared Thumb', () => {
  it('every row leads with a Thumb of size 40, with the image when there is a Picture', () => {
    render(<IngredientList ingredients={[flour, salt]} system="metric" onOpen={() => {}} />)
    expect(leading('Flour').firstElementChild).toHaveClass('thumb')
    expect(leading('Flour').querySelector('.thumb img')).toHaveAttribute('src', flour.imageUrl)
    expect(leading('Salt').firstElementChild).toHaveClass('thumb')
    expect(leading('Salt').firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws no RecipeThumb tile (no generated initial or tag icon)', () => {
    render(<IngredientList ingredients={[flour, salt]} system="metric" onOpen={() => {}} />)
    expect(document.querySelector('.recipe-thumb, .ingredient-row__no-picture')).toBeNull()
  })
})
