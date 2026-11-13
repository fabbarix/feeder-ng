// H5: the Supplies list rows: the Base Unit and, when set, the Restock level; never a Shelf Life.
// The shared ListRow names its stretched target after the title and renders the meta beside it in the row's `li`
// (as IngredientList.test does), so the meta is checked in the `li` and the target's name stays the plain name.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
import { IngredientList } from './IngredientList'

const row = (name: string) => screen.getByRole('button', { name }).closest('li')

describe('IngredientList with Supplies', () => {
  it('shows the Base Unit and the Restock level of a Supply', () => {
    render(<IngredientList ingredients={[toiletPaperJSON, { ...dishSoapJSON, restockLevel: null }]} system="metric" onOpen={() => {}} />)
    expect(row('Toilet paper')).toHaveTextContent('piece · restocks below 6 pieces')
    expect(row('Dish soap')).toHaveTextContent('ml')
    expect(row('Dish soap')).not.toHaveTextContent(/restock|keeps/)
  })
  it('keeps "g · keeps 30 days" for food', () => {
    render(<IngredientList ingredients={[garlicJSON]} system="metric" onOpen={() => {}} />)
    expect(row('Garlic')).toHaveTextContent('g · keeps 30 days')
  })
})
