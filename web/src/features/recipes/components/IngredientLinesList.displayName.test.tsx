// R2-1 (S-02, recipes part): ingredient names on Recipe detail use the display form ("Garlic"); the stored name stays lower case.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import type { RecipeLine } from '../types'
import { IngredientLinesList } from './IngredientLinesList'

const lines: RecipeLine[] = [
  { ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: false, note: '' },
  { ingredientId: 8, ingredient: 'olive oil', quantity: 2, unit: 'tbsp', optional: false, note: '' },
]

describe('IngredientLinesList: display names (S-02)', () => {
  it('capitalises the first letter only', () => {
    render(<IngredientLinesList lines={lines} refs={new Map([[7, garlic]])} system="metric" />)
    expect(screen.getByText('Garlic')).toBeInTheDocument()
    expect(screen.getByText('Olive oil')).toBeInTheDocument()
    expect(screen.queryByText('garlic')).toBeNull()
  })
  it('uses the ingredients feature displayName (one rule for every screen)', async () => {
    const { readSource } = await import('../../plan/test-css')
    const src = readSource('features/recipes/components/IngredientLinesList.tsx')
    expect(src).toMatch(/displayName/)
    expect(src).toMatch(/from '\.\.\/\.\.\/ingredients\/lib\/names'/)
  })
})
