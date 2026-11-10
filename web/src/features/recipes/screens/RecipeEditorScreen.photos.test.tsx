// The Recipe photo and every Step photo have their own upload state (WP9 review): real usePhotoUpload, mocked API.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown>, uploadImage: vi.fn() }))
vi.mock('../api', async (orig) => ({ ...(await orig<Record<string, unknown>>()), recipesApi: { uploadImage: h.uploadImage } }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const step = (key: string) => ({ key, text: key, kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' })
const failed = 'The photo could not be added.'
const png = () => new File(['x'], 'p.png', { type: 'image/png' })
const inputs = () => [...document.querySelectorAll<HTMLInputElement>('input[type=file]')]

beforeEach(() => {
  h.uploadImage.mockReset()
  h.editor = {
    draft: { ...emptyDraft(), name: 'Aioli', steps: [step('s1'), step('s2')] },
    setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <RecipeEditorScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('RecipeEditorScreen: independent photo pickers', () => {
  it('an error on the Recipe photo does not show on the Step photos', async () => {
    h.uploadImage.mockRejectedValue(new Error('x'))
    view()
    expect(inputs()).toHaveLength(3)
    await userEvent.upload(inputs()[0]!, png())
    const photoSection = screen.getByRole('heading', { level: 2, name: 'Photo' }).closest('section')!
    expect(await within(photoSection).findByText(failed)).toBeInTheDocument()
    expect(screen.getAllByText(failed)).toHaveLength(1)
  })
  it('an error on one Step photo shows only on that Step', async () => {
    h.uploadImage.mockRejectedValue(new Error('x'))
    view()
    await userEvent.upload(inputs()[2]!, png())
    await screen.findByText(failed)
    expect(screen.getAllByText(failed)).toHaveLength(1)
    expect(within(screen.getByRole('heading', { level: 2, name: 'Photo' }).closest('section')!).queryByText(failed)).toBeNull()
  })
  it('a Step photo uploading does not disable the Recipe photo or the other Step photo', async () => {
    h.uploadImage.mockReturnValue(new Promise(() => {}))
    view()
    await userEvent.upload(inputs()[1]!, png())
    await waitFor(() => expect(inputs()[1]).toBeDisabled())
    expect(inputs()[0]).toBeEnabled()
    expect(inputs()[2]).toBeEnabled()
  })
  it('the Recipe photo uploading does not disable the Step photos', async () => {
    h.uploadImage.mockReturnValue(new Promise(() => {}))
    view()
    await userEvent.upload(inputs()[0]!, png())
    await waitFor(() => expect(inputs()[0]).toBeDisabled())
    expect(inputs()[1]).toBeEnabled()
    expect(inputs()[2]).toBeEnabled()
  })
})
