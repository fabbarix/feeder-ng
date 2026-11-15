// B9-31 (SAFE-10): removing a Step, an ingredient line or an ingredient use acts at once, says so with an Undo toast (8 s, role undo,
// accessible name "Undo: put Step 1 back"), and Undo puts it back at its index with its content; the Steps renumber and "After step N"
// references survive. Focus goes to the Step that took the removed one's place (its "Step actions" button), or "Add Step" when none is
// left; the same for lines ("Actions for <name>", "Add ingredient") and uses (the next use's remove button, "Add ingredient use").
// The draft (reload draft and dirty state) records both changes. Words: strings.removed.test.ts.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drafts, mount, ready, resetDraftStore, unsaved, api, STORED } from './RecipeEditorScreen.safe.harness.test-helper'
import { recipe } from '../fixtures.test-helper'

vi.mock('../hooks/useIngredientRefs', async () => {
  const { garlic, flour } = await import('../fixtures.test-helper')
  return { useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }
})
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined, isLoading: false }) }))
vi.mock('../../../lib/courses/useCourses', async () => {
  const { courseChoices } = await import('../fixtures.test-helper')
  return { useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }
})
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 7, email: 'a@b.c', displayName: 'Anna', isAdmin: false, householdTimeZone: 'Europe/Rome' } }) }))
vi.mock('../../../lib/drafts/draftStore', async (orig) => {
  const real = await orig<typeof import('../../../lib/drafts/draftStore')>()
  // Read lazily: the harness imports the screen, which imports this module, so the harness is not loaded yet when this runs.
  return { ...real, openDraftStore: async () => (await import('./RecipeEditorScreen.safe.harness.test-helper')).drafts.store }
})
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

const stepCards = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('step-card'))
const stepTexts = () => stepCards().map((c) => (within(c).getByRole('textbox', { name: 'Step text' }) as HTMLTextAreaElement).value)
const toast = () => document.querySelector<HTMLElement>('.toast')
const undoButton = (name: string) => within(toast()!).getByRole('button', { name })

beforeEach(() => {
  resetDraftStore()
  api()
})

describe('removing a Step', () => {
  it('removes it at once, with a "Step 1 removed" toast and an Undo named for it', async () => {
    mount()
    await ready()
    expect(stepTexts()).toEqual(['Marinate the chicken', 'Roast'])
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    expect(stepTexts()).toEqual(['Roast'])
    await waitFor(() => expect(toast()).toHaveTextContent('Step 1 removed'))
    expect(undoButton('Undo: put Step 1 back')).toBeInTheDocument()
    expect(toast()!.querySelector('.toast__icon, [data-status-icon]')).toBeNull() // no status icon on an Undo toast
  })

  it('Undo puts it back at its index with its content, and the editor is clean again', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    expect(unsaved()).toBe('true')
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: put Step 1 back' }))
    expect(stepTexts()).toEqual(['Marinate the chicken', 'Roast'])
    expect(unsaved()).toBe('false')
  })

  it('removing the second Step names it "Step 2"', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[1]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(() => expect(toast()).toHaveTextContent('Step 2 removed'))
    expect(undoButton('Undo: put Step 2 back')).toBeInTheDocument()
  })

  it('"After step N" references survive an Undo', async () => {
    const withAfter = recipe({
      id: 3, name: 'Roast tray', updatedAt: STORED.updatedAt,
      steps: [
        { text: 'Peel', kind: 'active', durationMinutes: 5, leadTimeMinutes: 0, after: [], uses: [], image: '' },
        { text: 'Chop', kind: 'active', durationMinutes: 5, leadTimeMinutes: 0, after: [0], uses: [], image: '' },
        { text: 'Fry', kind: 'active', durationMinutes: 5, leadTimeMinutes: 0, after: [1], uses: [], image: '' },
      ],
    })
    api({ 'GET /api/recipes/3': withAfter, 'PUT /api/recipes/3': withAfter })
    mount()
    await ready()
    await userEvent.click(within(stepCards()[1]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: put Step 2 back' }))
    // Fry is After step 2 again (pressed), Chop After step 1
    expect(within(stepCards()[2]!).getByRole('button', { name: /^(Step \d+ after Step|After step) 2$/, pressed: true })).toBeInTheDocument()
    expect(within(stepCards()[1]!).getByRole('button', { name: /^(Step \d+ after Step|After step) 1$/, pressed: true })).toBeInTheDocument()
  })

  it('focus goes to the Step that took its place (its Step actions button)', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(() => expect(within(stepCards()[0]!).getByRole('button', { name: /^Step( \d+)? actions$/ })).toHaveFocus())
  })

  it('removing the last Step focuses the previous one; removing the only Step focuses Add Step', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[1]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(() => expect(within(stepCards()[0]!).getByRole('button', { name: /^Step( \d+)? actions$/ })).toHaveFocus())
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Step' })).toHaveFocus())
  })

  it('Undo puts focus back on the restored Step\'s Remove button', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: put Step 1 back' }))
    await waitFor(() => expect(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }).closest('li')).toContainElement(document.activeElement as HTMLElement))
  })

  it('the reload draft records the removal', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(async () => expect((await drafts.store.get<{ steps: unknown[] }>('recipe', '7:3'))?.draft.steps).toHaveLength(1), { timeout: 2000 })
  })

  it('one Undo toast at a time: removing a second Step replaces the first toast', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: /^Remove Step( \d+)?$/ }))
    await waitFor(() => expect(document.querySelectorAll('.toast')).toHaveLength(1))
  })
})

describe('removing an ingredient line', () => {
  it('says "Garlic line removed" with "Undo: put Garlic line back"; Undo brings the line back with its quantity and unit', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient garlic' }))
    expect(screen.queryByRole('button', { name: 'Remove ingredient garlic' })).toBeNull()
    await waitFor(() => expect(toast()).toHaveTextContent('Garlic line removed'))
    await userEvent.click(undoButton('Undo: put Garlic line back'))
    expect(screen.getByRole('button', { name: 'Remove ingredient garlic' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveValue('3') // the line's Quantity is a text field (fractions stay typeable)
    expect(unsaved()).toBe('false')
  })

  it('removing the only line focuses "Add ingredient"', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient garlic' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add ingredient' })).toHaveFocus())
  })

  it('removing a line focuses the next line\'s actions button', async () => {
    const two = recipe({
      id: 3, name: 'Roast tray', updatedAt: STORED.updatedAt,
      lines: [
        { ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: false, note: '' },
        { ingredientId: 8, ingredient: 'flour', quantity: 200, unit: 'g', optional: false, note: '' },
      ],
    })
    api({ 'GET /api/recipes/3': two })
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient garlic' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for flour' })).toHaveFocus())
  })
})

describe('removing an ingredient use', () => {
  it('says "Garlic use removed from Step 2"; Undo gives the use back to that Step', async () => {
    mount()
    await ready()
    expect(screen.getAllByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ }))
    expect(screen.queryByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ })).toBeNull()
    await waitFor(() => expect(toast()).toHaveTextContent('Garlic use removed from Step 2'))
    await userEvent.click(undoButton('Undo: put Garlic use back'))
    expect(within(stepCards()[1]!).getAllByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ })).toHaveLength(1)
    expect(unsaved()).toBe('false')
  })

  it('removing the only use focuses that Step\'s "Add ingredient use"', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ }))
    await waitFor(() => expect(within(stepCards()[1]!).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ })).toHaveFocus())
  })
})
