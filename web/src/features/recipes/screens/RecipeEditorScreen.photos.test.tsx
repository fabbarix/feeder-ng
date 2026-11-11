// IM2: the Recipe photo and every Step photo are separate shared ImagePickers, each wired to its own field of the draft.
// (The upload state, errors and busy flags belong to the picker itself, so one picker never affects another.)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
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

const step = (key: string, image = '') => ({ key, text: key, kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image })

beforeEach(() => {
  h.editor = {
    draft: { ...emptyDraft(), name: 'Aioli', image: 'cover1', steps: [step('s1', 'one'), step('s2')] },
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

describe('RecipeEditorScreen: photos', () => {
  it('has one picker for the Recipe and one per Step, each showing its own image id', () => {
    view()
    expect(screen.getByRole('group', { name: recipeStrings.photo })).toHaveAttribute('data-value', 'cover1')
    const steps = screen.getAllByRole('group', { name: recipeStrings.steps.image })
    expect(steps.map((s) => s.getAttribute('data-value'))).toEqual(['one', ''])
  })

  it('has no file input outside the shared picker', () => {
    view()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('a picked Recipe photo updates draft.image only', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: `pick ${recipeStrings.photo}` }))
    const setDraft = h.editor.setDraft as ReturnType<typeof vi.fn>
    expect(setDraft).toHaveBeenCalledTimes(1)
    const apply = setDraft.mock.calls[0]![0] as (d: Record<string, unknown>) => Record<string, unknown>
    expect(apply({ ...emptyDraft(), image: 'cover1' })).toMatchObject({ image: PICKED_ID })
  })

  it('removing the Recipe photo clears draft.image', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: `remove ${recipeStrings.photo}` }))
    const apply = (h.editor.setDraft as ReturnType<typeof vi.fn>).mock.calls[0]![0] as (d: Record<string, unknown>) => Record<string, unknown>
    expect(apply({ ...emptyDraft(), image: 'cover1' })).toMatchObject({ image: '' })
  })

  it('a picked Step photo goes to that Step through setSteps and leaves the Recipe photo alone', async () => {
    view()
    await userEvent.click(screen.getAllByRole('button', { name: `pick ${recipeStrings.steps.image}` })[1]!)
    const setSteps = h.editor.setSteps as ReturnType<typeof vi.fn>
    expect(setSteps).toHaveBeenCalledTimes(1)
    const next = setSteps.mock.calls[0]![0] as { key: string; image: string }[]
    expect(next.map((s) => [s.key, s.image])).toEqual([['s1', 'one'], ['s2', PICKED_ID]])
    expect(h.editor.setDraft).not.toHaveBeenCalled()
  })
})
