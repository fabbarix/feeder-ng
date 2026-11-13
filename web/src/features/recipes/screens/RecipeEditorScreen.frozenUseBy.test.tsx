// B5-LOW: the editor tells the Household's Frozen Use-by under the Recipe field (read from the Household settings).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../settings/test-utils'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map(), isLoading: false }) }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

beforeEach(() => {
  h.editor = {
    draft: { ...emptyDraft(), name: 'Aioli' }, setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(), addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})
afterEach(() => vi.unstubAllGlobals())

describe('RecipeEditorScreen: Frozen Use-by', () => {
  it("names the Household's default in the helper", async () => {
    mockApi({ 'GET /api/household/settings': { frozenUseByDays: 60 } })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/recipes/new']}>
          <Routes><Route path="/recipes/new" element={<RecipeEditorScreen />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText("Blank uses the Household's 60 days.")).toBeInTheDocument()
  })
})
