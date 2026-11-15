// B5-LOW: the editor tells the Household's Frozen Use-by (read from the Household settings). B9-37 (RX-02, RX-10): it is named in the
// one footnote under the Planning overrides, with the Household's Cool-down and Leftover Use-by.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
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
import { EditorRouter, safeEditorFields } from './RecipeEditorScreen.safe.harness.test-helper'

beforeEach(() => {
  h.editor = {
    ...safeEditorFields(),
    draft: { ...emptyDraft(), name: 'Aioli' }, setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(), addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})
afterEach(() => vi.unstubAllGlobals())

describe('RecipeEditorScreen: Frozen Use-by', () => {
  it("names the Household's default in the Planning footnote", async () => {
    window.localStorage.clear()
    mockApi({ 'GET /api/household/settings': { frozenUseByDays: 60, defaultCooldownDays: 5, defaultLeftoverUseByDays: 2 } })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditorRouter initialEntries={['/recipes/new']}>
          <Route path="/recipes/new" element={<RecipeEditorScreen />} />        </EditorRouter>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Planning/ }))
    expect(await screen.findByText(/Cool-down 5 days, Leftover Use-by 2 days, Frozen Use-by 60 days\./)).toBeVisible()
  })
})
