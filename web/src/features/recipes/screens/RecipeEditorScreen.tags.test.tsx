// TG-RW: the Recipe editor's Tag field takes its Tags and colours from useRecipeTags (docs/dev/design/tg-rw.md 4).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }))
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({
    known: [{ name: 'roast', recipes: 3 }, { name: 'quick', recipes: 1 }],
    colourOf: (n: string) => ({ roast: 'tomato', quick: 'sky' })[n.toLowerCase()],
  }),
}))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const draft = (tags: string[]): RecipeDraft => ({
  ...emptyDraft(), name: 'Rice', courseIds: [1], tags,
  lines: [{ key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }],
  steps: [{ key: 's1', text: 'Boil', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' }],
})
const view = (tags: string[]) => {
  h.editor = {
    draft: draft(tags), setDraft: vi.fn(), errors: {}, isLoading: false, loadError: null, saving: false, save: vi.fn(), courseLoss: null,
    dirty: false, pickCreatedIngredient: vi.fn(), addLine: vi.fn(), removeLine: vi.fn(), moveLine: vi.fn(), uploading: false,
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes><Route path="/recipes/new" element={<RecipeEditorScreen />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('RecipeEditorScreen Tag field', () => {
  it('colours the Recipe\'s saved Tags and marks an unsaved one New', () => {
    view(['roast', 'fresh'])
    expect(screen.getByRole('button', { name: 'Remove Tag roast' })).toHaveAttribute('data-tag-colour', 'tomato')
    expect(screen.getByRole('button', { name: 'Remove Tag fresh' })).not.toHaveAttribute('data-tag-colour')
    expect(screen.getByRole('button', { name: 'Remove Tag fresh' })).toHaveTextContent('New')
  })
  it('offers the Household\'s Tags with their dots while typing', async () => {
    view([])
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'qu')
    const option = within(screen.getByRole('listbox', { name: 'Existing Tags' })).getByRole('option')
    expect(option.querySelector('.tag-dot')).toHaveAttribute('data-tag-colour', 'sky')
  })
})
