// B9-31 (SAFE-04, Recipe): one field-error pattern in the editor. Save validates; on failure focus goes to the first invalid control
// (centred, clear of the bars), its error sits under it and it reads it through aria-describedby. Field errors are not alerts; the
// form-level "Check the fields marked above." is gone; a save error that belongs to no field is a <FormError> (the one role="alert").
// Errors clear as each field is fixed; Save stays enabled. The Ingredients section's error sits under its heading and "Add ingredient"
// is the focus target when it is the first invalid thing. A server field error (422 validation_failed) also takes focus.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, mount, nameField, ready, resetDraftStore } from './RecipeEditorScreen.safe.harness.test-helper'

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

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
const message = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby')!.split(' ').find((id) => document.getElementById(id)?.textContent?.includes('.')) ?? '')?.textContent
// The ToastProvider's always-present live region (.toast-live, role alert, empty) is not a form alert.
const formAlerts = () => screen.queryAllByRole('alert').filter((el) => !el.classList.contains('toast-live'))
const ingredientsSection = () => screen.getByRole('region', { name: 'Ingredients' })

beforeEach(() => {
  resetDraftStore()
  api()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('Saving an empty Recipe focuses Name and marks Ingredients', () => {
  it('focuses Name, which is aria-invalid and described by "Give the Recipe a name."', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(message(nameField())).toBe('Give the Recipe a name.')
  })

  it('the Ingredients section says "Add at least one ingredient line." under its heading, as plain text', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    const text = await within(ingredientsSection()).findByText('Add at least one ingredient line.')
    expect(text).not.toHaveAttribute('role', 'alert')
    const heading = within(ingredientsSection()).getByRole('heading', { name: 'Ingredients' })
    expect(heading.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no role="alert" at all and no "Check the fields marked above."', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
    expect(formAlerts()).toHaveLength(0)
    expect(screen.queryByText('Check the fields marked above.')).toBeNull()
  })

  it('Save stays enabled after a failed save', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeEnabled()
  })

  it('with a Name but no lines, focus goes to "Add ingredient", which points at the message', async () => {
    mount('/recipes/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Aioli')
    await save()
    const add = screen.getByRole('button', { name: 'Add ingredient' })
    await waitFor(() => expect(add).toHaveFocus())
    expect(message(add)).toBe('Add at least one ingredient line.')
  })

  it('the first invalid control is centred in the view (scrollIntoView block center)', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'center' }))
  })

  it('a second failed Save moves focus to the first invalid control again', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
  })
})

describe('errors clear as each field is fixed', () => {
  it('typing a Name removes its error and aria-invalid, with no new Save', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(nameField()).toHaveAttribute('aria-invalid', 'true'))
    await userEvent.type(nameField(), 'A')
    await waitFor(() => expect(nameField()).not.toHaveAttribute('aria-invalid', 'true'))
    expect(screen.queryByText('Give the Recipe a name.')).toBeNull()
  })

  it('adding a line removes the Ingredients message', async () => {
    mount('/recipes/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Aioli')
    await save()
    await within(ingredientsSection()).findByText('Add at least one ingredient line.')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await waitFor(() => expect(screen.queryByText('Add at least one ingredient line.')).toBeNull())
  })
})

describe('a line without an Ingredient', () => {
  it('focuses its Ingredient picker, marked invalid, with the message under it', async () => {
    mount('/recipes/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Aioli')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await save()
    const picker = await screen.findByRole('combobox', { name: 'Ingredient' })
    await waitFor(() => expect(picker).toHaveFocus())
    expect(picker).toHaveAttribute('aria-invalid', 'true')
    expect(formAlerts()).toHaveLength(0)
  })
})

describe('a save error that belongs to no field is a FormError', () => {
  it('a failed save shows one alert with the words, above the actions, and the editor keeps the changes', async () => {
    api({ 'PUT /api/recipes/3': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    mount()
    await ready()
    await userEvent.type(nameField(), ' too')
    await save()
    const alert = await waitFor(() => formAlerts()[0]!)
    expect(alert).toHaveTextContent('The Recipe could not be saved.')
    expect(alert).toHaveClass('form-error')
    expect(formAlerts()).toHaveLength(1)
    expect(nameField()).toHaveValue('Roast tray too')
  })

  it('the next Save clears it', async () => {
    api({ 'PUT /api/recipes/3': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    mount()
    await ready()
    await userEvent.type(nameField(), ' too')
    await save()
    await waitFor(() => expect(formAlerts()).toHaveLength(1))
    api()
    await save()
    await waitFor(() => expect(formAlerts()).toHaveLength(0))
  })
})

describe('a field the server refuses', () => {
  it('takes focus, is aria-invalid and says why (a name that is taken)', async () => {
    api({ 'PUT /api/recipes/3': { status: 422, json: { error: { code: 'validation_failed', message: 'name_taken', field: 'name', reason: 'name_taken' } } } })
    mount()
    await ready()
    await userEvent.type(nameField(), ' too')
    await userEvent.tab() // move focus away so the test sees it come back
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
  })
})
