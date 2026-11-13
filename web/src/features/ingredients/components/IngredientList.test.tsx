import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../types'
import { IngredientList } from './IngredientList'

const list: Ingredient[] = [
  { id: 1, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, conversions: [] },
  { id: 2, name: 'milk', baseUnit: 'ml', shelfLifeDays: null, conversions: [] },
  { id: 3, name: 'egg', baseUnit: 'piece', shelfLifeDays: null, conversions: [] },
]

describe('IngredientList (ListRows, 5.15)', () => {
  it('is a named list with a tappable row per Ingredient, names capitalised', () => {
    render(<IngredientList ingredients={list} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('list', { name: 'Ingredients' })).toBeInTheDocument()
    for (const name of ['Garlic', 'Milk', 'Egg']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'garlic' })).toBeNull()
  })
  it('shows the Base Unit and the Shelf Life on one meta line ("g · keeps 30 days")', () => {
    render(<IngredientList ingredients={list} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: 'Garlic' }).closest('li')).toHaveTextContent('g · keeps 30 days')
    // DS-A (system.md §7): a row without a Picture shows the monogram ("M") before the name
    expect(screen.getByRole('button', { name: 'Milk' }).closest('li')).toHaveTextContent(/^MMilkml$/)
    expect(screen.getByRole('button', { name: 'Egg' }).closest('li')).toHaveTextContent('piece')
  })
  it('labels Base Units in the User\'s system', () => {
    render(<IngredientList ingredients={list} system="imperial" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: 'Garlic' }).closest('li')).toHaveTextContent('oz')
    expect(screen.getByRole('button', { name: 'Milk' }).closest('li')).toHaveTextContent('fl oz')
  })
  it('opens the clicked Ingredient', async () => {
    const onOpen = vi.fn()
    render(<IngredientList ingredients={list} system="metric" onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(onOpen).toHaveBeenCalledWith(2)
  })
})
