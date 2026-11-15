// B9-28 (RX-01, RX-11, RX-12): the Import screen. The start page offers two paths; the review lists the Recipes it imports, asks its
// questions on rows that can be reached, and the result names what was made. The review is read-only (decision RX 3).
// BDD scenarios of the chapters that are interaction-level are covered here, each test named as the scenario.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { courseExtras, match, plan, preview, prompt, recipe, reviewExtras } from '../fixtures.test-helper'
import type { UseImportReview } from '../hooks/useImportReview'
import type { Plan } from '../types'

const hook = vi.hoisted(() => ({ current: {} as UseImportReview }))
const avail = vi.hoisted(() => ({ enabled: true }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.current }))
vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({
    loading: false, enabled: avail.enabled, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn(),
    message: avail.enabled ? undefined : 'The Recipe Assistant is off.',
  }),
}))
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: [], isAdmin: false, isPending: false }) }))

import { ImportScreen } from './ImportScreen'

function state(over: Partial<UseImportReview>): UseImportReview {
  return {
    phase: 'source', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [], courses: [] }, error: undefined, busy: false, stale: false,
    result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
    confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...courseExtras(), ...over,
  }
}
const view = (at = '/recipes/import') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <ToastProvider>
        <ImportScreen />
      </ToastProvider>
    </MemoryRouter>,
  )
/** The screen's content: ImportScreen is rendered without the shell, so the document body is its main. */
const main = () => document.body

const tikka = recipe({ index: 0, name: 'Chicken tikka traybake' })
const lasagne = recipe({ index: 1, name: 'Lasagne (ready meal)', status: 'conflict', existingId: 77, resolved: false, preview: preview({ readyMeal: true, yield: 2, lines: [], steps: [] }) })
const flour = match({ key: 'flour', name: 'flour', status: 'undefined', resolved: false, effective: undefined })
const reviewPlan = (over: Partial<Plan> = {}): Plan =>
  plan({
    ready: false,
    recipes: [tikka, lasagne],
    ingredients: [match({ key: 'onion', name: 'onion', status: 'exact', effective: { key: 'onion', action: 'use', ingredientId: 1 } }), flour, match({ key: 'salt', name: 'salt', status: 'new' })],
    ...over,
  })

beforeEach(() => {
  avail.enabled = true
  hook.current = state({})
})

describe('RX-11: Import starts with a choice of two paths', () => {
  it('Import offers reading a recipe or importing a Recipe File as two choices', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Import Recipes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Import a Recipe File' })).toBeInTheDocument()
    expect(screen.getByText('Recipe Assistant', { selector: '.tile__overline' })).toBeInTheDocument()
    expect(screen.getByText('Recipe File', { selector: '.tile__overline' })).toBeInTheDocument()
  })
  it('shows no numbered step: no "Step N" overline, before or during a review', () => {
    const { unmount } = view()
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument()
    unmount()
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument()
  })
  it('has exactly one primary button before a review: "Read recipe"', () => {
    view()
    const primaries = [...main().querySelectorAll('button[data-variant="primary"], a[data-variant="primary"]')].map((b) => b.textContent?.trim())
    expect(primaries).toEqual(['Read recipe'])
  })
  it('has no tertiary button inside either tile (every action is an outlined button, R-A)', () => {
    view()
    expect(main().querySelectorAll('.tile [data-variant="tertiary"]')).toHaveLength(0)
  })
  it('describes the Recipe File tile and offers Choose a file, Paste the JSON instead and Copy Agent Prompt as outlined buttons', () => {
    view()
    expect(screen.getByText('A .feeder.json file exported from Feeder, or made by another AI assistant.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument()
    const paste = screen.getByRole('button', { name: 'Paste the JSON instead' })
    expect(paste).toHaveAttribute('data-variant', 'secondary')
    expect(paste).toHaveAttribute('data-size', 'sm')
    const copy = screen.getByRole('button', { name: 'Copy Agent Prompt' })
    expect(copy).toHaveAttribute('data-variant', 'secondary')
    expect(copy).toHaveAttribute('data-size', 'sm')
  })
  it('hides the JSON field until "Paste the JSON instead" opens it, then reviews the pasted text', async () => {
    view()
    expect(screen.queryByRole('textbox', { name: 'Recipe File JSON' })).not.toBeInTheDocument()
    const paste = screen.getByRole('button', { name: 'Paste the JSON instead' })
    expect(paste).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(paste)
    expect(paste).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('textbox', { name: 'Recipe File JSON' }))
    await userEvent.paste('{}')
    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(review)
    expect(hook.current.open).toHaveBeenCalledWith('{}')
  })
  it('Without the Recipe Assistant the Recipe File comes first', () => {
    avail.enabled = false
    view()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Import a Recipe File')).toBeLessThan(headings.indexOf('Read a recipe'))
    expect(screen.getByText('The Recipe Assistant is off.')).toBeInTheDocument()
  })
  it('with the Recipe Assistant on, reading comes first', () => {
    view()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Read a recipe')).toBeLessThan(headings.indexOf('Import a Recipe File'))
  })
  it('#read focuses "Read a recipe"', () => {
    view('/recipes/import#read')
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toHaveFocus()
  })
  it('shows neither tile while reviewing, and offers Start over in the header as a small secondary button', () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    expect(screen.queryByRole('heading', { name: 'Read a recipe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Import a Recipe File' })).not.toBeInTheDocument()
    const start = within(document.querySelector('.page-header') as HTMLElement).getByRole('button', { name: 'Start over' })
    expect(start).toHaveAttribute('data-variant', 'secondary')
    expect(start).toHaveAttribute('data-size', 'sm')
  })
})

describe('RX-01: Import Review lists the Recipes it imports', () => {
  it('Import Review lists each Recipe of the file with its Yield, Ingredients and Steps', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    for (const r of reviewPlan().recipes) expect(within(main()).getByText(r.name)).toBeInTheDocument()
    expect(within(main()).getByText('4 portions · 2 Ingredients · 2 Steps · Main')).toBeInTheDocument()
    // the first Recipe of a two-Recipe file is open: its Steps are on the page
    expect(screen.getByText('Marinate the chicken.')).toBeVisible()
  })
  it('puts the notice first, then the Recipes, then the Ingredients', () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    const notice = screen.getAllByRole('status')[0]!
    const recipes = screen.getByRole('heading', { name: 'Recipes', level: 2 })
    const ingredients = screen.getByRole('heading', { name: 'Ingredients', level: 2 })
    expect(notice.compareDocumentPosition(recipes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recipes.compareDocumentPosition(ingredients) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('notes the open questions: "2 questions to answer before importing."', () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('2 Recipes and 3 Ingredients. 2 questions to answer before importing.')
  })
  it('A Recipe that already exists shows Replace, Keep both and Skip on its own row, and no separate conflict tile', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    const group = screen.getByRole('group', { name: 'What to do with Lasagne (ready meal)' })
    await userEvent.click(within(group).getByRole('button', { name: 'Skip' }))
    expect(hook.current.chooseRecipeAction).toHaveBeenCalledWith(1, 'skip')
    expect(screen.queryByText(/already exists\.? What/i)).not.toBeInTheDocument()
  })
  it('Go to the first question moves focus to the first unanswered question', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Go to the first question' }))
    // Recipe conflicts come first: the Lasagne row's title
    const focused = document.activeElement as HTMLElement
    expect(focused).toHaveTextContent('Lasagne (ready meal)')
    expect(focused).toHaveAttribute('tabindex', '-1')
  })
  it('Import with open questions moves focus to the first one and says how many are left', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    const bar = screen.getByRole('group', { name: 'Import actions' })
    expect(within(bar).getByText('2 questions left')).toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Import 2 Recipes' }))
    expect(hook.current.confirm).not.toHaveBeenCalled()
    expect(document.activeElement).toHaveTextContent('Lasagne (ready meal)')
    expect(within(bar).getByRole('status')).toHaveTextContent('Answer the 2 questions first')
  })
  it('Next question goes to the first unanswered question after the one that has focus, and wraps around', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    const next = () => userEvent.click(within(screen.getByRole('group', { name: 'Import actions' })).getByRole('button', { name: 'Next question' }))
    await next()
    expect(document.activeElement).toHaveTextContent('Lasagne (ready meal)')
    await next()
    expect(document.activeElement).toHaveTextContent('Flour')
    await next()
    expect(document.activeElement).toHaveTextContent('Lasagne (ready meal)')
  })
  it('an answered question drops out at once and the count updates in the notice and the bar', () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    const { rerender } = view()
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('2 questions')
    hook.current = state({ phase: 'reviewing', plan: reviewPlan({ recipes: [tikka, { ...lasagne, resolved: true, action: 'skip' }] }) })
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <ImportScreen />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('1 question to answer')
    expect(screen.getByText('1 question left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 1 Recipe' })).toBeInTheDocument()
  })
  it('imports when nothing is left to answer', async () => {
    hook.current = state({ phase: 'reviewing', plan: plan({ recipes: [tikka], ingredients: [match({ key: 'lemon' })] }) })
    view()
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('1 Recipe and 1 Ingredient, ready to import.')
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 Recipe' }))
    expect(hook.current.confirm).toHaveBeenCalledOnce()
  })
  it('a file whose Recipes are all skipped says so and has nothing to import', () => {
    const skipped = recipe({ index: 0, name: 'Soup', status: 'conflict', resolved: true, action: 'skip' })
    hook.current = state({ phase: 'reviewing', plan: plan({ recipes: [skipped], ingredients: [] }) })
    view()
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Every Recipe is skipped.')
    expect(screen.getByRole('button', { name: 'Nothing to import' })).toBeDisabled()
  })
  it('Start over discards a review nobody answered at once', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan() })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(hook.current.reset).toHaveBeenCalledOnce()
  })
  it('Start over asks first once an answer was given, in our own dialog', async () => {
    hook.current = state({
      phase: 'reviewing', plan: reviewPlan(),
      decisions: { ingredients: [], conversions: [], recipes: [{ index: 1, action: 'skip' }], courses: [] },
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(hook.current.reset).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Start over?' })
    expect(dialog).toHaveTextContent('Your answers so far are lost.')
    expect(within(dialog).getByRole('button', { name: 'Keep answering' })).toHaveFocus()
    expect(dialog.textContent).not.toMatch(/discard/i)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start over' }))
    expect(hook.current.reset).toHaveBeenCalledOnce()
  })
})

describe('RX-12: Ingredient matches as rows with their answer', () => {
  it('Ingredients that need an answer come first in Import Review, under a title with the count to answer', () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan({ recipes: [tikka] }) })
    view()
    expect(screen.getByText('3 · 1 to answer')).toBeInTheDocument()
    const section = screen.getByRole('heading', { name: 'Ingredients', level: 2 }).closest('section, .tile') as HTMLElement
    const titles = within(section).getAllByRole('listitem').map((li) => li.querySelector('.list-row__title')?.textContent)
    expect(titles.slice(0, 2)).toEqual(['Flour', 'Salt'])
  })
  it('collapses the exact matches into one closing row that expands to their rows', async () => {
    hook.current = state({ phase: 'reviewing', plan: reviewPlan({ recipes: [tikka] }) })
    view()
    const closing = screen.getByRole('button', { name: /1 matches your Ingredients|1 match your Ingredients/ })
    expect(closing).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listitem', { name: /Onion/ })).not.toBeInTheDocument() // hidden until opened
    await userEvent.click(closing)
    expect(closing).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listitem', { name: /Onion/ })).toBeVisible()
  })
  it('A unit question is asked on its Ingredient', async () => {
    hook.current = state({
      phase: 'reviewing',
      plan: reviewPlan({
        recipes: [tikka], ingredients: [match({ key: 'spinach', name: 'spinach', status: 'new' })],
        unitPrompts: [prompt({ key: 'spinach', ingredient: 'spinach', unit: 'handful', base: 'g' })],
      }),
    })
    view()
    expect(screen.queryByText('How much is 1 handful of spinach?')).not.toBeInTheDocument()
    const row = screen.getByText('Spinach').closest('li') as HTMLElement
    expect(within(row).getByText('How many g is 1 handful?')).toBeInTheDocument()
    await userEvent.type(within(row).getByRole('spinbutton', { name: '1 handful of Spinach is' }), '30')
    await userEvent.click(within(row).getByRole('button', { name: 'Save' }))
    expect(hook.current.answerConversion).toHaveBeenCalledWith('spinach', 'handful', 30)
  })
})

describe('RX-01: the result names the Recipes', () => {
  const done = (over: Partial<UseImportReview> = {}) =>
    state({
      phase: 'done', plan: plan({ recipes: [tikka, { ...lasagne, resolved: true, action: 'replace' }] }),
      result: confirmed([applied({ index: 0, id: 11, name: 'Chicken tikka traybake' }), applied({ index: 1, id: 12, name: 'Lasagne (ready meal)', action: 'replaced' })], { ingredientsCreated: 3 }),
      ...over,
    })
  it('The import result links to each imported Recipe and its editor', () => {
    hook.current = done()
    view()
    expect(screen.getByRole('heading', { name: 'Imported 2 Recipes' })).toHaveFocus()
    expect(screen.getByRole('link', { name: /^Chicken tikka traybake/ })).toHaveAttribute('href', '/recipes/11')
    expect(screen.getByRole('link', { name: 'Edit Chicken tikka traybake' })).toHaveAttribute('href', '/recipes/11/edit')
    expect(screen.getByRole('link', { name: 'Edit Lasagne (ready meal)' })).toHaveAttribute('href', '/recipes/12/edit')
    expect(screen.getByRole('link', { name: 'Open Recipes' })).toHaveAttribute('href', '/recipes')
  })
  it('"Import more" starts over', async () => {
    hook.current = done()
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Import more' }))
    expect(hook.current.reset).toHaveBeenCalledOnce()
  })
  it('names every Recipe it created on the page', () => {
    hook.current = done()
    view()
    for (const name of ['Chicken tikka traybake', 'Lasagne (ready meal)']) expect(within(main()).getByText(name)).toBeInTheDocument()
  })
})
