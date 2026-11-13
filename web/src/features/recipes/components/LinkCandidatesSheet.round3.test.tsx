import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, renderWithProviders } from '../../../lib/baseRecipes/test-utils'
import { LinkCandidatesSheet } from './LinkCandidatesSheet'

describe('LinkCandidatesSheet: a failed load', () => {
  it('says the lines could not be loaded, not an empty list and not a silent close', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': refusal(500, 'internal') })
    const onClose = vi.fn()
    renderWithProviders(<LinkCandidatesSheet open baseRecipe={{ id: 3, name: 'Béchamel', ingredientId: 30 }} onClose={onClose} />)
    expect(await screen.findByText('The lines could not be loaded. Try again.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
