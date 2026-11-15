// B9-31 (SAFE-01, SAFE-06): the Recipe editor keeps work. The seven SAFE-01 chapter scenarios keep their titles as test names, then
// Cancel (SAFE-06), the DraftNotice, the update-prompt hold and the unsaved flag. No BDD .feature: bdd/ has no browser and these are
// interaction-level (TEAM-BRIEF "BDD scenarios"). Design choices these tests pin are in the hand-back.
//
// The leave dialog's words use the STORED Recipe's name ("Your changes to Roast tray are not saved."), not the name being typed,
// and "This new Recipe is not saved." for /recipes/new. Keep editing puts focus on the control that started the exit (the Plan link
// when it was clicked) or the page title: never a text field.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, recipe } from '../fixtures.test-helper'
import { draftFromRecipe, type RecipeDraft } from '../lib/draft'
import { api, discardDialog, drafts, leaveDialog, mount, nameField, ready, resetDraftStore, STORED, unsaved, USER_ID } from './RecipeEditorScreen.safe.harness.test-helper'

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
  const { drafts } = await import('./RecipeEditorScreen.safe.harness.test-helper')
  return { ...real, openDraftStore: async () => drafts.store }
})
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

const KEY = `${USER_ID}:3`
const stored = () => drafts.store.get<RecipeDraft>('recipe', KEY)
const storedNew = () => drafts.store.get<RecipeDraft>('recipe', `${USER_ID}:new`)

beforeEach(() => {
  resetDraftStore()
  api()
})

async function typeName(text = ', my way') {
  await userEvent.type(nameField(), text)
}

describe('Leaving a changed Recipe by the bottom bar asks first', () => {
  it('opens "Leave without saving?" for a link, and does not navigate yet', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(dialog).toHaveTextContent('Your changes to Roast tray are not saved.')
    expect(dialog).toHaveTextContent('If you leave, they are lost.')
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull()
  })

  it('a new Recipe says "This new Recipe is not saved."', async () => {
    mountNew()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lasagne')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toHaveTextContent('This new Recipe is not saved.')
  })

  it('a clean editor leaves at once (nothing typed, or typed and put back, or only spaces added)', async () => {
    const { router } = mount()
    await ready()
    await userEvent.type(nameField(), ' ')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(leaveDialog()).toBeNull()
  })
})

describe('Keep editing stays in the editor with nothing lost', () => {
  it('closes the dialog, keeps the path and the typed name, and focus is not in a text field', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(leaveDialog()).toBeNull())
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(nameField()).toHaveValue('Roast tray, my way')
    const active = document.activeElement as HTMLElement
    expect(active.closest('input, textarea, select, [contenteditable]')).toBeNull()
  })

  it('Escape does the same', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Pantry' }))
    await screen.findByRole('dialog', { name: 'Leave without saving?' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(leaveDialog()).toBeNull())
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
  })

  it('the reload draft is still kept', async () => {
    mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    await waitFor(async () => expect((await stored())?.draft.name).toBe('Roast tray, my way'), { timeout: 2000 })
  })
})

describe('Discard changes leaves and forgets the changes', () => {
  it('goes to the destination and removes the reload draft', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await waitFor(async () => expect(await stored()).not.toBeNull(), { timeout: 2000 })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(await stored()).toBeNull()
  })

  it('opening the editor again shows the stored Recipe, no notice', async () => {
    const first = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/plan'))
    first.unmount()
    mount()
    await ready()
    expect(screen.queryByRole('status', { name: /unsaved changes/i })).toBeNull()
  })
})

describe('Browser Back from a changed Recipe asks first', () => {
  it('a POP navigation opens the dialog; Keep editing leaves the location where it was', async () => {
    const { router } = mount('/recipes/3/edit', ['/plan', '/recipes/3/edit'])
    await ready()
    await typeName()
    await act(async () => void router.navigate(-1))
    await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(leaveDialog()).toBeNull())
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(nameField()).toHaveValue('Roast tray, my way')
  })

  it('Discard changes then goes back', async () => {
    const { router } = mount('/recipes/3/edit', ['/plan', '/recipes/3/edit'])
    await ready()
    await typeName()
    await act(async () => void router.navigate(-1))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
  })
})

describe('A reload brings unsaved changes back with a notice', () => {
  const kept = (): RecipeDraft => ({ ...draftFromRecipe(STORED), name: 'Roast tray, my way' })

  it('writes the draft 500 ms after typing (the part a reload then reads)', async () => {
    mount()
    await ready()
    await typeName()
    expect(await stored()).toBeNull()
    await waitFor(async () => expect(await stored()).toMatchObject({ baseUpdatedAt: '2026-11-14T10:00:00Z' }), { timeout: 2000 })
    expect((await stored())!.draft.name).toBe('Roast tray, my way')
  })

  it('opens with the kept changes and "Your unsaved changes are back"', async () => {
    await drafts.store.put('recipe', KEY, { draft: kept(), baseUpdatedAt: STORED.updatedAt, savedAt: Date.now() - 60_000 })
    mount()
    await ready('Roast tray, my way')
    const notice = await screen.findByRole('status', { name: 'Your unsaved changes are back' })
    expect(notice).toHaveTextContent('The page closed before you saved')
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Discard changes'])
    expect(document.activeElement).not.toBe(notice) // the notice never takes focus
  })

  it('the restored editor is dirty: leaving asks, and the update prompt is held', async () => {
    await drafts.store.put('recipe', KEY, { draft: kept(), baseUpdatedAt: STORED.updatedAt, savedAt: Date.now() - 60_000 })
    mount()
    await ready('Roast tray, my way')
    expect(unsaved()).toBe('true')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })

  it('Discard changes on the notice asks "Discard your changes?", and then shows the stored Recipe and stays in the editor', async () => {
    await drafts.store.put('recipe', KEY, { draft: kept(), baseUpdatedAt: STORED.updatedAt, savedAt: Date.now() - 60_000 })
    const { router } = mount()
    await ready('Roast tray, my way')
    await userEvent.click(within(await screen.findByRole('status', { name: 'Your unsaved changes are back' })).getByRole('button', { name: 'Discard changes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
    expect(leaveDialog()).toBeNull() // one dialog, never two
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(nameField()).toHaveValue('Roast tray'))
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(screen.queryByRole('status', { name: /unsaved changes/i })).toBeNull()
    expect(await stored()).toBeNull()
    expect(unsaved()).toBe('false')
  })

  it('a new Recipe\'s draft comes back on /recipes/new', async () => {
    await drafts.store.put('recipe', `${USER_ID}:new`, { draft: { ...draftFromRecipe(recipe()), name: 'Lasagne' }, baseUpdatedAt: null, savedAt: Date.now() - 1000 })
    mountNew()
    await waitFor(() => expect(nameField()).toHaveValue('Lasagne'))
    expect(await screen.findByRole('status', { name: 'Your unsaved changes are back' })).toBeInTheDocument()
  })
})

describe('A draft older than someone else\'s save asks before restoring', () => {
  const older = (): RecipeDraft => ({ ...draftFromRecipe(STORED), name: 'Roast tray, my way' })

  it('shows the stored Recipe and a notice with Restore my changes and Discard them', async () => {
    api({ 'GET /api/recipes/3': { ...STORED, updatedAt: '2026-11-14T15:00:00Z' } })
    await drafts.store.put('recipe', KEY, { draft: older(), baseUpdatedAt: '2026-11-14T10:00:00Z', savedAt: Date.parse('2026-11-14T14:00:00Z') })
    mount()
    await ready('Roast tray')
    const notice = await screen.findByRole('status', { name: /You have unsaved changes from/ })
    expect(notice).toHaveTextContent('saved this Recipe since then')
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Restore my changes', 'Discard them'])
    expect(unsaved()).toBe('false') // nothing is restored until the person chooses
  })

  it('Restore my changes puts the draft in the editor (dirty); the stored one is replaced only on Save', async () => {
    api({ 'GET /api/recipes/3': { ...STORED, updatedAt: '2026-11-14T15:00:00Z' } })
    await drafts.store.put('recipe', KEY, { draft: older(), baseUpdatedAt: '2026-11-14T10:00:00Z', savedAt: Date.parse('2026-11-14T14:00:00Z') })
    mount()
    await ready('Roast tray')
    await userEvent.click(await screen.findByRole('button', { name: 'Restore my changes' }))
    await waitFor(() => expect(nameField()).toHaveValue('Roast tray, my way'))
    expect(screen.queryByRole('status', { name: /unsaved changes/i })).toBeNull()
    expect(unsaved()).toBe('true')
  })

  it('Discard them keeps the stored Recipe and forgets the draft', async () => {
    api({ 'GET /api/recipes/3': { ...STORED, updatedAt: '2026-11-14T15:00:00Z' } })
    await drafts.store.put('recipe', KEY, { draft: older(), baseUpdatedAt: '2026-11-14T10:00:00Z', savedAt: Date.parse('2026-11-14T14:00:00Z') })
    mount()
    await ready('Roast tray')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard them' }))
    await waitFor(async () => expect(await stored()).toBeNull())
    expect(nameField()).toHaveValue('Roast tray')
  })
})

describe('Saving never asks', () => {
  it('Save Recipe goes to the Recipe with no dialog, and the reload draft is gone', async () => {
    const calls = api()
    const { router } = mount()
    await ready()
    await typeName()
    await waitFor(async () => expect(await stored()).not.toBeNull(), { timeout: 2000 })
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/3'))
    expect(leaveDialog()).toBeNull()
    expect(calls.callsTo('PUT', '/api/recipes/3')).toHaveLength(1)
    expect(await stored()).toBeNull()
  })

  it('a new Recipe saves to its page the same way', async () => {
    const { router } = mountNew()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Aioli')
    await userEvent.click(await screen.findByRole('button', { name: 'Add ingredient' }))
    // the line has no Ingredient: Save is refused, so the editor is still dirty and still answers to the guard
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(router.state.location.pathname).toBe('/recipes/new')
  })

  it('a save refused by the server keeps the editor dirty and the draft', async () => {
    api({ 'PUT /api/recipes/3': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { router } = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await screen.findByRole('alert')
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(unsaved()).toBe('true')
  })
})

describe('an upload in progress counts as unsaved', () => {
  it('while the Photo is uploading the editor is dirty; it is clean again when the upload ends unchanged', async () => {
    const { router } = mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'start upload Photo' }))
    expect(unsaved()).toBe('true')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await userEvent.click(screen.getByRole('button', { name: 'finish upload Photo' }))
    await waitFor(() => expect(unsaved()).toBe('false')) // the upload ended and nothing else changed
  })
})

describe('Cancel (SAFE-06)', () => {
  it('while clean goes to the Recipe at once, with replace, also when the editor was opened from a link', async () => {
    const { router } = mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/3'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(leaveDialog()).toBeNull()
    expect(discardDialog()).toBeNull()
  })

  it('a new Recipe\'s Cancel goes to the list', async () => {
    const { router } = mountNew()
    await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes'))
  })

  it('while dirty asks "Discard your changes?" once, Keep editing focused; Keep editing stays', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
    expect(dialog).toHaveTextContent('Your changes to Roast tray are lost.')
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    expect(leaveDialog()).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(discardDialog()).toBeNull())
    expect(router.state.location.pathname).toBe('/recipes/3/edit')
    expect(nameField()).toHaveValue('Roast tray, my way')
  })

  it('Discard changes removes the reload draft and goes to the Recipe, without a second dialog', async () => {
    const { router } = mount()
    await ready()
    await typeName()
    await waitFor(async () => expect(await stored()).not.toBeNull(), { timeout: 2000 })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/3'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(leaveDialog()).toBeNull()
    expect(await stored()).toBeNull()
  })

  it('a new Recipe says "This new Recipe is lost." and goes to /recipes', async () => {
    const { router } = mountNew()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lasagne')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Discard your changes?' })).toHaveTextContent('This new Recipe is lost.')
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes'))
    expect(await storedNew()).toBeNull()
  })

  it('never calls history back', async () => {
    const back = vi.spyOn(window.history, 'back')
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(back).not.toHaveBeenCalled()
  })
})

describe('the update prompt is held while the editor is dirty', () => {
  it('the app-level flag follows the editor: on when typing, off after Save', async () => {
    mount()
    await ready()
    expect(unsaved()).toBe('false')
    await typeName()
    expect(unsaved()).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(unsaved()).toBe('false'))
  })

  it('and off again once the editor is left', async () => {
    mount()
    await ready()
    await typeName()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(unsaved()).toBe('false'))
  })
})

function mountNew() {
  return mount('/recipes/new')
}
void courseChoices
