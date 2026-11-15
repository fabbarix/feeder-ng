import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comeBack, goOffline, mountScreen } from '../test/offlineHarness'
import { RecipesScreen } from './recipes/screens/RecipesScreen'

// B9-20 (RES-02) BDD: "Recipes come back by themselves when the connection returns".
beforeEach(() => goOffline())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Recipes offline then online', () => {
  it('the LoadState turns into the list by itself, with no tap and no reload', async () => {
    const { container } = mountScreen(<RecipesScreen />, '/recipes')
    expect(await screen.findByRole('heading', { name: 'Your Recipes aren’t on this phone yet' })).toBeInTheDocument()
    comeBack((url) => (url.startsWith('/api/recipes') ? [{ id: 1, name: 'Pancakes', yield: 4, readyMeal: false, courseIds: [], wholeMeal: false, tags: [], imageUrl: '', archived: false, totalMinutes: 20, advanceMinutes: 0, lastCookedOn: null }] : []))
    expect(await screen.findByText('Pancakes', {}, { timeout: 4000 })).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.load-state')).toBeNull())
  })
})
