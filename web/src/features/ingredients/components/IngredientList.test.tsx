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

describe('IngredientList', () => {
  it('shows a button per Ingredient with its Base Unit chip', () => {
    render(<IngredientList ingredients={list} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /garlic/ })).toHaveTextContent('g')
    expect(screen.getByRole('button', { name: /milk/ })).toHaveTextContent('ml')
    expect(screen.getByRole('button', { name: /egg/ })).toHaveTextContent('piece')
  })
  it('shows the Shelf Life chip only when set', () => {
    render(<IngredientList ingredients={list} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /garlic/ })).toHaveTextContent('30 days')
    expect(screen.getByRole('button', { name: /milk/ })).not.toHaveTextContent('day')
  })
  it('labels Base Units in the User\'s system', () => {
    render(<IngredientList ingredients={list} system="imperial" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /garlic/ })).toHaveTextContent('oz')
    expect(screen.getByRole('button', { name: /milk/ })).toHaveTextContent('fl oz')
  })
  it('opens the clicked Ingredient', async () => {
    const onOpen = vi.fn()
    render(<IngredientList ingredients={list} system="metric" onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /milk/ }))
    expect(onOpen).toHaveBeenCalledWith(2)
  })
})
