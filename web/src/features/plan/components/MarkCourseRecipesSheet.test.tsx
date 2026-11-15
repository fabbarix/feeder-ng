// B9-32 (PC-07, FLOW-18): the sheet "Mark Recipes as Dessert". Title and context, the lede, a search field, Recipes with our own checkboxes (meta
// "Main · 30 min" or "No Course yet · 50 min"), the primary "Mark 2 Recipes as Dessert", Cancel (so no Close). Saving POSTs /api/courses/<id>/recipes
// and the Plan says what it did in a toast with Undo. TEST-AUTHOR tests: the component is a stub that renders nothing.
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../test-utils'
import { MarkCourseRecipesSheet } from './MarkCourseRecipesSheet'

afterEach(() => vi.unstubAllGlobals())

const recipes = [
  { id: 11, name: 'Tiramisu', totalMinutes: 30, courses: [{ id: 1, name: 'Main' }] },
  { id: 12, name: 'Panna cotta', totalMinutes: 50, courses: [] },
  { id: 13, name: 'Apple crumble', totalMinutes: 45, courses: [{ id: 2, name: 'Side' }, { id: 1, name: 'Main' }] },
]
const changes = [1, 2, 3].map((i) => ({ date: `2026-11-1${i}`, mealSlotId: 4, courseId: 3, before: null, after: { recipeId: 11, recipeName: 'Tiramisu', servedFromLeftover: false }, why: [] }))
const base = { 'GET /api/recipes?notCourse=3': recipes }

function open(over: Record<string, unknown> = {}, onClose = vi.fn()) {
  const api = mockApi({ ...base, ...over })
  renderWithProviders(<MarkCourseRecipesSheet open onClose={onClose} course={{ id: 3, name: 'Dessert' }} count={7} />)
  return { api, onClose }
}
const sheet = () => screen.findByRole('dialog', { name: 'Mark Recipes as Dessert' })
const findToast = (text: RegExp) =>
  waitFor(() => {
    const t = [...document.querySelectorAll<HTMLElement>('.toast')].find((e) => text.test(e.textContent ?? ''))
    if (!t) throw new Error(`no toast ${text}`)
    return t
  })

describe('MarkCourseRecipesSheet', () => {
  it('is titled "Mark Recipes as Dessert", with the context "Couldn\'t plan 7 Desserts" and the lede', async () => {
    open()
    const dialog = await sheet()
    expect(within(dialog).getByText("Couldn't plan 7 Desserts")).toBeInTheDocument()
    expect(within(dialog).getByText('The planner fills Dessert only from Recipes marked with it. Tick the ones you would serve as Dessert.')).toBeInTheDocument()
  })

  it('asks the server for the Recipes NOT marked with the Course (the same filter the Recipes list had)', async () => {
    const { api } = open()
    await sheet()
    await waitFor(() => expect(api.callsTo('GET', '/api/recipes?notCourse=3')).toHaveLength(1))
  })

  it('lists each Recipe as one of our own checkboxes (role checkbox, aria-checked) with its Courses and minutes as the meta', async () => {
    open()
    const dialog = await sheet()
    const tiramisu = await within(dialog).findByRole('checkbox', { name: /Tiramisu/ })
    expect(tiramisu).toHaveAttribute('aria-checked', 'false')
    expect(within(dialog).getByRole('checkbox', { name: /Tiramisu/ }).closest('li')).toHaveTextContent('Main · 30 min')
    expect(within(dialog).getByRole('checkbox', { name: /Panna cotta/ }).closest('li')).toHaveTextContent('No Course yet · 50 min')
    expect(within(dialog).getByRole('checkbox', { name: /Apple crumble/ }).closest('li')).toHaveTextContent('Side, Main · 45 min')
    expect(dialog.querySelector('input[type="checkbox"]')).toBeNull() // never the browser's checkbox
  })

  it('the primary is disabled until one is ticked, then counts them: "Mark 2 Recipes as Dessert" ("Mark 1 Recipe as Dessert" for one)', async () => {
    open()
    const dialog = await sheet()
    const primary = within(dialog).getByRole('button', { name: 'Mark Recipes as Dessert' })
    expect(primary).toBeDisabled()
    expect(primary).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    expect(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' })).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Panna cotta/ }))
    expect(within(dialog).getByRole('button', { name: 'Mark 2 Recipes as Dessert' })).toBeEnabled()
  })

  it('a search field narrows the list by name, ticks are kept while it is narrowed', async () => {
    open()
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search Recipes' }), 'crum')
    expect(within(dialog).queryByRole('checkbox', { name: /Tiramisu/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Apple crumble/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' })).toBeEnabled() // Tiramisu is still ticked
  })

  it('has Cancel and no Close (the footer has Cancel: one way out)', async () => {
    const { onClose } = open()
    const dialog = await sheet()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  // Main-session ruling 2 (B9-32 developer): Undo undoes what Mark did. It unmarks the Recipes this call newly marked (`markedIds`) through
  // POST /api/courses/<id>/recipes/unmark, which replans, instead of a plan restore (that left the Recipes marked, so the next replan
  // filled Dessert again). The test author's version undid with POST /api/plan/restore { undoToken }.
  it('Mark POSTs the ticked Recipe ids to the Course, closes, and the toast says how many were marked and how many meals were planned, with Undo', async () => {
    const { api, onClose } = open({
      'POST /api/courses/3/recipes': { marked: 2, markedIds: [11, 12], changes, undoToken: 'tok-9' },
      'POST /api/courses/3/recipes/unmark': { unmarked: 2, unmarkedIds: [11, 12], changes: [] },
    })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Panna cotta/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 2 Recipes as Dessert' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/3/recipes')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/courses/3/recipes')[0]!.body).toEqual({ recipeIds: [11, 12] })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const toast = await findToast(/2 Recipes marked as Dessert/)
    expect(toast).toHaveTextContent('3 meals planned')
    expect(toast.querySelector('.toast__title svg')).toBeNull() // no success icon on a toast (the round Dismiss keeps its X)
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/3/recipes/unmark')[0]?.body).toEqual({ recipeIds: [11, 12] }))
    expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(0)
    const after = await findToast(/2 Recipes are no longer marked as Dessert/)
    expect(after.querySelector('.toast__title svg')).toBeNull() // plain, no icon
  })

  it('Undo unmarks only the Recipes the call newly marked (markedIds), not every ticked one', async () => {
    const { api } = open({
      'POST /api/courses/3/recipes': { marked: 1, markedIds: [12], changes, undoToken: 'tok-9' },
      'POST /api/courses/3/recipes/unmark': { unmarked: 1, unmarkedIds: [12], changes: [] },
    })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Panna cotta/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 2 Recipes as Dessert' }))
    const toast = await findToast(/1 Recipe marked as Dessert/)
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/3/recipes/unmark')[0]?.body).toEqual({ recipeIds: [12] }))
    await findToast(/1 Recipe is no longer marked as Dessert/)
  })

  it('a refused Undo is a warning toast "Nothing was undone"', async () => {
    open({
      'POST /api/courses/3/recipes': { marked: 1, markedIds: [11], changes, undoToken: 'tok-9' },
      'POST /api/courses/3/recipes/unmark': { status: 404, json: { error: { code: 'not_found', message: 'Not found' } } },
    })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' }))
    const toast = await findToast(/1 Recipe marked as Dessert/)
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    const refused = await findToast(/Nothing was undone/)
    expect(refused).toHaveAttribute('data-status', 'warning')
  })

  it('marked Recipes that planned nothing new can still be undone (the Undo unmarks them)', async () => {
    open({ 'POST /api/courses/3/recipes': { marked: 1, markedIds: [11], changes: [] } })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' }))
    const toast = await findToast(/1 Recipe marked as Dessert/)
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
  })

  it('"1 Recipe marked as Dessert", and with nothing planned the subline says so instead of "0 meals planned"', async () => {
    open({ 'POST /api/courses/3/recipes': { marked: 1, changes: [] } })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' }))
    const toast = await waitFor(() => {
      const t = [...document.querySelectorAll<HTMLElement>('.toast')].find((e) => /1 Recipe marked as Dessert/.test(e.textContent ?? ''))
      if (!t) throw new Error('no toast')
      return t
    })
    expect(toast.textContent).not.toMatch(/0 meals planned/)
    expect(within(toast).queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument() // no markedIds, nothing to undo
  })

  it('a refusal stays in the sheet as the form error (role alert inside the dialog), keeps the ticks and the sheet open', async () => {
    const { onClose } = open({ 'POST /api/courses/3/recipes': { status: 422, json: { error: { code: 'validation_failed', message: 'A Recipe was removed.', field: 'recipeIds' } } } })
    const dialog = await sheet()
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 1 Recipe as Dessert' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A Recipe was removed.')
    expect(onClose).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('checkbox', { name: /Tiramisu/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('when every Recipe has the Course already it says so', async () => {
    open({ 'GET /api/recipes?notCourse=3': [] })
    const dialog = await sheet()
    expect(await within(dialog).findByText('Every Recipe is already marked as Dessert.')).toBeInTheDocument()
  })

  it('while the list loads it shows a skeleton, not an empty state', async () => {
    mockApi({ 'GET /api/recipes?notCourse=3': () => new Promise(() => {}) as never })
    renderWithProviders(<MarkCourseRecipesSheet open onClose={vi.fn()} course={{ id: 3, name: 'Dessert' }} count={7} />)
    const dialog = await sheet()
    await act(async () => {})
    expect(dialog.querySelector('.skeleton, [aria-busy="true"]')).not.toBeNull()
    expect(within(dialog).queryByText(/already marked/)).not.toBeInTheDocument()
  })
})
