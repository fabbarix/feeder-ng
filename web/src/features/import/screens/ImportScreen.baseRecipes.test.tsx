// BR-E: Base recipes in the Import Review screen (design §11.3, §13). The review hook is mocked like the other screen tests; the Base recipe
// hook, the dialogs and the follow-ups are real, over a stubbed fetch. There is no web BDD harness: these cover the BDD scenarios of §16
// (one per answer, Confirm waits for an answer, bulk link after Confirm). RED until the screen shows them.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, newQueryClient, summaryJSON, candidateJSON } from '../../../lib/baseRecipes/test-utils'
import { QueryClientProvider } from '@tanstack/react-query'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { applied, baseLine, confirmed, fileSuggestion, plannableSuggestion, takeOver, useSuggestion } from '../fixtures.baseRecipes.test-helper'
import { courseExtras, match, plan, recipe, reviewExtras } from '../fixtures.test-helper'
import type { UseImportReview } from '../hooks/useImportReview'

const h = vi.hoisted(() => ({ review: {} as UseImportReview }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => h.review }))
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: [], isAdmin: false, isPending: false }) }))
vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))

import { ImportScreen } from './ImportScreen'

const path = '$.recipes[0].ingredients[1]'
function state(over: Partial<UseImportReview>): UseImportReview {
  return {
    phase: 'reviewing', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [], courses: [] }, error: undefined, busy: false, stale: false,
    result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
    confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...courseExtras(), ...over,
  }
}
const view = () =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <ImportScreen />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
const recipes = [recipe({ index: 0, name: 'Lasagne' })]
const open = (over = {}) =>
  plan({
    ready: true,
    recipes,
    baseRecipeLines: [baseLine({ suggestions: [useSuggestion(3, 'Béchamel', false), fileSuggestion(1, 'Roux', false), plannableSuggestion(7, 'Pesto')] })],
    ...over,
  })

beforeEach(() => {
  mockApi({ 'POST /api/recipes/7/to-base?dryRun=1': { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 } })
  h.review = state({ plan: open() })
})

describe('ImportScreen, Base recipe line tiles', () => {
  it('has no Base recipe area when no line is marked or matched', () => {
    h.review = state({ plan: plan({ recipes }) })
    view()
    expect(screen.queryByRole('heading', { name: 'Is this another recipe?' })).toBeNull()
  })

  it('shows one tile per marked or matched line, after the Ingredient tiles and before a Recipe conflict', () => {
    h.review = state({
      plan: open({ ingredients: [match({ key: 'onion' })], recipes: [recipe({ index: 0, name: 'Lasagne', status: 'conflict', resolved: false })] }),
    })
    view()
    const tile = screen.getByRole('region', { name: '500 ml béchamel' })
    const onion = screen.getByRole('region', { name: 'Ingredients' })
    const conflict = screen.getByRole('heading', { name: 'Lasagne already exists' })
    expect(onion.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tile.compareDocumentPosition(conflict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('groups the tiles in a labelled area', () => {
    view()
    expect(screen.getByRole('region', { name: 'Base recipes' })).toContainElement(screen.getByRole('region', { name: '500 ml béchamel' }))
  })

  it('shows the Problems of a tile on the tile, once, and not in the generic list', () => {
    h.review = state({ plan: open({ problems: [{ path, code: 'base_recipe_cycle', message: 'Roux calls for Béchamel, which calls for Roux' }] }) })
    view()
    const tile = screen.getByRole('region', { name: '500 ml béchamel' })
    expect(within(tile).getByRole('alert')).toHaveTextContent('Roux calls for Béchamel, which calls for Roux')
    expect(screen.getAllByText(/Roux calls for Béchamel/)).toHaveLength(1)
  })
})

describe('ImportScreen, the answers', () => {
  it.each([
    ['Use Base recipe Béchamel', { action: 'use', recipeId: 3 }],
    ['Use Roux from this import', { action: 'file', recipeIndex: 1 }],
    ['Fill in later', { action: 'create' }],
    ['Read it next', { action: 'create', readNext: true }],
    ['Keep it as an Ingredient', { action: 'keep' }],
  ])('%s answers the tile by its path', async (label, decision) => {
    view()
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(label) }))
    expect(h.review.chooseBaseRecipeLine).toHaveBeenCalledWith(path, decision)
  })

  it('Turn Pesto into a Base recipe: the convert dialog asks first; confirming answers convert with the Yield', async () => {
    view()
    await userEvent.click(screen.getByRole('radio', { name: /Turn Pesto into a Base recipe/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Turn Pesto into a Base recipe?' })
    expect(h.review.chooseBaseRecipeLine).not.toHaveBeenCalled()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Turn into a Base recipe' }))
    expect(h.review.chooseBaseRecipeLine).toHaveBeenCalledWith(path, { action: 'convert', recipeId: 7, yield: 500, yieldUnit: 'ml' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Cancel on the convert dialog goes back to the tile with nothing chosen', async () => {
    view()
    await userEvent.click(screen.getByRole('radio', { name: /Turn Pesto into a Base recipe/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(h.review.chooseBaseRecipeLine).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('answers the take-over ask of a tile', async () => {
    h.review = state({
      plan: open({
        baseRecipeLines: [baseLine({ effective: { action: 'create' }, resolved: true })],
        takeOvers: [takeOver({ resolved: false })],
      }),
    })
    view()
    await userEvent.click(screen.getByRole('radio', { name: 'No, keep it apart' }))
    expect(h.review.chooseTakeOver).toHaveBeenCalledWith(path, false)
  })
})

describe('ImportScreen, Confirm waits for an answer', () => {
  it('an unanswered tile disables Confirm even when the plan says ready, and says which', () => {
    view()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByText('1 thing left to answer')).toBeInTheDocument()
    expect(screen.getByText('Confirm needs an answer to "500 ml béchamel"')).toBeInTheDocument()
  })

  it('an exact match is preselected but the User still confirms: Confirm is enabled once every tile has its answer', async () => {
    h.review = state({
      plan: open({ baseRecipeLines: [baseLine({ suggestions: [useSuggestion(3, 'Béchamel')], effective: { action: 'use', recipeId: 3 }, resolved: true })] }),
    })
    view()
    expect(screen.getByRole('radio', { name: /Use Base recipe Béchamel/ })).toBeChecked()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(h.review.confirm).toHaveBeenCalledOnce()
  })
})

describe('ImportScreen, the refusals of Confirm', () => {
  it('names a cycle at the top of the review, above the tiles, as an alert', () => {
    h.review = state({
      plan: open(),
      confirmProblem: { kind: 'cycle', message: 'Béchamel calls for Roux, which calls for Béchamel', path: ['Béchamel', 'Roux', 'Béchamel'] },
    })
    view()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Béchamel calls for Roux, which calls for Béchamel')
    const tile = screen.getByRole('region', { name: '500 ml béchamel' })
    expect(alert.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows base_recipe_kind and import_not_ready the same way', () => {
    h.review = state({ plan: open(), confirmProblem: { kind: 'validation', reason: 'base_recipe_kind', message: 'A Base recipe cannot be planned.' } })
    view()
    expect(screen.getByRole('alert')).toHaveTextContent('A Base recipe cannot be planned.')
  })

  it('opens the take-over dialog on a 409 and sends its answer to the hook', async () => {
    h.review = state({
      plan: open(),
      takeOverPrompt: {
        path,
        baseName: 'Béchamel',
        ask: { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 11, name: 'Moussaka' }], stockLots: 1, convertible: true },
      },
    })
    view()
    const dialog = screen.getByRole('dialog', { name: 'Béchamel (Base recipe) has the name of an Ingredient. Take it over?' })
    expect(within(dialog).getByText(/Moussaka calls for it/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, take it over' }))
    expect(h.review.answerTakeOverPrompt).toHaveBeenCalledWith(true)
  })

  it('No keeps it apart; Escape cancels and saves nothing', async () => {
    h.review = state({
      plan: open(),
      takeOverPrompt: { path, baseName: 'Béchamel', ask: { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true } },
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it apart' }))
    expect(h.review.answerTakeOverPrompt).toHaveBeenCalledWith(false)
    await userEvent.keyboard('{Escape}')
    expect(h.review.cancelTakeOverPrompt).toHaveBeenCalled()
  })
})

describe('ImportScreen, after Confirm', () => {
  const done = (recipesDone: ReturnType<typeof confirmed>['recipes']) => state({ phase: 'done', plan: undefined, result: confirmed(recipesDone) })

  it('offers "Read Béchamel now" for a Base recipe created to be read next', async () => {
    mockApi({ 'GET /api/recipes/3': summaryJSON({ id: 3, name: 'Béchamel', baseIngredientId: 30 }), 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [] } })
    h.review = done([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line: path, readNext: true })])
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Read Béchamel now' }))
    expect(h.review.startReadNext).toHaveBeenCalledWith({ recipeId: 3, name: 'Béchamel', line: path })
  })

  it('opens the bulk link sheet for each Base recipe the import created, with nothing ticked', async () => {
    mockApi({
      'GET /api/recipes/3': summaryJSON({ id: 3, name: 'Béchamel', baseIngredientId: 30 }),
      'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Moussaka' })] },
    })
    h.review = done([applied(), applied({ index: 1, id: 3, name: 'Béchamel', baseRecipe: true, line: path })])
    view()
    expect(await screen.findByText('1 Recipe uses an Ingredient named béchamel. Link it to this Base recipe?')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Moussaka/ })).not.toBeChecked()
  })

  it('still says what was imported and offers Open Recipes', () => {
    mockApi({})
    h.review = done([applied()])
    view()
    expect(screen.getByText('Imported 1 Recipe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Recipes' })).toBeInTheDocument()
  })
})

describe('ImportScreen, reading the created Base recipe', () => {
  it('after "Read Béchamel now" the Read step says which Base recipe it is for and takes the focus', () => {
    h.review = state({ phase: 'source', plan: undefined, readNextFor: { recipeId: 3, name: 'Béchamel', line: path } })
    view()
    expect(screen.getByText('Reading Béchamel. Its review will offer to replace the empty Base recipe.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toHaveFocus()
  })

  it('says nothing about it for an ordinary import', () => {
    h.review = state({ phase: 'source', plan: undefined })
    view()
    expect(screen.queryByText(/Its review will offer to replace/)).toBeNull()
  })
})
