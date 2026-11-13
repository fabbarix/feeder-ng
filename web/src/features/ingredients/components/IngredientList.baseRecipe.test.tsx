import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { IngredientList } from './IngredientList'

// BR-D: a Base recipe's Ingredient carries a badge in the Ingredients list.
const list: Ingredient[] = [
  { id: 1, name: 'milk', baseUnit: 'ml', shelfLifeDays: null, conversions: [] },
  { id: 2, name: 'béchamel', baseUnit: 'ml', shelfLifeDays: 4, conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } },
  { id: 3, name: 'béchamel', baseUnit: 'ml', shelfLifeDays: null, conversions: [] },
]

describe('IngredientList: Base recipe badge', () => {
  it('badges the Base recipe\'s Ingredient and not a plain one, even with the same name', () => {
    render(<IngredientList ingredients={list} system="metric" onOpen={() => {}} />)
    const rows = screen.getAllByRole('button', { name: 'Béchamel' }).map((b) => b.closest('li') as HTMLElement)
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.textContent?.includes('Base recipe'))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Milk' }).closest('li')).not.toHaveTextContent('Base recipe')
  })
  it('uses the Chip primitive (a tag), not bare text', () => {
    render(<IngredientList ingredients={[list[1]!]} system="metric" onOpen={() => {}} />)
    expect(screen.getByText('Base recipe').closest('.chip')).not.toBeNull()
  })
})
