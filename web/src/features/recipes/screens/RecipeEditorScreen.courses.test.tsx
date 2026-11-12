// CRS E2: Courses, Whole meal and the Slot Rule confirm in the Recipe editor screen (docs/dev/design/crs-e2.md 3.2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type RecipeDraft } from '../lib/draft'
import type { CourseLoss } from '../types'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown>, args: [] as unknown[], courses: [] as unknown[] }))
vi.mock('../hooks/useRecipeEditor', () => ({
  useRecipeEditor: (...args: unknown[]) => {
    h.args = args
    return h.editor
  },
}))
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: h.courses, isPending: false, isError: false }) }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes>
          <Route path="/recipes/new" element={<RecipeEditorScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const loss: CourseLoss = { courseNames: ['Side'], rules: [{ id: 10, label: 'Friday Dinner · Side = rice' }] }
const draftOf = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...emptyDraft(), name: 'Rice', courseIds: [1],
  lines: [{ key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }],
  steps: [{ key: 's1', text: 'Boil', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' }],
  ...over,
})
const setEditor = (over: Record<string, unknown> = {}, draft = draftOf()) => {
  h.editor = {
    draft, setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null, courseLoss: null,
    save: vi.fn().mockResolvedValue({ id: 11 }), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), moveLine: vi.fn(), setSteps: vi.fn(), renameOffer: null,
    ...over,
  }
}

beforeEach(() => {
  h.courses = courseChoices
  setEditor()
})

describe('RecipeEditorScreen: Courses', () => {
  it('hands the household Courses to the editor hook', () => {
    view()
    expect(h.args[2]).toEqual(courseChoices)
  })
  it('shows the Courses picker in the details with the chosen Courses pressed', () => {
    view()
    const group = screen.getByRole('group', { name: 'Courses' })
    expect(within(group).getByRole('button', { name: /^Main/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /^Side/ })).toHaveAttribute('aria-pressed', 'false')
  })
  it('choosing a Course updates the draft with the ids in household order', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: /^Side/ }))
    const setDraft = h.editor.setDraft as ReturnType<typeof vi.fn>
    const update = setDraft.mock.calls.at(-1)![0] as (d: RecipeDraft) => RecipeDraft
    expect(update(draftOf({ courseIds: [3] })).courseIds).toEqual([2, 3])
  })
  it('shows the Whole meal switch only while the Courses include the main Course', () => {
    view()
    expect(screen.getByRole('switch', { name: 'Whole meal' })).toBeInTheDocument()
  })
  it('hides it when the Courses do not include the main Course', () => {
    setEditor({}, draftOf({ courseIds: [2], wholeMeal: true }))
    view()
    expect(screen.queryByRole('switch', { name: 'Whole meal' })).toBeNull()
  })
  it('puts the editor\'s Courses error on the Courses field', () => {
    setEditor({ errors: { courses: 'courses_empty' } }, draftOf({ courseIds: [] }))
    view()
    expect(screen.getAllByText('Choose at least one Course').length).toBeGreaterThan(0)
  })
})

describe('RecipeEditorScreen: taking a Course off', () => {
  it('saves at once when no Slot Rule is lost', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.editor.save).toHaveBeenCalledOnce()
  })
  it('names the Slot Rules first and does not save until the User confirms', async () => {
    setEditor({ courseLoss: loss })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    const dialog = screen.getByRole('dialog', { name: 'Taking Side off removes a Slot Rule' })
    expect(within(dialog).getByText('Friday Dinner · Side = rice')).toBeInTheDocument()
    expect(h.editor.save).not.toHaveBeenCalled()
  })
  it('saves and goes to the Recipe after "Save and remove"', async () => {
    setEditor({ courseLoss: loss })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save and remove' }))
    expect(h.editor.save).toHaveBeenCalledOnce()
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })
  it('Cancel keeps the User in the editor without saving', async () => {
    setEditor({ courseLoss: loss })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.editor.save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeInTheDocument()
  })
  it('leaves the page\'s own Cancel and Save Recipe out of aria-hidden while the dialog is open', async () => {
    setEditor({ courseLoss: loss })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const pageButtons = screen
      .getAllByRole('button', { hidden: true })
      .filter((b) => ['Cancel', 'Save Recipe'].includes(b.textContent?.trim() ?? '') && !b.closest('dialog'))
    expect(pageButtons.map((b) => b.textContent?.trim()).sort()).toEqual(['Cancel', 'Save Recipe'])
    for (const b of pageButtons) expect(b.closest('[aria-hidden="true"]')).toBeNull()
  })
  it('returns focus to Save Recipe after Cancel', async () => {
    setEditor({ courseLoss: loss })
    view()
    const save = screen.getByRole('button', { name: 'Save Recipe' })
    await userEvent.click(save)
    await act(async () => {
      await userEvent.keyboard('{Escape}')
    })
    expect(save).toHaveFocus()
  })
})
