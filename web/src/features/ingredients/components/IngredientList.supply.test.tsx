// H5: the Supplies list rows: the Base Unit and, when set, the Restock level; never a Shelf Life.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
import { IngredientList } from './IngredientList'

describe('IngredientList with Supplies', () => {
  it('shows the Base Unit and the Restock level of a Supply', () => {
    render(<IngredientList ingredients={[toiletPaperJSON, { ...dishSoapJSON, restockLevel: null }]} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /Toilet paper/ })).toHaveTextContent('piece · restocks below 6 pieces')
    expect(screen.getByRole('button', { name: /Dish soap/ })).toHaveTextContent('ml')
    expect(screen.getByRole('button', { name: /Dish soap/ })).not.toHaveTextContent(/restock|keeps/)
  })
  it('keeps "g · keeps 30 days" for food', () => {
    render(<IngredientList ingredients={[garlicJSON]} system="metric" onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /Garlic/ })).toHaveTextContent('g · keeps 30 days')
  })
})
