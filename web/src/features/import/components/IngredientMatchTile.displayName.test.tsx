// R2-4 S-02 (Import part). NEW FILE, red until the Import edits are applied after WP-E merges (design note, "Deferred Import edits").
// Ingredient names in Import Review are shown through displayName ("aubergine" -> "Aubergine"); the data keeps the stored name.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { match } from '../fixtures.test-helper'
import { IngredientMatchTile } from './IngredientMatchTile'

const props = { onUseExisting: vi.fn(), onCreate: vi.fn() }

describe('IngredientMatchTile names', () => {
  it('shows the file name capitalised', () => {
    render(<IngredientMatchTile match={match({ key: 'aubergine', name: 'aubergine' })} {...props} />)
    expect(screen.getByRole('heading', { name: 'Aubergine' })).toBeInTheDocument()
  })
  it('shows the matched existing Ingredient capitalised', () => {
    render(<IngredientMatchTile match={match({ key: 'tomato', name: 'tomato', status: 'exact', match: { id: 3, name: 'plum tomato', baseUnit: 'g' } })} {...props} />)
    expect(screen.getByText('Plum tomato')).toBeInTheDocument()
  })
  it('suggestion buttons name the Ingredient capitalised', () => {
    const m = match({ key: 'garlik', name: 'garlik', status: 'suggested', suggestions: [{ id: 9, name: 'garlic', baseUnit: 'g', score: 0.8 }], effective: undefined })
    render(<IngredientMatchTile match={m} {...props} />)
    expect(screen.getByRole('button', { name: /Garlic/ })).toBeInTheDocument()
  })
})
