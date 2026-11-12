// Sort-drag: the Recipe editor reorders ingredient lines and Steps (docs/dev/design/sort-drag.md section 6).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }),
}))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes>
          <Route path="/recipes/new" element={<RecipeEditorScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const stepOf = (key: string, text: string) => ({ key, text, kind: 'active' as const, durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' })

beforeEach(() => {
  h.editor = {
    draft: {
      ...emptyDraft(), name: 'Aioli',
      lines: [
        { key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' },
        { key: 'l2', ingredientId: 8, ingredientName: 'flour', quantity: '100', unit: 'g', optional: false, note: '' },
      ],
      steps: [stepOf('s1', 'Crush'), stepOf('s2', 'Mix')],
    },
    setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn().mockResolvedValue({ id: 11 }), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(), moveLine: vi.fn(),
  }
})

describe('RecipeEditorScreen: Add ingredient (L13)', () => {
  it('moves focus to the Ingredient picker of the new line', async () => {
    const lines = (h.editor.draft as { lines: unknown[] }).lines
    h.editor.addLine = vi.fn(() => {
      lines.push({ key: 'l3', ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '' })
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    const boxes = screen.getAllByRole('combobox', { name: 'Ingredient' })
    expect(boxes).toHaveLength(3)
    expect(boxes[2]).toHaveFocus()
  })
})

describe('RecipeEditorScreen: ingredient lines reorder', () => {
  it('each line has a drag handle named for its Ingredient, inside the line row', () => {
    view()
    const lines = document.querySelectorAll<HTMLElement>('.recipe-editor__lines > li')
    expect(lines).toHaveLength(2)
    expect(within(lines[0]!).getByRole('button', { name: 'Reorder garlic' })).toBeInTheDocument()
    expect(within(lines[1]!).getByRole('button', { name: 'Reorder flour' })).toBeInTheDocument()
  })
  it('keyboard: Space, ArrowDown, Space on the first line calls editor.moveLine(0, 1) once', async () => {
    view()
    screen.getByRole('button', { name: 'Reorder garlic' }).focus()
    await userEvent.keyboard(' {ArrowDown} ')
    expect(h.editor.moveLine).toHaveBeenCalledExactlyOnceWith(0, 1)
  })
  it('Escape cancels without touching the draft', async () => {
    view()
    screen.getByRole('button', { name: 'Reorder garlic' }).focus()
    await userEvent.keyboard(' {ArrowDown}{Escape}')
    expect(h.editor.moveLine).not.toHaveBeenCalled()
  })
  it('the line actions menu moves a line too (Move ingredient down on the first)', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    expect(screen.getByRole('menuitem', { name: 'Move ingredient up' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move ingredient down' }))
    expect(h.editor.moveLine).toHaveBeenCalledExactlyOnceWith(0, 1)
  })
  it('Move ingredient up on the second line calls moveLine(1, 0), and its Move down is disabled', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for flour' }))
    expect(screen.getByRole('menuitem', { name: 'Move ingredient down' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move ingredient up' }))
    expect(h.editor.moveLine).toHaveBeenCalledExactlyOnceWith(1, 0)
  })
  it('Remove ingredient still works on a line that has a handle', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient garlic' }))
    expect(h.editor.removeLine).toHaveBeenCalledWith('l1')
  })
})

describe('RecipeEditorScreen: Steps reorder', () => {
  it('keyboard on a Step handle hands the reordered Steps to setSteps', async () => {
    view()
    screen.getByRole('button', { name: 'Reorder Step 1' }).focus()
    await userEvent.keyboard(' {ArrowDown} ')
    expect(h.editor.setSteps).toHaveBeenCalledTimes(1)
    expect(vi.mocked(h.editor.setSteps as (s: { text: string }[]) => void).mock.calls[0]![0].map((s) => s.text)).toEqual(['Mix', 'Crush'])
  })
  it('Move Step down in the Step actions menu still works', async () => {
    view()
    const first = document.querySelector<HTMLElement>('.steps-editor__list > li')!
    await userEvent.click(within(first).getByRole('button', { name: 'Step actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move Step down' }))
    expect(vi.mocked(h.editor.setSteps as (s: { text: string }[]) => void).mock.calls[0]![0].map((s) => s.text)).toEqual(['Mix', 'Crush'])
  })
  it('the lines and the Steps are two separate sortables, each with its own live region', () => {
    view()
    expect(document.querySelectorAll('.sortable__live')).toHaveLength(2)
  })
})

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
