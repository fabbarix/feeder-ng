// B5-LOW wiring (ADR 0012): the Plan lists Leftovers too, asks before waste and previews what an action would replan.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { friLunch, frozenChilli, leftover } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'

afterEach(() => vi.unstubAllGlobals())

const view = (): PlanView => ({
  today: '2026-11-12', horizonDays: 3, updating: false,
  slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeId: 7, recipeName: 'Roast chicken' }) })],
})
const asked = leftover({ id: 3, recipeName: 'Chilli', portions: 2, useBy: '2026-11-10', toAnswer: true })
const soup = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14' })
const dayTile = async (name: string) => (await screen.findByRole('heading', { name: name === 'Today' ? /· Today$/ : name })).closest('article') as HTMLElement
const QUESTION = "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?"

function setup(leftovers: Leftover[], extra: Record<string, unknown> = {}) {
  let current = leftovers
  const api = mockApi({
    'GET /api/plan': view(),
    'GET /api/plan/leftovers': () => ({ leftovers: current }),
    'GET /api/storage-places': [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }],
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    'GET /api/recipes/11': { id: 11, frozenUseByDays: null, leftoverUseByDays: null },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(<PlanScreen />)
  return { api, set: (next: Leftover[]) => { current = next } }
}

describe('PlanScreen: Leftovers', () => {
  it('lists the Leftovers to use, soonest first, and the question for one past its Use-by', async () => {
    setup([soup, asked, frozenChilli({ id: 5 })])
    expect(await screen.findByRole('heading', { name: 'Leftovers to use' })).toBeInTheDocument()
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText('2 portions · Use by Sat')).toBeInTheDocument()
    expect(screen.queryByText('Garage Freezer')).toBeNull() // a frozen Leftover that is not to answer lives on the Pantry
  })

  it('shows no Leftovers section without Leftovers', async () => {
    setup([])
    await screen.findByRole('heading', { name: /· Today$/ })
    expect(screen.queryByRole('heading', { name: 'Leftovers to use' })).toBeNull()
  })

  it('never answers on its own', async () => {
    const { api } = setup([asked])
    await screen.findByText(QUESTION)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('asks first when the answer would replan, then answers and refreshes', async () => {
    const { api, set } = setup([asked, soup], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [friLunch] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Threw it out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Replan for Chilli?' })
    expect(dialog).toHaveTextContent('Fri Lunch was going to have it; it is planned again.')
    expect(dialog).toHaveAttribute('data-tone', 'danger')
    expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(0)
    set([soup])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Threw it out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')[0]?.body).toEqual({ answer: 'threw_out' }))
    await waitFor(() => expect(screen.queryByText(QUESTION)).toBeNull())
  })

  it('answers at once when nothing would be replanned', async () => {
    const { api } = setup([asked], {
      'POST /api/plan/leftovers/3/had-it?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/3/answer': { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Had it' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/3/answer')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the row menu opens the Had it sheet with the dry run notes', async () => {
    setup([soup], { 'POST /api/plan/leftovers/4/had-it?dryRun=1': { replanned: [friLunch] } })
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Soup' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Had it' }))
    const sheet = await screen.findByRole('dialog', { name: 'How many portions of Soup did you have?' })
    expect(await within(sheet).findByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
  })
})

describe('PlanScreen: Leftovers on a Planned Meal', () => {
  const chilliFrozen = frozenChilli({ id: 5, recipeId: 10, recipeName: 'Chilli', portions: 3, useBy: '2027-02-10' })
  const planView = (): PlanView => ({
    today: '2026-11-12', horizonDays: 3, updating: false,
    slots: [
      slot({
        date: '2026-11-12', mealSlotId: 2,
        meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeId: 10, recipeName: 'Chilli', batches: 0, portions: 2, servedFromLeftover: { leftoverId: 5, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chilli' } }),
      }),
    ],
  })

  const openLink = async (leftovers: Leftover[], link: string) => {
    setup(leftovers, {
      'GET /api/plan': planView(),
      'GET /api/recipes/10': { id: 10, frozenUseByDays: null, leftoverUseByDays: null },
      'POST /api/plan/leftovers/5/had-it?dryRun=1': { replanned: [friLunch] },
      'POST /api/plan/leftovers/5/take-out?dryRun=1': { replanned: [friLunch] },
    })
    await userEvent.click(within(await dayTile('Today')).getByRole('button', { name: /Chilli/ }))
    await userEvent.click(await screen.findByRole('button', { name: link }))
    return screen.findByRole('dialog', { name: 'Chilli Leftover' })
  }

  it("the From link opens that Leftover's own sheet: portions, Use-by, Storage Place when frozen, and its actions", async () => {
    const sheet = await openLink([chilliFrozen], "From Mon's Chilli")
    expect(within(sheet).getByText('3 portions · Use by 10 Feb')).toBeInTheDocument()
    expect(within(sheet).getByText('Garage Freezer')).toBeInTheDocument()
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'Close')).toEqual(['Had it', 'Threw it out', 'Take out'])
  })

  it('a Leftover that is not frozen shows no Storage Place and offers Freeze it', async () => {
    const sheet = await openLink([{ ...chilliFrozen, frozen: false, frozenOn: null, storagePlaceId: null, storagePlaceName: null, useBy: '2026-11-14' }], "From Mon's Chilli")
    expect(within(sheet).getByText('3 portions · Use by Sat')).toBeInTheDocument()
    expect(within(sheet).queryByText('Garage Freezer')).toBeNull()
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'Close')).toEqual(['Had it', 'Threw it out', 'Freeze it'])
  })

  it('opens nothing else on its own: no portions question until an action is chosen', async () => {
    await openLink([chilliFrozen], "From Mon's Chilli")
    expect(screen.queryByRole('dialog', { name: 'How many portions of Chilli did you have?' })).toBeNull()
  })

  it('an action there opens the same sheet as the Today and Pantry rows, with the dry run notes', async () => {
    const sheet = await openLink([chilliFrozen], "From Mon's Chilli")
    await userEvent.click(within(sheet).getByRole('button', { name: 'Take out' }))
    const take = await screen.findByRole('dialog', { name: 'Take Chilli out of the freezer?' })
    expect(await within(take).findByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
  })

  it('Choose a Recipe offers From the freezer and pins the Leftover with its id', async () => {
    const slotView = (): PlanView => ({
      today: '2026-11-12', horizonDays: 3, updating: false,
      slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeId: 7, recipeName: 'Roast chicken' }) })],
    })
    const { api } = setup([chilliFrozen], {
      'GET /api/plan': slotView(),
      'GET /api/recipes?course=1': [{ id: 10, name: 'Chilli', tags: [], courses: [{ id: 1 }] }, { id: 7, name: 'Roast chicken', tags: [], courses: [{ id: 1 }] }],
      'PUT /api/plan/2026-11-12/2/1': meal({ recipeId: 10, recipeName: 'Chilli', batches: 0, pinned: true }),
    })
    await userEvent.click(within(await dayTile('Today')).getByRole('button', { name: /Roast chicken/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a Recipe' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a Recipe' })
    const freezer = await within(dialog).findByRole('list', { name: 'From the freezer' })
    expect(within(freezer).getByText('3 portions · Garage Freezer')).toBeInTheDocument()
    await userEvent.click(within(freezer).getByRole('button', { name: /Chilli/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-12/2/1')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/plan/2026-11-12/2/1')[0]?.body).toEqual({ leftoverId: 5 })
  })

  it('a refused pick (past its Use-by, too small) says so in a toast', async () => {
    setup([chilliFrozen], {
      'GET /api/plan': { today: '2026-11-12', horizonDays: 3, updating: false, slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeName: 'Roast chicken' }) })] },
      'GET /api/recipes?course=1': [{ id: 10, name: 'Chilli', tags: [], courses: [{ id: 1 }] }],
      'PUT /api/plan/2026-11-12/2/1': { status: 422, json: { error: { code: 'leftover_too_small', message: 'x' } } },
    })
    await userEvent.click(within(await dayTile('Today')).getByRole('button', { name: /Roast chicken/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a Recipe' }))
    const freezer = await screen.findByRole('list', { name: 'From the freezer' })
    await userEvent.click(within(freezer).getByRole('button', { name: /Chilli/ }))
    expect(await screen.findByText('There are too few portions of Chilli left for that Planned Meal.')).toBeInTheDocument()
  })
})

describe('PlanScreen: a Leftover a Planned Meal is served from', () => {
  it('stays listed in Leftovers to use, with its row menu', async () => {
    const served = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14', plannedPortions: 1 })
    setup([served], {
      'GET /api/plan': {
        today: '2026-11-12', horizonDays: 3, updating: false,
        slots: [slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', mealSlotId: 2, recipeId: 11, recipeName: 'Soup', batches: 0, servedFromLeftover: { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Soup' } }) })],
      },
    })
    const section = (await screen.findByRole('heading', { name: 'Leftovers to use' })).closest('section') as HTMLElement
    expect(within(section).getByText('2 portions · Use by Sat')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Actions for Soup' })).toBeInTheDocument()
  })
})
