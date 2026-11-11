// IM3: Import Review says when an import will give an existing Ingredient the picture of the Recipe File:
// "Adds a picture to Garlic". The server decides (match.addsImage); the name is the Ingredient that gets it.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { match } from '../fixtures.test-helper'
import { IngredientMatchTile } from './IngredientMatchTile'

const props = { onUseExisting: vi.fn(), onCreate: vi.fn() }
const exact = (over = {}) =>
  match({ key: 'garlic', name: 'garlic', status: 'exact', match: { id: 3, name: 'garlic', baseUnit: 'g' }, effective: { key: 'garlic', action: 'use', ingredientId: 3 }, ...over })

describe('IngredientMatchTile: adds a picture', () => {
  it('says "Adds a picture to Garlic" for an exact match the file gives a picture', () => {
    render(<IngredientMatchTile match={exact({ addsImage: true })} {...props} />)
    expect(screen.getByText('Adds a picture to Garlic')).toBeInTheDocument()
  })
  it('names the Ingredient capitalised through displayName', () => {
    render(<IngredientMatchTile match={exact({ name: 'garlik', match: { id: 3, name: 'wild garlic', baseUnit: 'g' }, addsImage: true })} {...props} />)
    expect(screen.getByText('Adds a picture to Wild garlic')).toBeInTheDocument()
  })
  it('names the suggested Ingredient the User chose, not the file name', () => {
    const m = match({
      key: 'garlik', name: 'garlik', status: 'suggested',
      suggestions: [{ id: 9, name: 'garlic', baseUnit: 'g', score: 0.8 }],
      effective: { key: 'garlik', action: 'use', ingredientId: 9 }, addsImage: true,
    })
    render(<IngredientMatchTile match={m} {...props} />)
    expect(screen.getByText('Adds a picture to Garlic')).toBeInTheDocument()
  })
  it('says nothing when the server does not flag the row (it has a picture, the file has none, or a new Ingredient is created)', () => {
    for (const m of [exact(), exact({ addsImage: false }), match({ key: 'saffron', name: 'saffron', addsImage: false })]) {
      const { unmount } = render(<IngredientMatchTile match={m} {...props} />)
      expect(screen.queryByText(/Adds a picture/)).not.toBeInTheDocument()
      unmount()
    }
  })
  it('is plain text, not a control (nothing to answer)', () => {
    render(<IngredientMatchTile match={exact({ addsImage: true })} {...props} />)
    expect(screen.queryByRole('button', { name: /Adds a picture/ })).not.toBeInTheDocument()
  })
})
