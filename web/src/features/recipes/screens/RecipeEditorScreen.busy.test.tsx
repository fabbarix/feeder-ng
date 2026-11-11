// PE: Save Recipe is disabled while the Recipe photo or any Step photo is uploading (ImagePicker onBusyChange). One picker finishing
// does not unlock Save while another still uploads. (A NEW file: the production edit in RecipeEditorScreen/PhotoPicker/StepPhoto waits for team SORT.)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'
import { recipeStrings } from '../strings'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const step = (key: string) => ({ key, text: key, kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' })

beforeEach(() => {
  h.editor = {
    draft: { ...emptyDraft(), name: 'Aioli', steps: [step('s1')] },
    setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <RecipeEditorScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
})
const saves = () => screen.getAllByRole('button', { name: recipeStrings.save })

describe('RecipeEditorScreen: photo busy', () => {
  it('disables Save while the Recipe photo uploads, enables it after', async () => {
    expect(saves().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: `start upload ${recipeStrings.photo}` }))
    expect(saves().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${recipeStrings.photo}` }))
    expect(saves().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('disables Save while a Step photo uploads', async () => {
    await userEvent.click(screen.getByRole('button', { name: `start upload ${recipeStrings.steps.image}` }))
    expect(saves().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${recipeStrings.steps.image}` }))
    expect(saves().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('stays disabled until BOTH pickers are done', async () => {
    await userEvent.click(screen.getByRole('button', { name: `start upload ${recipeStrings.photo}` }))
    await userEvent.click(screen.getByRole('button', { name: `start upload ${recipeStrings.steps.image}` }))
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${recipeStrings.photo}` }))
    expect(saves().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${recipeStrings.steps.image}` }))
    expect(saves().every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })
})
